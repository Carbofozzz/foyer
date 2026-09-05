export function openApiSpec(origin: string) {
  const bearer = {
    security: [{ agentKey: [] }],
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "Foyer",
      version: "0.7.0",
      description: "Agent gateway. Every write carries an agent key. The key names the house.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        agentKey: { type: "http", scheme: "bearer", bearerFormat: "agk_" },
        enrollKey: { type: "http", scheme: "bearer", bearerFormat: "enr_" },
      },
    },
    paths: {
      "/api/agents": {
        get: { ...bearer, summary: "List agents in this house" },
        post: {
          security: [{ enrollKey: [] }],
          summary: "Register with a one-time enrollment token",
        },
      },
      "/api/constitution": { get: { ...bearer, summary: "Read the house rules" } },
      "/api/actions": { post: { ...bearer, summary: "Propose an action" } },
      "/api/actions/{id}/objections": { post: { ...bearer, summary: "Object" } },
      "/api/inbox": { get: { ...bearer, summary: "Inbox (also advances sweep)" } },
      "/api/actions/{id}/ack": { post: { ...bearer, summary: "Ack a verdict" } },
      "/api/actions/{id}": { get: { ...bearer, summary: "Read one action" } },
      "/api/cases/{id}/appeal": { post: { summary: "Principal appeal (cabinet session)" } },
      "/api/mcp": { get: { ...bearer, summary: "MCP ping" }, post: { ...bearer, summary: "MCP JSON-RPC" } },
      "/api/tick": { post: { summary: "Cron sweep" } },
    },
  };
}
