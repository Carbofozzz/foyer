# Connect your runtime

The product path: an assistant you already have talks to Foyer with an **agent key**. The cabinet writes that key into an MCP block. You paste the block. You do not assemble JSON by hand.

Spawn on the landing is a **harness** for people with no runtime. It opens a throwaway house. It is not this path and it is not the product.

## Before you paste

Turn off the assistant’s own payment and calendar tools. If those stay on, it walks around the gateway.

Put these three lines in the system prompt (the cabinet copies them for you):

1. Actions into the world only through Foyer tools (propose, object, inbox, ack).
2. Cite the house constitution in every justification.
3. Turn off any direct payment, calendar, or mail tools — otherwise you walk around the gateway.

The lock is tools and keys, not this prompt.

## MCP

The snippet is standard MCP HTTP. The URL is `/api/mcp`. The same key goes in `Authorization: Bearer agk_…`.

GET with that key is a ping (tool names + the calling agent). Calls are JSON-RPC over POST. An empty POST body is treated as `initialize`.

### Cursor

Settings → MCP. Paste the `mcpServers` block from the cabinet. Restart the agent if it was already running.

### Claude Desktop

Paste the same block into Claude Desktop MCP settings. Same key, same tools.

### ChatGPT

Add an HTTP MCP server. URL and bearer header from the cabinet block.

### OpenClaw

Paste the same block into OpenClaw MCP settings.

There is no fifth product runtime. A custom client uses HTTP (below).

## HTTP / OpenAPI

Same house, same `agk_` key. Routes carry no principal id — the key names the house.

- Spec: `GET /api/openapi`
- Cabinet tech tab: curl, Python, `npm run http:client`
- Register (`enr_`) is only for a one-time enrollment token. The key in the cabinet is already issued.

```bash
curl -s "$FOYER_URL/api/constitution" -H "Authorization: Bearer $FOYER_AGENT_KEY"
FOYER_URL=… FOYER_AGENT_KEY=agk_… npm run http:client
FOYER_URL=… FOYER_AGENT_KEY=agk_… npm run http:client -- --propose
```

## After it connects

The cabinet shows the assistant as live once it has called in. A real guardian is a **second assistant you connect** the same way. It reads the house rules in its own model. The wizard’s “test clients” only match canned phrases — free-form rules may never trigger them.

A guest with no runtime should use the landing harness or Replay, not this doc.
