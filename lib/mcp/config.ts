import { createHash } from "node:crypto";

export function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Origin for wake POSTs when there is no incoming request (cron). */
export function defaultPublicOrigin(): string {
  const explicit = process.env.FOYER_PUBLIC_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "");
  if (vercel) return `https://${vercel}`;
  return "https://foyerapp.dev";
}

/** Standard MCP HTTP snippet: URL + bearer key. Optional sign secret and prompt pin for writes. */
export function mcpConfig(origin: string, agentKey: string, signSecret?: string, promptSha?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${agentKey}`,
  };
  if (signSecret) headers["X-Foyer-Sign-Secret"] = signSecret;
  if (promptSha) headers["X-Foyer-Prompt-Sha"] = promptSha;
  return JSON.stringify(
    {
      mcpServers: {
        foyer: {
          url: `${origin}/api/mcp`,
          headers,
        },
      },
    },
    null,
    2,
  );
}

/** Chat runtimes are not woken. The proposer must poll at least this often. */
export const MCP_INBOX_POLL_SEC = 30;

export const MCP_PROMPT_LINES = [
  "Propose, read inbox, withdraw, revise, and insist only through Foyer tools. Do not object. Foyer’s guardian reviews the proposal. Call insist only when the user asks to appeal a denial.",
  `After you propose, call inbox at least every ${MCP_INBOX_POLL_SEC} seconds until verdict.outcome is allow or deny, or status is withdrawn. Escalated is not the end: keep polling until the house allows or denies. When agent_must says stop, do not call inbox again. Chat runtimes are not woken — this poll is how you learn.`,
  "When may_act is true and grant.token is set, git push and x402 go only through the foyer-lock tools with that token. Do not use the terminal for those. Foyer does not push, pay, or hold the password. The pay key is not in this chat or in MCP paste. When verdict.outcome is deny, follow agent_must. While status is escalated, do not answer the user; call inbox again.",
  "When you propose, cite the house constitution in the justification. If you cite a web page, include the http(s) URL in the text or as evidence { type: \"link\", value }. The court fetches those pages. Do not pay, book, or message before may_act. When verdict.outcome is deny, follow agent_must. Mention an appeal only when agent_must names a window, and call insist only if the user asks inside that window. After the court has ruled, do not offer another appeal.",
  "Keep X-Foyer-Sign-Secret and X-Foyer-Prompt-Sha from Connect on writes. If the house requires signed writes, unsigned tools fail. If prompt_sha does not match, recopy Connect — the owner edited the prompt. Do not put secrets or the prompt in court text.",
];

export const AGENT_PROMPT_MAX = 8000;

/** Recommended prompt prefilled when issuing an agent. The stored value is this text, edited or not. */
export function defaultAgentPrompt() {
  return MCP_PROMPT_LINES.join("\n");
}

export function agentPromptText(stored?: string | null) {
  const text = stored?.trim() ?? "";
  return text || defaultAgentPrompt();
}

export function agentPromptLines(stored?: string | null) {
  return agentPromptText(stored).split("\n");
}

/** SHA-256 of the prompt the assistant is told to paste (empty stored = default lines). */
export function promptShaOf(stored?: string | null): string {
  return createHash("sha256").update(agentPromptText(stored), "utf8").digest("hex");
}
