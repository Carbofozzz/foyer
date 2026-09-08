# Connect your runtime

The product path: an assistant you already have talks to Foyer with an **agent key**. The cabinet writes that key into an MCP block. You paste the block. You do not assemble JSON by hand.

There are two kinds:

- **Chat (outbound).** Cursor / Claude / ChatGPT / OpenClaw. They propose when a human is in the session. Foyer cannot wake them. Paste MCP.
- **Hook (callback).** Your process, HTTPS URL required — Foyer POSTs on propose. These are the checkers.

A hook POST is JSON `{ action_id, revision, silence_until, inbox_url }` with `x-foyer-timestamp` and `x-foyer-signature: v1=<hmac-sha256 of timestamp + "." + body>`. Load the action through the protocol; do not trust the body alone for the payload.

Several chats do not replace one hooked agent. Silence among chats is consent.

Spawn on the landing is a **harness** for people with no runtime. It opens a throwaway house. It is not this path and it is not the product.

## Before you paste

Any action into the world starts as a request here. After a final allow or deny the assistant acks with `report`, then does the work with its own tools if `may_act`.

Put these lines in the system prompt (the cabinet copies them for you):

1. Propose, object, read inbox, ack, withdraw, revise, insist, and report only through Foyer tools.
2. After you propose or object, call inbox at least every 30 seconds until verdict.outcome is allow or deny, or status is withdrawn. Chat runtimes are not woken — this poll is how you learn.
3. When the action is permitted or denied, POST report with no did — that is how you ack the verdict. If you do not report within 5 minutes, the owner is notified that you ignored the flow. When may_act is true, do permitted_payload with your own tools. When verdict.outcome is deny, do nothing.
4. Cite the house constitution in every justification. Do not pay, book, or message before may_act. Hooked agents are woken to object. If phase is bargaining, withdraw, revise, or insist — court runs only after insist.

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

The cabinet shows the assistant as live once it has called in. A checker is a hooked process, not a second chat window.

A guest with no runtime should use the landing harness or Replay, not this doc.
