import { requireAgent } from "@/lib/protocol/auth";
import { ackAction, fileObjection, getAction, inboxFor, proposeAction } from "@/lib/protocol/actions";
import { insistAction, reviseAction, withdrawAction } from "@/lib/protocol/bargain";
import { reportAction, reportBody } from "@/lib/protocol/report";
import type { HouseAuth } from "@/lib/protocol/bundle";
import { ProtocolError } from "@/lib/protocol/errors";
import { sweep } from "@/lib/protocol/sweep";
import { ABUSE } from "@/lib/protocol/abuse";
import { isRecord } from "@/lib/protocol/parse";
import { LIMITS, overLimitKey } from "@/lib/ops/rate-limit";
import { MCP_INBOX_POLL_SEC, publicOrigin } from "@/lib/mcp/config";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

const TOOLS = [
  {
    name: "get_constitution",
    description: "Read the house constitution the agent must cite.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "propose",
    description:
      `Propose an action with justification and evidence. After this call, poll inbox at least every ${MCP_INBOX_POLL_SEC} seconds until the action is decided. Chat runtimes are not woken.`,
    inputSchema: {
      type: "object",
      required: ["justification"],
      properties: {
        summary: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        justification: { type: "string" },
        evidence: { type: "array" },
        payload: { type: "object" },
      },
    },
  },
  {
    name: "object",
    description: "Object to an open action while the collection window is open. Optional counter_action.",
    inputSchema: {
      type: "object",
      required: ["action_id", "justification"],
      properties: {
        action_id: { type: "string" },
        justification: { type: "string" },
        evidence: { type: "array" },
        counter_action: { type: "object" },
      },
    },
  },
  {
    name: "inbox",
    description:
      `List actions, deadlines, and verdicts for this house. After you propose or object, call this at least every ${MCP_INBOX_POLL_SEC} seconds until the action is decided. Chat runtimes are not woken.`,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "withdraw",
    description: "Proposer only. End the action with no permit and no court.",
    inputSchema: {
      type: "object",
      required: ["action_id"],
      properties: { action_id: { type: "string" } },
    },
  },
  {
    name: "revise",
    description: "Proposer only, after objections. New payload, new revision, wake checkers again.",
    inputSchema: {
      type: "object",
      required: ["action_id", "justification"],
      properties: {
        action_id: { type: "string" },
        summary: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        justification: { type: "string" },
        evidence: { type: "array" },
        payload: { type: "object" },
      },
    },
  },
  {
    name: "insist",
    description: "Proposer only. The only call that opens court on this action.",
    inputSchema: {
      type: "object",
      required: ["action_id"],
      properties: { action_id: { type: "string" } },
    },
  },
  {
    name: "ack",
    description: "Acknowledge a verdict. Required only if this agent proposed or objected.",
    inputSchema: {
      type: "object",
      required: ["action_id"],
      properties: { action_id: { type: "string" } },
    },
  },
  {
    name: "get_action",
    description:
      "Get one action’s lock, court, and whether you may_act with permitted_payload. Same poll duty as inbox after you propose.",
    inputSchema: {
      type: "object",
      required: ["action_id"],
      properties: { action_id: { type: "string" } },
    },
  },
  {
    name: "report",
    description: "After a final allow or deny, POST report to ack that you read it. No did flag.",
    inputSchema: {
      type: "object",
      required: ["action_id"],
      properties: {
        action_id: { type: "string" },
      },
    },
  },
];

export async function handleMcpGet(request: Request): Promise<Response> {
  const auth = await requireAgent(request);
  if ("error" in auth && auth.error) {
    return withCors(auth.error);
  }
  await sweep(auth.principal.id, new Date(), { origin: publicOrigin(request) });
  return withCors(
    Response.json({
      data: {
        protocol: "mcp",
        jsonrpc: "2.0",
        method: "POST",
        tools: TOOLS.map((tool) => tool.name),
        agent: { id: auth.agent.id, name: auth.agent.name, role: auth.agent.role },
      },
    }),
  );
}

export async function handleMcpPost(request: Request): Promise<Response> {
  const auth = await requireAgent(request);
  if ("error" in auth && auth.error) {
    return withCors(auth.error);
  }

  const parsed = await readRpc(request);
  if ("error" in parsed) return parsed.error;

  const { rpc } = parsed;
  const id = rpc.id ?? null;
  try {
    const result = await dispatch(auth, rpc.method ?? "initialize", rpc.params, publicOrigin(request));
    return rpcOk(id, result);
  } catch (error) {
    const message =
      error instanceof ProtocolError ? error.message : error instanceof Error ? error.message : "Internal error";
    return rpcError(id, -32000, message);
  }
}

async function readRpc(request: Request): Promise<{ rpc: Rpc } | { error: Response }> {
  const raw = await request.text();
  if (raw.length > ABUSE.bodyBytes) {
    return { error: rpcError(null, -32600, "Body is too large") };
  }
  if (!raw.trim()) {
    return { rpc: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } };
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
      return { error: rpcError(null, -32600, "JSON-RPC body must be an object") };
    }
    return { rpc: value as Rpc };
  } catch {
    return {
      error: rpcError(
        null,
        -32700,
        'Invalid JSON. Body example: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
      ),
    };
  }
}

async function dispatch(auth: HouseAuth, method: string, params: unknown, origin: string) {
  await sweep(auth.principal.id, new Date(), { origin });
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "foyer", version: "0.3.0" },
    };
  }
  if (method === "notifications/initialized" || method === "initialized") {
    return {};
  }
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: TOOLS };
  if (method === "tools/call") {
    const p = isRecord(params) ? params : {};
    const name = typeof p.name === "string" ? p.name : "";
    const args = isRecord(p.arguments) ? p.arguments : {};
    const data = await callTool(auth, name, args, origin);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
  throw new Error(`Unknown method: ${method}`);
}

async function callTool(auth: HouseAuth, name: string, args: Record<string, unknown>, origin: string) {
  const now = new Date();
  if (name === "get_constitution") {
    return {
      principal_id: auth.principal.id,
      type: auth.principal.type,
      constitution: auth.principal.constitution,
    };
  }
  if (name === "propose") {
    if (await overLimitKey(`propose:agent:${auth.agent.id}`, LIMITS.proposeAgent)) {
      throw new ProtocolError("rate_limited", "Too many proposals from this agent", 429);
    }
    return proposeAction(auth, args, now, { origin });
  }
  if (name === "object") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return fileObjection(auth, actionId, args, now);
  }
  if (name === "withdraw") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return withdrawAction(auth, actionId);
  }
  if (name === "revise") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return reviseAction(auth, actionId, args, now, { origin });
  }
  if (name === "insist") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return insistAction(auth, actionId, now);
  }
  if (name === "inbox") return inboxFor(auth);
  if (name === "ack") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return ackAction(auth, actionId);
  }
  if (name === "get_action") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return getAction(auth, actionId);
  }
  if (name === "report") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return reportAction(auth, actionId, reportBody(args));
  }
  throw new Error(`Unknown tool: ${name}`);
}

function rpcOk(id: string | number | null, result: unknown) {
  return withCors(Response.json({ jsonrpc: "2.0", id, result }));
}

function rpcError(id: string | number | null, code: number, message: string) {
  return withCors(Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 }));
}

export function mcpOptions() {
  return withCors(new Response(null, { status: 204 }));
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}
