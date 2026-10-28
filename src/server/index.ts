import "dotenv/config";
import { sequelize } from "../db/models";
import { createApp } from "./app.js";
import { assertAuthEnv } from "./auth.js";

assertAuthEnv();
// fail at startup if the database is unreachable
await sequelize.authenticate();
const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`API listening on port ${port}`);
});
