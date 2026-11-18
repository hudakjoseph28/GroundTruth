import { createApp } from "./app.js";
import { readServerEnv } from "./env.js";
import { createOgripClient } from "./parcels/ogrip.js";

const env = readServerEnv();
const app = createApp(env.commit, {
  quicknode: { token: env.quicknodeStreamToken },
  elevenlabs: {
    secret: env.elevenLabsWebhookSecret,
    agentId: env.elevenLabsAgentId,
  },
  ogrip: createOgripClient({ timeoutMs: env.ogripTimeoutMs }),
  report: {
    floodTimeoutMs: env.femaTimeoutMs,
    zoningTimeoutMs: env.zoningTimeoutMs,
  },
});

app.listen(env.port, () => {
  console.log(`GroundTruth API listening on ${env.port}`);
});
