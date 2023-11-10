import dotenv from "dotenv"
dotenv.config()
import express from "express"
import cors from "cors"
import apiMetrics from "prometheus-api-metrics"
import swaggerUi from "swagger-ui-express"
import swaggerDocument from "./swagger-output.json"
import { version } from "./package.json"
import { init as db_init } from "./db"
import { errorHandler } from "./utils"
import router from "./routes/"

console.log(`= Group manager v${version} =`)

db_init()

const { APP_PORT = 80 } = process.env

export const app = express()
app.use(express.json())
app.use(cors())
app.use(apiMetrics())
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument))
app.use("/", router)
app.use(errorHandler)

app.listen(APP_PORT, () => {
  console.log(`[Express] listening on port ${APP_PORT}`)
})
