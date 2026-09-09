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

/** Standard MCP HTTP snippet: URL + bearer key. Not tied to one runtime. */
export function mcpConfig(origin: string, agentKey: string) {
  return JSON.stringify(
    {
      mcpServers: {
        foyer: {
          url: `${origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${agentKey}`,
          },
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
  "Propose, object, read inbox, ack, withdraw, revise, insist, and report only through Foyer tools.",
  `After you propose or object, call inbox at least every ${MCP_INBOX_POLL_SEC} seconds until verdict.outcome is allow or deny, or status is withdrawn. Chat runtimes are not woken — this poll is how you learn.`,
  "When the action is permitted or denied, POST report with no did — that is how you ack the verdict. If you do not report within 5 minutes, the owner is notified that you ignored the flow. When may_act is true, do permitted_payload with your own tools. When verdict.outcome is deny, do nothing.",
  "Cite the house constitution in every justification. If you cite a web page, include the http(s) URL in the text or as evidence { type: \"link\", value }. The court fetches those pages. Do not pay, book, or message before may_act. Hooked agents are woken to object. If phase is bargaining, withdraw, revise, or insist — court runs only after insist.",
];
