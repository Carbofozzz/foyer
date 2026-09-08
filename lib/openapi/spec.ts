import { ACTION_KINDS } from "@/lib/protocol/types";

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
      version: "0.38.0",
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
            summary: { type: "string", maxLength: 500 },
            amount: { type: "number", minimum: 0 },
            currency: { type: "string", maxLength: 8, pattern: "^[A-Za-z]{1,8}$" },
          },
          required: ["summary"],
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
          properties: {
            name: { type: "string" },
            wake: { type: "string", enum: ["outbound", "callback"] },
            callback_url: { type: "string", description: "Required when wake is callback." },
            callback_secret: { type: "string", description: "Optional; generated if omitted on callback." },
          },
        },
        Agent: {
          type: "object",
          properties: {
            id: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            agent_key: { type: "string", description: "Returned once, on registration." },
            wake: { type: "string", enum: ["outbound", "callback", "hosted"] },
            callback_url: { type: "string", nullable: true },
            hook_ok: { type: "boolean" },
            callback_secret: { type: "string", description: "Returned once, when Foyer generated it." },
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
            payload: { $ref: "#/components/schemas/ActionPayload" },
            justification: { type: "string", maxLength: 2000 },
            evidence: {
              type: "array",
              maxItems: 8,
              items: { $ref: "#/components/schemas/EvidenceItem" },
            },
          },
          required: ["payload", "justification"],
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
          description: "Proposer acks a final allow or deny. Empty body is fine.",
          properties: {},
        },
        ActionReport: {
          type: "object",
          properties: {
            at: { type: "string", format: "date-time" },
          },
          required: ["at"],
        },
        AppealRequest: {
          type: "object",
          description: "Principal yes or no on the original proposal.",
          properties: {
            outcome: { type: "string", enum: ["allow", "deny"] },
          },
          required: ["outcome"],
        },
        ConfirmEmailRequest: {
          type: "object",
          properties: { token: { type: "string" } },
          required: ["token"],
        },
        DecideRequest: {
          type: "object",
          properties: {
            token: { type: "string" },
            outcome: { type: "string", enum: ["allow", "deny"] },
          },
          required: ["token", "outcome"],
        },
        Contacts: {
          type: "object",
          properties: {
            email: { oneOf: [{ type: "string" }, { type: "null" }] },
            email_verified: { type: "boolean" },
            telegram: { type: "boolean" },
            telegram_url: { oneOf: [{ type: "string" }, { type: "null" }] },
          },
          required: ["email", "email_verified", "telegram"],
        },
        Verdict: {
          type: "object",
          properties: {
            outcome: {
              type: "string",
              enum: ["allow", "deny", "escalate", "allow_a", "allow_b", "remedy"],
            },
            remedy_action: {
              oneOf: [{ $ref: "#/components/schemas/ActionPayload" }, { type: "null" }],
              description: "Archive only. New verdicts leave this null.",
            },
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
            payload: { $ref: "#/components/schemas/ActionPayload" },
            status: {
              type: "string",
              enum: ["open", "bargaining", "withdrawn", "awaiting_ack", "permitted", "executed", "escalated"],
            },
            revision: { type: "integer" },
            phase: {
              type: "string",
              enum: [
                "collecting",
                "bargaining",
                "in_court",
                "awaiting_ack",
                "permitted",
                "executed",
                "escalated",
                "withdrawn",
              ],
            },
            proposer_can: {
              type: "object",
              properties: {
                withdraw: { type: "boolean" },
                revise: { type: "boolean" },
                insist: { type: "boolean" },
              },
            },
            bargain_until: { type: "string", format: "date-time", nullable: true },
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
              description: "Ack that the proposer read the final allow or deny. Null until they report.",
            },
            created_at: { type: "string", format: "date-time" },
            silence_until: { type: "string", format: "date-time" },
            appeal_until: { type: "string", format: "date-time" },
            held_until: {
              type: "string",
              format: "date-time",
              description: "Unused. Always null.",
            },
            verdict: { oneOf: [{ $ref: "#/components/schemas/Verdict" }, { type: "null" }] },
          },
          required: ["id", "status"],
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
      "/api/actions/{id}/withdraw": {
        parameters: [ID_PARAM],
        post: operation({
          id: "withdrawAction",
          summary: "Proposer ends the action; no permit, no court",
          auth: "agent",
          ok: "Action",
        }),
      },
      "/api/actions/{id}/revise": {
        parameters: [ID_PARAM],
        post: operation({
          id: "reviseAction",
          summary: "Proposer posts a new revision; checkers are woken again",
          auth: "agent",
          body: "ProposeRequest",
          ok: "Action",
        }),
      },
      "/api/actions/{id}/insist": {
        parameters: [ID_PARAM],
        post: operation({
          id: "insistAction",
          summary: "Proposer opens court; tick does not start court",
          auth: "agent",
          ok: "Action",
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
          summary: "Proposer acks a final allow or deny",
          auth: "agent",
          body: "ReportRequest",
          ok: "Action",
        }),
      },
      "/api/cases/{id}/appeal": {
        parameters: [ID_PARAM],
        post: operation({
          id: "appealCase", summary: "Principal sets allow or deny on an escalated case",
          auth: "session",
          body: "AppealRequest",
          ok: "Verdict",
        }),
      },
      "/api/cabinet/{token}/test": {
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        get: operation({
          id: "getTestStage",
          summary: "Cabinet test tab: live loop cards (who called what, court link)",
          auth: "session",
        }),
        post: operation({
          id: "runTestStage",
          summary: "Propose, object, withdraw, revise, insist, decide, or report as a chosen house agent",
          auth: "session",
        }),
      },
      "/api/cabinet/{token}/test/inspect": {
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        get: operation({
          id: "inspectTestStage",
          summary: "Raw GET /actions/:id or /inbox as that agent would see them (this test action only)",
          auth: "session",
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
      "/api/cabinet/{token}/wizard": {
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        post: operation({
          id: "finishCabinetWizard",
          summary: "Save onboarding: constitution, optional agent, optional email",
          auth: "session",
        }),
      },
      "/api/cabinet/{token}/contacts": {
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        get: operation({
          id: "getContacts",
          summary: "House owner email and whether it is confirmed",
          auth: "session",
          ok: "Contacts",
        }),
        post: operation({
          id: "saveContacts",
          summary: "Save email, resend confirm, or unlink Telegram",
          auth: "session",
        }),
      },
      "/api/confirm-email": {
        post: operation({
          id: "confirmEmail",
          summary: "Confirm a house email from the mailed link",
          body: "ConfirmEmailRequest",
        }),
      },
      "/api/decide": {
        get: {
          operationId: "getDecide",
          summary: "Facts for a one-action decide link (no login)",
          parameters: [{ name: "token", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Action still needs yes or no" },
            "410": { description: "Link spent, expired, or already decided" },
          },
        },
        post: operation({
          id: "postDecide",
          summary: "Allow or deny from a decide link (same as cabinet appeal)",
          body: "DecideRequest",
          ok: "Verdict",
        }),
      },
      "/api/telegram": {
        post: {
          operationId: "telegramWebhook",
          summary: "Telegram bot webhook. Cron bearer plus { setup: true } registers setWebhook.",
          responses: {
            "200": { description: "Update accepted" },
            "401": { description: "Missing webhook secret or cron secret" },
          },
        },
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
        get: operation({ id: "tickGet", summary: "Cron sweep (Vercel Cron sends GET)", auth: "cron" }),
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
