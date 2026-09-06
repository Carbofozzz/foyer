import { ACTION_KINDS, OUTCOMES } from "@/lib/protocol/types";

type Operation = {
  id: string;
  summary: string;
  /** `agk_` key, a one-time `enr_` token, the cabinet cookie, or the cron secret. */
  auth?: "agent" | "enroll" | "session" | "cron";
  body?: string;
  ok?: string;
  created?: boolean;
};

const ID_PARAM = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

function operation(input: Operation) {
  const responses: Record<string, unknown> = {
    [input.created ? "201" : "200"]: {
      description: input.summary,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { data: input.ok ? { $ref: `#/components/schemas/${input.ok}` } : {} },
            required: ["data"],
          },
        },
      },
    },
  };
  if (input.auth) {
    responses["401"] = { $ref: "#/components/responses/Unauthorized" };
  }
  return {
    operationId: input.id,
    summary: input.summary,
    ...(input.auth === "agent" ? { security: [{ agentKey: [] }] } : {}),
    ...(input.auth === "enroll" ? { security: [{ enrollKey: [] }] } : {}),
    ...(input.auth === "session" ? { security: [{ cabinetSession: [] }] } : {}),
    ...(input.auth === "cron" ? { security: [{ cronSecret: [] }] } : {}),
    ...(input.body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: `#/components/schemas/${input.body}` } } },
          },
        }
      : {}),
    responses,
  };
}

