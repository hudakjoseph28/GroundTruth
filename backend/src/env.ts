export interface ServerEnv {
  databaseUrl: string;
  port: number;
  commit: string;
  /** QuickNode Stream security token; the webhook refuses all deliveries without it. */
  quicknodeStreamToken: string | undefined;
}

export function readServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return {
    databaseUrl,
    port: readPort(source.PORT),
    commit: readCommit(source.GIT_COMMIT),
    quicknodeStreamToken: source.QUICKNODE_STREAM_TOKEN?.trim() || undefined,
  };
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 3001;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("PORT must be an integer");
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
  return port;
}

function readCommit(value: string | undefined): string {
  const commit = value?.trim();
  if (!commit) return "unknown";
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(commit)) {
    throw new Error("GIT_COMMIT contains unsupported characters");
  }
  return commit;
}
