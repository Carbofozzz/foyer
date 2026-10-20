export type BrokerSetup = {
  origin: string;
  agentKey: string;
  hands: string[];
  path: string;
  gitDir: string;
};

const PATH_HOLE = "/full/path/foyer-lock.mjs";

function brokerEnv(setup: BrokerSetup): Record<string, string> {
  const env: Record<string, string> = {
    FOYER_URL: setup.origin.replace(/\/$/, ""),
    FOYER_AGENT_KEY: setup.agentKey,
    FOYER_LOCK_HANDS: setup.hands.join(","),
  };
  if (setup.hands.includes("git.push") && setup.gitDir.trim()) env.FOYER_LOCK_GIT_CWD = setup.gitDir.trim();
  return env;
}

/** The bot block plus the broker beside it, for MCP runtimes that start a local program. */
export function brokerMcpConfig(protocolJson: string, setup: BrokerSetup): string {
  let base: { mcpServers?: Record<string, unknown> };
  try {
    base = JSON.parse(protocolJson) as { mcpServers?: Record<string, unknown> };
  } catch {
    base = {};
  }
  if (!base.mcpServers || typeof base.mcpServers !== "object") base.mcpServers = {};
  base.mcpServers["foyer-lock"] = {
    command: "node",
    args: [setup.path.trim() || PATH_HOLE],
    env: brokerEnv(setup),
  };
  return JSON.stringify(base, null, 2);
}

/** One terminal line for a client that is not an MCP chat. */
export function brokerHttpCommand(setup: BrokerSetup): string {
  const env = Object.entries(brokerEnv(setup))
    .map(([key, value]) => `${key}="${value}"`)
    .join(" \\\n  ");
  return `${env} \\\n  node "${setup.path.trim() || PATH_HOLE}" --http`;
}

export const BROKER_HTTP_CALL = `curl -s http://127.0.0.1:8788/call \\
  -H 'content-type: application/json' \\
  -d '{"name":"git_push","arguments":{"grant":"<grant.token>","repo":"origin","ref":"feat/x"}}'`;

export const AP2_KEY_COMMAND = `security add-generic-password -U -s foyer.lock -a pay.ap2 -w "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"`;

export const X402_KEYCHAIN_COMMAND = `security add-generic-password -U -s foyer.lock -a pay.x402 -w '0x…'`;
