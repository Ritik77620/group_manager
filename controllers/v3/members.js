const {drivers: {v2: driver}} = require('../../db.js')

const {
  error_handling,
  get_current_user_id,
  user_query,
  group_query,
  group_id_filter,
  user_id_filter,
  current_user_query,
  return_batch,
  format_batched_response
} = require('../../utils.js')

const {
  default_batch_size
} = require('../../config.js')

exports.get_user = (req, res) => {
  // Route to retrieve a user's info
  // This should not be a feature of group manager
  // but Used in front-end

  let {member_id: user_id} = req.params
  if(user_id === 'self') user_id = get_current_user_id(res)

  if(!user_id) return res.status(400).send('User ID not defined')

  const session = driver.session()

  const query = `${user_query} RETURN properties(user) as user`

  session.run(query, { user_id })
  .then( ({records}) => {

    if(!records.length) {
      console.log(`[neo4J] User ${user_id} not found`)
      return res.status(404).send(`User ${user_id} not found`)
    }

    const user = records[0].get('user')
    delete user.password_hashed

    res.send(user)
    console.log(`User ${user_id} queried`)
   })
  .catch(error => { error_handling(error,res) })
  .finally( () => { session.close() })
}

exports.get_members_of_group = (req, res) => {
  // Route to retrieve a user's groups

  const {group_id} = req.params
  if(!group_id) return res.status(400).send('Group ID not defined')

  const {
    batch_size = default_batch_size,
    start_index = 0,
  } = req.query


  const session = driver.session()

  const query = `
    ${group_query}
    WITH group

    // Optional match so groups with no users can still be queried
    OPTIONAL MATCH (user:User)-[:BELONGS_TO]->(group)

    WITH user as item
    ${return_batch}
    `
  const params = { group_id, batch_size, start_index }

  session.run(query, params)
  .then(({records}) => {
    if(!records.length) throw {code: 404, message: `Member query: group ${group_id} not found`}
    console.log(`Users of group ${group_id} queried`)
    const response = format_batched_response(records)
    res.send(response)
   })
  .catch(error => { error_handling(error,res) })
  .finally( () => { session.close() })
}



exports.add_member_to_group = (req, res) => {
  // Route to make a user join a group

  const {group_id} = req.params
  const {user_id} = req.body

  if(!group_id) return res.status(400).send('Group ID not defined')
  if(!user_id) return res.status(400).send('User ID not defined')

  const current_user_id = get_current_user_id(res)

  const session = driver.session()

  const query = `
    // Find the current user
    ${current_user_query}

    // Find group
    WITH current_user
    ${group_query}
    // Allow only group admin or super admin to delete a group
      AND ( (group)-[:ADMINISTRATED_BY]->(current_user)
        OR current_user.isAdmin )

    // Find the user
    WITH group
    ${user_query}

    // MERGE relationship
    MERGE (user)-[:BELONGS_TO]->(group)

    // Return
    RETURN properties(group) as group
    `

  const params = { current_user_id, user_id, group_id }

  session.run(query, params)
  .then( ({records}) => {

    if(!records.length) throw {code: 404, message: `Error adding using ${user_id} from group ${group_id}`}
    console.log(`User ${current_user_id} added user ${user_id} to group ${group_id}`)

    const group = records[0].get('group')
    res.send(group)
  })
  .catch(error => { error_handling(error,res) })
  .finally( () => { session.close() })
}

exports.remove_user_from_group = (req, res) => {
  // Route to make a user leave a group

  const {group_id, member_id: user_id} = req.params

  if(!group_id) return res.status(400).send('Group ID not defined')
  if(!user_id) return res.status(400).send('User ID not defined')

  const current_user_id = get_current_user_id(res)

  const session = driver.session()

  const query = `
    // Find the current user
    ${current_user_query}

    // Find group
    WITH current_user
    ${group_query}
    AND ( (group)-[:ADMINISTRATED_BY]->(current_user) OR current_user.isAdmin )

    // Find the user
    WITH group
    MATCH (user:User)-[r:BELONGS_TO]->(group)
    ${user_id_filter}

    // delete relationship
    DELETE r

    // Return
    RETURN properties(group) as group
    `

  const params = { current_user_id, user_id, group_id }
  session

  .run(query,params)
  .then( ({records}) => {

    if(!records.length) throw {code: 404, message: `Error removing using ${user_id} from group ${group_id}`}
    console.log(`User ${current_user_id}  removed user ${user_id} from group ${group_id}`)

    const group = records[0].get('group')
    res.send(group)
  })
  .catch(error => { error_handling(error, res) })
  .finally( () => { session.close() })
}


exports.get_groups_of_user = (req, res) => {
  // Route to retrieve a user's groups

  let {member_id: user_id} = req.params
  if(user_id === 'self') user_id = get_current_user_id(res)

  const {
    batch_size = default_batch_size,
    start_index = 0,
  } = req.query

  const session = driver.session()

  const query = `
    ${user_query}
    WITH user
    // OPTIONAL because still want to perform query even if no groups
    OPTIONAL MATCH (user)-[:BELONGS_TO]->(group:Group)
    WITH group as item
    ${return_batch}
    `

  const params = { user_id, batch_size, start_index }


  session.run(query, params)
  .then(({records}) => {
    if(!records.length) throw {code: 404, message: `User ${user_id} not found`}
    console.log(`Groups of user ${user_id} queried`)
    const response = format_batched_response(records)
    res.send(response)
   })
  .catch(error => { error_handling(error, res) })
  .finally( () => { session.close() })
}

exports.users_with_no_group = (req, res) => {
  // Route to retrieve users without a group

  const session = driver.session()

  const {
    batch_size = default_batch_size,
    start_index = 0,
  } = req.query

  const query = `
    MATCH (user:User)
    WHERE NOT (user)-[:BELONGS_TO]->(:Group)
    WITH user as item
    ${return_batch}
    `

  const params = { batch_size, start_index }

  session.run(query, params)
  .then(({records}) => {

    if(!records.length) throw {code: 404, message: `Error getting users with no group`}
    console.log(`Queried users with no group`)

    const response = format_batched_response(records)
    res.send(response)
  })
  .catch(error => { error_handling(error, res) })
  .finally( () => { session.close() })
}
