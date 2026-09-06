import { requireAgent } from "@/lib/protocol/auth";
import { ackAction, fileObjection, getAction, inboxFor, proposeAction } from "@/lib/protocol/actions";
import { reportAction, reportBody } from "@/lib/protocol/report";
import type { HouseAuth } from "@/lib/protocol/bundle";
import { ProtocolError } from "@/lib/protocol/errors";
import { sweep } from "@/lib/protocol/sweep";
import { ABUSE } from "@/lib/protocol/abuse";
import { isRecord } from "@/lib/protocol/parse";
import { LIMITS, overLimitKey } from "@/lib/ops/rate-limit";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

const TOOLS = [
  {
    name: "get_constitution",
    description: "Read the house constitution the agent must cite.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "propose",
    description: "Propose an action (spend, book, message, cancel) with justification and evidence.",
    inputSchema: {
      type: "object",
      required: ["kind", "justification"],
      properties: {
        kind: { type: "string", enum: ["spend", "book", "message", "cancel"] },
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
    description: "Object to an open action. Optional counter_action.",
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
    description: "List actions, deadlines, and verdicts for this house.",
    inputSchema: { type: "object", properties: {} },
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
    description: "Get one action’s lock, court, and whether you may_act with permitted_payload.",
    inputSchema: {
      type: "object",
      required: ["action_id"],
      properties: { action_id: { type: "string" } },
    },
  },
  {
    name: "report",
    description: "After you act or skip, report { did: true | false } for that action.",
    inputSchema: {
      type: "object",
      required: ["action_id", "did"],
      properties: {
        action_id: { type: "string" },
        did: { type: "boolean" },
      },
    },
  },
];

export async function handleMcpGet(request: Request): Promise<Response> {
  const auth = await requireAgent(request);
  if ("error" in auth && auth.error) {
    return withCors(auth.error);
  }
  await sweep(auth.principal.id, new Date());
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
    const result = await dispatch(auth, rpc.method ?? "initialize", rpc.params);
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

async function dispatch(auth: HouseAuth, method: string, params: unknown) {
  await sweep(auth.principal.id, new Date());
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
    const data = await callTool(auth, name, args);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
  throw new Error(`Unknown method: ${method}`);
}

async function callTool(auth: HouseAuth, name: string, args: Record<string, unknown>) {
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
    return proposeAction(auth, args, now);
  }
  if (name === "object") {
    const actionId = typeof args.action_id === "string" ? args.action_id : "";
    return fileObjection(auth, actionId, args, now);
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
