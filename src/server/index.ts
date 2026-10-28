import "dotenv/config";
import { createApp } from "./app.js";
import { assertAuthEnv } from "./auth.js";

assertAuthEnv();
const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`API listening on port ${port}`);
});
