# Connect your runtime

Index: [README](../README.md). The product path: an assistant you already have talks to Foyer with an **agent key**. The cabinet writes that key into an MCP block. You paste the block. You do not assemble JSON by hand.

The product watcher is the guardian Foyer provides ([HOSTED.md](HOSTED.md) H1–H5). A live propose queues that review and does not POST hooks. Connect issues a chat key only.

- **Chat (outbound).** Cursor / Claude / ChatGPT / OpenClaw. They propose when a human is in the session. Foyer cannot wake them. Paste MCP.
- **Hook (callback).** Your process, HTTPS URL. Stored, but a live propose does not POST it. The guardian is the reviewer.

A hook POST is JSON `{ action_id, revision, silence_until, inbox_url }` with `x-foyer-timestamp` and `x-foyer-signature: v1=<hmac-sha256 of timestamp + "." + body>`. Load the action through the protocol; do not trust the body alone for the payload.

The cabinet is signed-in only. This path is a live house, not a look-only demo.

## Before you paste

Any action into the world starts as a request here. The house guardian reviews it. When `may_act` is true the assistant does the work with its own tools.

Put these lines in the system prompt (the cabinet copies them for you):

1. Propose, read inbox, withdraw, revise, and insist only through Foyer tools. Do not object. Foyer’s guardian reviews the proposal. Call insist only when the user asks to appeal a denial.
2. After you propose, call inbox at least every 30 seconds until verdict.outcome is allow or deny, or status is withdrawn. Escalated is not the end: keep polling until the house allows or denies. When agent_must says stop, do not call inbox again. Chat runtimes are not woken — this poll is how you learn.
3. When may_act is true and grant.token is set, git push and x402 go only through the foyer-lock tools with that token. Do not use the terminal for those. Foyer does not push, pay, or hold the password. The pay key is not in this chat or in MCP paste. When verdict.outcome is deny, follow agent_must. While status is escalated, do not answer the user; call inbox again.
4. When you propose, cite the house constitution in the justification. If you cite a web page, include the http(s) URL in the text or as evidence { type: "link", value }. The court fetches those pages. Do not pay, book, or message before may_act. When verdict.outcome is deny, follow agent_must. Mention an appeal only when agent_must names a window, and call insist only if the user asks inside that window. After the court has ruled, do not offer another appeal.
5. Keep X-Foyer-Sign-Secret and X-Foyer-Prompt-Sha from Connect on writes. If the house requires signed writes, unsigned tools fail. If prompt_sha does not match, recopy Connect — the owner edited the prompt. Do not put secrets or the prompt in court text.

The lock is tools and keys, not this prompt. Cabinet Connect also pastes `foyer-lock` (local program). Git uses the OS git login; Cursor’s terminal can still push. Pay: put the wallet key in the OS keychain (`foyer.lock` / `pay.x402`), never in the MCP JSON. After a yes the program probes HTTP 402, checks the grant JWT, consumes it, signs, and pays that host.

## MCP

The snippet is standard MCP HTTP. The URL is `/api/mcp`. The same key goes in `Authorization: Bearer agk_…`. Connect also puts `X-Foyer-Sign-Secret` and `X-Foyer-Prompt-Sha` on the snippet. House Rules can require signed writes. If the owner edits the prompt, recopy the block (409). Signatures and the prompt are not sent to court. Rotate in Connect if a paste leaked.

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

A guest with no runtime signs in and connects an assistant. This doc is that paste.
