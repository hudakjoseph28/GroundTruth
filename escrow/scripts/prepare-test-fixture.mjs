#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const escrowRoot = path.resolve(__dirname, "..");

// 1. Resolve configured wallet path
let walletPath = process.env.ANCHOR_WALLET;
if (!walletPath) {
  walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
} else if (walletPath.startsWith("~")) {
  walletPath = path.join(os.homedir(), walletPath.slice(1));
}

// 2. Ensure local wallet exists; if not, create a non-interactive local keypair
if (!fs.existsSync(walletPath)) {
  fs.mkdirSync(path.dirname(walletPath), { recursive: true });
  console.log(`Generating local test keypair at ${walletPath}...`);
  execSync(`solana-keygen new --no-bip39-passphrase --silent --outfile "${walletPath}"`);
}

// 3. Extract public key bytes (bytes 32..64 of Solana 64-byte keypair JSON)
const keypairBytes = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
const pubkeyBytes = Buffer.from(keypairBytes.slice(32, 64));

// 4. Construct 82-byte SPL Mint data
// Devnet Circle USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
// 0..4: Option::Some (1)
// 4..36: mint_authority pubkey
// 36..44: supply (u64 LE)
// 44: decimals = 6
// 45: is_initialized = 1
// 46..50: Option::None (0)
// 50..82: zeros
const mintData = Buffer.alloc(82);
mintData.writeUInt32LE(1, 0); // COption::Some
pubkeyBytes.copy(mintData, 4); // mint authority = local test wallet
mintData.writeBigUInt64LE(1_000_000_000_000_000n, 36); // initial supply
mintData.writeUInt8(6, 44); // decimals = 6
mintData.writeUInt8(1, 45); // is_initialized = true
mintData.writeUInt32LE(0, 46); // freeze authority = None

const accountFixture = {
  pubkey: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  account: {
    lamports: 1_000_000_000, // 1 SOL (rent-exempt)
    data: [mintData.toString("base64"), "base64"],
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    executable: false,
    rentEpoch: 0,
    space: 82,
  },
};

// 5. Write to .anchor/usdc_mint.json
const outputDir = path.join(escrowRoot, ".anchor");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "usdc_mint.json");
fs.writeFileSync(outputPath, JSON.stringify(accountFixture, null, 2));

console.log(`[fixture] Wrote local test USDC mint fixture to ${outputPath}`);
