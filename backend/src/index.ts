import { createApp } from "./app.js";
import { readServerEnv } from "./env.js";

const env = readServerEnv();
const app = createApp(env.commit);

app.listen(env.port, () => {
  console.log(`GroundTruth API listening on ${env.port}`);
});
