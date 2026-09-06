export function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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

export const MCP_PROMPT_LINES = [
  "Propose, object, read inbox, ack, and report only through Foyer tools.",
  "When inbox says may_act, do permitted_payload with your own tools, then report { did: true }. If you skip, report { did: false }.",
  "Cite the house constitution in every justification. Do not pay, book, or message before may_act. A pass is permission — Foyer does not do the act.",
];