export function openApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Foyer",
      version: "0.16.0",
      description:
        "Agent gateway. Every write carries an agent key. The key names the house, so no route takes a principal id.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        agentKey: { type: "http", scheme: "bearer", bearerFormat: "agk_" },
        enrollKey: { type: "http", scheme: "bearer", bearerFormat: "enr_" },
        cabinetSession: { type: "apiKey", in: "cookie", name: "foyer_session" },
        cronSecret: { type: "http", scheme: "bearer", bearerFormat: "CRON_SECRET" },
      },
      responses: {
        Unauthorized: {
          description: "Missing or unknown key",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" } },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
        ActionPayload: {
          type: "object",
          description: "What the agent may perform after a pass. Foyer does not pay or book.",
          properties: {
            kind: { type: "string", enum: [...ACTION_KINDS] },
            summary: { type: "string", maxLength: 500 },
            amount: { type: "number", minimum: 0 },
            currency: { type: "string", maxLength: 8, pattern: "^[A-Za-z]{1,8}$" },
          },
          required: ["kind", "summary"],
        },
        EvidenceItem: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["text", "link", "stub"] },
            value: { type: "string", maxLength: 2000 },
          },
          required: ["type", "value"],
        },
        RegisterRequest: {
          type: "object",
          properties: { name: { type: "string" } },
        },
        Agent: {
          type: "object",
          properties: {
            id: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            agent_key: { type: "string", description: "Returned once, on registration." },
          },
          required: ["id", "role", "name"],
        },
        AgentList: { type: "array", items: { $ref: "#/components/schemas/Agent" } },
        Constitution: {
          type: "object",
          properties: {
            constitution: { type: "string" },
            locked_kinds: { type: "array", items: { type: "string", enum: [...ACTION_KINDS] } },
          },
          required: ["constitution"],
        },
        ProposeRequest: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...ACTION_KINDS] },
            payload: { $ref: "#/components/schemas/ActionPayload" },
            justification: { type: "string", maxLength: 2000 },
            evidence: {
              type: "array",
              maxItems: 8,
              items: { $ref: "#/components/schemas/EvidenceItem" },
            },
          },
          required: ["kind", "payload", "justification"],
        },
        ObjectionRequest: {
          type: "object",
          description: "Leave counter_action null for a pure block.",
          properties: {
            justification: { type: "string", maxLength: 2000 },
            evidence: { type: "array", items: { $ref: "#/components/schemas/EvidenceItem" } },
            counter_action: { oneOf: [{ $ref: "#/components/schemas/ActionPayload" }, { type: "null" }] },
          },
          required: ["justification"],
        },
        ReportRequest: {
          type: "object",
          description: "The agent says whether it performed the permitted payload.",
          properties: {
            did: { type: "boolean" },
          },
          required: ["did"],
        },
        ActionReport: {
          type: "object",
          properties: {
            did: { type: "boolean" },
            result: { type: "string", enum: ["did", "skipped", "broke"] },
            at: { type: "string", format: "date-time" },
          },
          required: ["did", "result"],
        },
        AppealRequest: {
          type: "object",
          description: "Re-judge from the constitution snapshot, or set the outcome yourself.",
          properties: {
            note: { type: "string" },
            outcome: { type: "string", enum: [...OUTCOMES] },
          },
        },
        Verdict: {
          type: "object",
          properties: {
            outcome: { type: "string", enum: [...OUTCOMES] },
            remedy_action: { oneOf: [{ $ref: "#/components/schemas/ActionPayload" }, { type: "null" }] },
            reasoning: { type: "string" },
            objection_grounded: { type: "boolean" },
            judge: { type: "string", enum: ["onchain", "offline"] },
            tx: { oneOf: [{ type: "string" }, { type: "null" }] },
            escalate_external: {
              type: "boolean",
              description: "Reserved for a later bridge to an external court. Always false for now.",
            },
          },
          required: ["outcome", "objection_grounded", "judge"],
        },
        Action: {
          type: "object",
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: [...ACTION_KINDS] },
            payload: { $ref: "#/components/schemas/ActionPayload" },
            status: {
              type: "string",
              enum: ["open", "awaiting_ack", "permitted", "executed", "escalated", "cancelled"],
            },
            may_act: {
              type: "boolean",
              description: "True when the agent may perform permitted_payload with its own tools.",
            },
            permitted_payload: {
              oneOf: [{ $ref: "#/components/schemas/ActionPayload" }, { type: "null" }],
              description: "What the agent may do. Null on a pure block.",
            },
            report: {
              oneOf: [{ $ref: "#/components/schemas/ActionReport" }, { type: "null" }],
              description: "What the agent said it did. Null until it reports.",
            },
            silence_until: { type: "string", format: "date-time" },
            appeal_until: { type: "string", format: "date-time" },
            held_until: {
              type: "string",
              format: "date-time",
              description: "Set when an irreversible kind is waiting for the appeal window.",
            },
            verdict: { oneOf: [{ $ref: "#/components/schemas/Verdict" }, { type: "null" }] },
          },
          required: ["id", "kind", "status"],
        },
        Inbox: {
          type: "object",
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/Action" } },
          },
          required: ["items"],
        },
        WaitlistRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            locale: { type: "string", enum: ["en", "es", "de", "tr", "ru"] },
          },
          required: ["email"],
        },
        WaitlistOk: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    },
    paths: {
      "/api/agents": {
        get: operation({ id: "listAgents", summary: "List agents in this house", auth: "agent", ok: "AgentList" }),
        post: operation({
          id: "registerAgent", summary: "Register with a one-time enrollment token",
          auth: "enroll",
          body: "RegisterRequest",
          ok: "Agent",
          created: true,
        }),
      },
      "/api/constitution": {
        get: operation({ id: "getConstitution", summary: "Read the house rules", auth: "agent", ok: "Constitution" }),
      },
      "/api/actions": {
        post: operation({
          id: "proposeAction", summary: "Propose an action; silence in the window is consent",
          auth: "agent",
          body: "ProposeRequest",
          ok: "Action",
          created: true,
        }),
      },
      "/api/actions/{id}/objections": {
        parameters: [ID_PARAM],
        post: operation({
          id: "fileObjection", summary: "Object, with a counter action or as a pure block",
          auth: "agent",
          body: "ObjectionRequest",
          ok: "Action",
          created: true,
        }),
      },
      "/api/inbox": {
        get: operation({ id: "getInbox", summary: "Open actions for this agent; also advances the sweep", auth: "agent", ok: "Inbox" }),
      },
      "/api/actions/{id}/ack": {
        parameters: [ID_PARAM],
        post: operation({ id: "ackAction", summary: "Ack a verdict", auth: "agent", ok: "Action" }),
      },
      "/api/actions/{id}": {
        parameters: [ID_PARAM],
        get: operation({ id: "getAction", summary: "Read one action with its verdict", auth: "agent", ok: "Action" }),
      },
      "/api/actions/{id}/report": {
        parameters: [ID_PARAM],
        post: operation({
          id: "reportAction",
          summary: "Agent reports whether it performed the permitted payload",
          auth: "agent",
          body: "ReportRequest",
          ok: "Action",
        }),
      },
      "/api/cases/{id}/appeal": {
        parameters: [ID_PARAM],
        post: operation({
          id: "appealCase", summary: "Principal appeal (cabinet session, not an agent key)",
          auth: "session",
          body: "AppealRequest",
          ok: "Verdict",
        }),
      },
      "/api/cabinet/{token}/members": {
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        get: operation({
          id: "listMembers",
          summary: "People who can open this house with their wallet",
          auth: "session",
        }),
        post: operation({
          id: "inviteMember",
          summary: "Invite a wallet as operator or observer (owner only, org only)",
          auth: "session",
          created: true,
        }),
      },
      "/api/mcp": {
        get: operation({ id: "mcpPing", summary: "MCP ping: tool names and the calling agent", auth: "agent" }),
        post: operation({ id: "mcpRpc", summary: "MCP JSON-RPC over HTTP; the same protocol tools", auth: "agent" }),
      },
      "/api/health": {
        get: {
          operationId: "getHealth",
          summary: "Database ping and last cron tick; 503 if the store is down",
          responses: {
            "200": { description: "Store is reachable" },
            "503": { description: "Store is down" },
          },
        },
      },
      "/api/tick": {
        post: operation({ id: "tick", summary: "Cron sweep for every house", auth: "cron" }),
      },
      "/api/waitlist": {
        get: operation({
          id: "listWaitlist",
          summary: "List waitlist emails (cron secret)",
          auth: "cron",
        }),
        post: operation({
          id: "joinWaitlist",
          summary: "Join the public-test waitlist; the same email twice is a no-op",
          body: "WaitlistRequest",
          ok: "WaitlistOk",
          created: true,
        }),
      },
    },
  };
}
