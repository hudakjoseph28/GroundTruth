import { createDevnetChain } from "./actions/devnetChain.js";
import { createApp } from "./app.js";
import { readServerEnv } from "./env.js";
import { createOgripClient } from "./parcels/ogrip.js";
import { createTwilioSender } from "./sms/sender.js";

const env = readServerEnv();
const devnet = createDevnetChain(env.solanaRpcUrl);
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
    accessTimeoutMs: env.accessTimeoutMs,
    wetlandsTimeoutMs: env.wetlandsTimeoutMs,
    streamBuffersTimeoutMs: env.streamBuffersTimeoutMs,
    utilitiesTimeoutMs: env.utilitiesTimeoutMs,
  },
  sms: { sender: env.twilio ? createTwilioSender(env.twilio) : undefined },
  // One devnet reader for both: the reviewer Blink and Solana Pay funding.
  actions: { chain: devnet },
  solanaPay: { chain: devnet },
});

app.listen(env.port, () => {
  console.log(`GroundTruth API listening on ${env.port}`);
});
