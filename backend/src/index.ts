import { createApp } from "./app.js";
import { readServerEnv } from "./env.js";
import { createOgripClient } from "./parcels/ogrip.js";

const env = readServerEnv();
const app = createApp(env.commit, {
  quicknode: { token: env.quicknodeStreamToken },
  ogrip: createOgripClient({ timeoutMs: env.ogripTimeoutMs }),
  report: { floodTimeoutMs: env.femaTimeoutMs },
});

app.listen(env.port, () => {
  console.log(`GroundTruth API listening on ${env.port}`);
});
