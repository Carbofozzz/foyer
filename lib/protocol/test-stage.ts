import { and, desc, eq, isNotNull } from "drizzle-orm";
import { actions, agents, cases, objections, wakes } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { txExplorerUrl } from "@/lib/gen/chain";
import { publicOrigin } from "@/lib/mcp/config";
import { proposeAction, fileObjection, getAction, inboxFor } from "./actions";
import { insistAction, reviseAction, withdrawAction } from "./bargain";
import { appealCase } from "./appeal";
import { reportAction } from "./report";
import { lockedKinds, serializeAction, type HousePrincipal } from "./bundle";
import { executeAfterAck } from "./execute";
import { ProtocolError } from "./errors";
import { isRecord } from "./parse";
import { sweep } from "./sweep";
import { MAX_REVISION } from "./types";

type SerializedAction = ReturnType<typeof serializeAction>;

export type StageAgent = {
  id: string;
  name: string;
  role: string;
  wake: string;
};

export type StageHandle = {
  id: string;
  kind: "did" | "can" | "see";
  tool: string;
  method: string;
  path: string;
  snapshot: Record<string, unknown> | null;
};

export type StageActor = {
  agent_id: string | null;
  name: string;
  wake: string | null;
  rule: string;
  handles: StageHandle[];
};

export type StageEvent = {
  id: string;
  at: string;
  code: string;
  agent_id: string | null;
  name: string | null;
  text: string | null;
  why: string;
  tone: "active" | "history" | "service";
  actors: StageActor[];
  court_tx: string | null;
  court_href: string | null;
};

export type StageWake = {
  agent_id: string;
  name: string;
  status: string;
};

function agentIdOf(body: Record<string, unknown>): string {
  const id = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  if (!id) throw new ProtocolError("bad_request", "agent_id is required", 400);
  return id;
}

function actionIdOf(body: Record<string, unknown>): string {
  const id = typeof body.action_id === "string" ? body.action_id.trim() : "";
  if (!id) throw new ProtocolError("bad_request", "action_id is required", 400);
  return id;
}

function summaryOf(body: Record<string, unknown>, key: string): string {
  const text = typeof body[key] === "string" ? body[key].trim() : "";
  if (!text) throw new ProtocolError("bad_request", `${key} is required`, 400);
  return text;
}

async function listStageAgents(principalId: string): Promise<StageAgent[]> {
  const rows = await getDb()
    .select()
    .from(agents)
    .where(
      and(eq(agents.principalId, principalId), eq(agents.isGuardian, false), isNotNull(agents.sealedKey)),
    );
  return rows.map((row) => ({ id: row.id, name: row.name, role: row.role, wake: row.wake }));
}

async function stageAgent(principal: HousePrincipal, agentId: string) {
  const [row] = await getDb()
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.principalId, principal.id)))
    .limit(1);
  if (!row?.sealedKey) throw new ProtocolError("not_found", "Unknown assistant", 404);
  if (row.isGuardian) {
    throw new ProtocolError("not_found", "Unknown assistant", 404);
  }
  return row;
}

async function latestTestActionId(principalId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: actions.id })
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.testPass, true)))
    .orderBy(desc(actions.createdAt))
    .limit(1);
  return row?.id ?? null;
}

function isLive(serialized: SerializedAction): boolean {
  if (serialized.status === "open" || serialized.status === "bargaining" || serialized.status === "escalated") {
    return true;
  }
  if (serialized.phase === "in_court") return true;
  return serialized.status === "permitted" && !serialized.report;
}

function courtOf(serialized: SerializedAction): { court_tx: string | null; court_href: string | null } {
  const tx = serialized.case?.tx || serialized.verdict?.tx || null;
  return { court_tx: tx, court_href: tx ? txExplorerUrl(tx) : null };
}

function handle(
  kind: StageHandle["kind"],
  tool: string,
  method: string,
  path: string,
  snapshot: Record<string, unknown> | null = null,
): StageHandle {
  return { id: `${kind}-${method}-${tool}-${path}`, kind, tool, method, path, snapshot };
}

function actor(
  agent: { id: string | null; name: string; wake: string | null },
  rule: string,
  handles: StageHandle[],
): StageActor {
  return { agent_id: agent.id, name: agent.name, wake: agent.wake, rule, handles };
}

function inboxOf(action: Record<string, unknown>) {
  return { items: [{ type: "action", ...action }] };
}

function canon(
  serialized: SerializedAction,
  moment: "collect" | "objected" | "bargain" | "court" | "verdict" | "withdrawn",
  objections: SerializedAction["objections"] = serialized.objections,
): Record<string, unknown> {
  const base = {
    id: serialized.id,
    payload: serialized.payload,
    justification: serialized.justification,
    revision: serialized.revision,
    silence_until: serialized.silence_until,
    test_pass: true,
    proposer_id: serialized.proposer_id,
  };
  if (moment === "collect") {
    return {
      ...base,
      status: "open",
      phase: "collecting",
      bargain_until: null,
      insisted_at: null,
      may_act: false,
      permitted_payload: null,
      objections: [],
      case: null,
      verdict: null,
      proposer_can: { withdraw: true, revise: false, insist: false },
    };
  }
  if (moment === "objected") {
    return {
      ...base,
      status: "open",
      phase: "collecting",
      bargain_until: null,
      insisted_at: null,
      may_act: false,
      permitted_payload: null,
      objections,
      case: null,
      verdict: null,
      proposer_can: { withdraw: true, revise: false, insist: false },
    };
  }
  if (moment === "bargain") {
    return {
      ...base,
      status: "bargaining",
      phase: "bargaining",
      bargain_until: serialized.bargain_until,
      insisted_at: null,
      may_act: false,
      permitted_payload: null,
      objections,
      case: null,
      verdict: null,
      proposer_can: {
        withdraw: true,
        revise: serialized.revision < MAX_REVISION,
        insist: objections.length > 0,
      },
    };
  }
  if (moment === "withdrawn") {
    return {
      ...base,
      status: "withdrawn",
      phase: "withdrawn",
      bargain_until: null,
      insisted_at: null,
      may_act: false,
      permitted_payload: null,
      objections,
      case: null,
      verdict: null,
      proposer_can: { withdraw: false, revise: false, insist: false },
    };
  }
  if (moment === "court") {
    return {
      ...base,
      status: serialized.status,
      phase: "in_court",
      bargain_until: serialized.bargain_until,
      insisted_at: serialized.insisted_at,
      may_act: false,
      permitted_payload: null,
      objections,
      case: serialized.case,
      verdict: null,
      proposer_can: { withdraw: false, revise: false, insist: false },
    };
  }
  return {
    ...base,
    status: serialized.status,
    phase: serialized.phase,
    bargain_until: serialized.bargain_until,
    insisted_at: serialized.insisted_at,
    may_act: serialized.may_act,
    permitted_payload: serialized.permitted_payload,
    objections,
    case: serialized.case,
    verdict: serialized.verdict,
    proposer_can: serialized.proposer_can,
    report: serialized.report,
  };
}

function reportOwed(serialized: SerializedAction): boolean {
  return serialized.status === "permitted" && !serialized.report;
}

function reportLate(serialized: SerializedAction): boolean {
  if (!reportOwed(serialized) || !serialized.ack_until) return false;
  return Date.parse(serialized.ack_until) <= Date.now();
}

function pushReportStep(
  events: StageEvent[],
  serialized: SerializedAction,
  proposer: { id: string; name: string; wake: string },
  actionPath: string,
  snap: Record<string, unknown>,
) {
  if (!reportOwed(serialized) && !serialized.report) return;
  if (serialized.report) {
    events.push(
      eventOf({
        id: `report-${serialized.id}`,
        at: serialized.report.at,
        code: "reported",
        agent_id: proposer.id,
        name: proposer.name,
        why: "reported",
        tone: "history",
        actors: [
          actor(proposer, serialized.verdict?.outcome === "deny" ? "stopped" : "stopped_allow", [
            handle("did", "report", "POST", `${actionPath}/report`),
            handle("see", "get_action", "GET", actionPath, snap),
          ]),
        ],
      }),
    );
    return;
  }
  const late = reportLate(serialized);
  if (late) {
    events.push(
      eventOf({
        id: `report-due-${serialized.id}`,
        at: serialized.ack_until ?? serialized.silence_until,
        code: "report_miss",
        agent_id: proposer.id,
        name: proposer.name,
        why: "report_miss",
        tone: "service",
        actors: [],
      }),
    );
    return;
  }
  events.push(
    eventOf({
      id: `report-due-${serialized.id}`,
      at: serialized.ack_until ?? serialized.silence_until,
      code: "report",
      agent_id: proposer.id,
      name: proposer.name,
      why: "report",
      tone: "active",
      actors: [
        actor(proposer, "report_due", [
          handle("see", "get_action", "GET", actionPath, snap),
          handle("can", "report", "POST", `${actionPath}/report`),
        ]),
      ],
    }),
  );
}

function eventOf(
  partial: Omit<StageEvent, "actors" | "court_tx" | "court_href" | "why" | "text" | "tone"> & {
    actors?: StageActor[];
    why: string;
    text?: string | null;
    tone?: StageEvent["tone"];
  },
  court: { court_tx: string | null; court_href: string | null } = { court_tx: null, court_href: null },
): StageEvent {
  return { actors: [], text: null, tone: "history", ...partial, ...court };
}

async function buildEvents(
  serialized: SerializedAction,
  houseAgents: StageAgent[],
): Promise<{ events: StageEvent[]; wakes: StageWake[] }> {
  const names = new Map(houseAgents.map((row) => [row.id, row.name]));
  const wakesById = new Map(houseAgents.map((row) => [row.id, row.wake]));
  const proposer = {
    id: serialized.proposer_id,
    name: names.get(serialized.proposer_id) ?? serialized.proposer_id,
    wake: wakesById.get(serialized.proposer_id) ?? "outbound",
  };
  const others = houseAgents.filter((row) => row.id !== serialized.proposer_id);
  const callbacks = others.filter((row) => row.wake === "callback");
  const wakeRows =
    serialized.id.length === 0
      ? []
      : await getDb()
          .select()
          .from(wakes)
          .where(and(eq(wakes.actionId, serialized.id), eq(wakes.revision, serialized.revision)));
  const stageWakes: StageWake[] = wakeRows.map((row) => ({
    agent_id: row.agentId,
    name: names.get(row.agentId) ?? row.agentId,
    status: row.status,
  }));
  const actionPath = `/api/actions/${serialized.id}`;
  const collect = canon(serialized, "collect");
  const events: StageEvent[] = [];
  events.push(
    eventOf({
      id: `proposed-${serialized.id}-${serialized.revision}`,
      at: serialized.created_at,
      code: "proposed",
      agent_id: proposer.id,
      name: proposer.name,
      text: typeof serialized.justification === "string" ? serialized.justification : null,
      why: "proposed",
      tone: serialized.status === "open" && !serialized.insisted_at ? "active" : "history",
      actors: [
        actor(proposer, "collecting", [
          handle("did", "propose", "POST", "/api/actions"),
          handle("see", "get_action", "GET", actionPath, collect),
          handle("see", "inbox", "GET", "/api/inbox", inboxOf(collect)),
          handle("can", "withdraw", "POST", `${actionPath}/withdraw`),
        ]),
      ],
    }),
  );
  events.push(
    eventOf({
      id: `wakes-${serialized.id}-${serialized.revision}`,
      at: serialized.created_at,
      code: "wakes",
      agent_id: null,
      name: callbacks.map((row) => row.name).join(", ") || others.map((row) => row.name).join(", ") || null,
      why: "wakes",
      tone: "service",
      actors: [],
    }),
  );
  const filed =
    serialized.objections.length === 0
      ? []
      : await getDb()
          .select({ id: objections.id, createdAt: objections.createdAt })
          .from(objections)
          .where(eq(objections.actionId, serialized.id));
  const filedAt = new Map(filed.map((row) => [row.id, row.createdAt.toISOString()]));
  serialized.objections.forEach((row, index) => {
    const objector = {
      id: row.objector_id,
      name: names.get(row.objector_id) ?? row.objector_id,
      wake: wakesById.get(row.objector_id) ?? "callback",
    };
    const until = serialized.objections.slice(0, index + 1);
    const snap = canon(serialized, "objected", until);
    events.push(
      eventOf({
        id: `obj-${row.id}`,
        at: filedAt.get(row.id) ?? serialized.created_at,
        code: "objected",
        agent_id: objector.id,
        name: objector.name,
        text: typeof row.justification === "string" ? row.justification : null,
        why: "objected",
        tone: "history",
        actors: [
          actor(proposer, "watch_state", [
            handle("see", "get_action", "GET", actionPath, snap),
            handle("see", "inbox", "GET", "/api/inbox", inboxOf(snap)),
          ]),
        ],
      }),
    );
  });
  const court = courtOf(serialized);
  const didInsist = Boolean(serialized.insisted_at);
  const courtAt = serialized.insisted_at ?? serialized.created_at;
  const courtSnap = canon(serialized, "court");
  const verdictSnap = canon(serialized, "verdict");
  const verdict = serialized.verdict;
  const outcome = verdict?.outcome;
  const settled = outcome === "allow" || outcome === "allow_a" || outcome === "deny";
  const humanAsked = serialized.status === "escalated" && !settled;
  const humanOutcome =
    Boolean(verdict?.appeal_of) &&
    verdict?.judge === "offline" &&
    verdict?.reasoning === "The principal set the outcome.";
  if (serialized.status === "withdrawn") {
    events.push(
      eventOf({
        id: `withdrawn-${serialized.id}`,
        at: serialized.created_at,
        code: "withdrawn",
        agent_id: proposer.id,
        name: proposer.name,
        why: "withdrawn",
        tone: "history",
        actors: [
          actor(proposer, "stopped_withdrawn", [
            handle("did", "withdraw", "POST", `${actionPath}/withdraw`),
            handle("see", "get_action", "GET", actionPath, canon(serialized, "withdrawn")),
          ]),
        ],
      }),
    );
    return { events, wakes: stageWakes };
  }
  if (didInsist) {
    events.push(
      eventOf(
        {
          id: `court-${serialized.id}`,
          at: courtAt,
          code: "court",
          agent_id: proposer.id,
          name: proposer.name,
          why: "court",
          tone: "history",
          actors: [
            actor(proposer, "wait_verdict", [
              handle("did", "insist", "POST", `${actionPath}/insist`),
              handle("see", "get_action", "GET", actionPath, courtSnap),
              handle("see", "inbox", "GET", "/api/inbox", inboxOf(courtSnap)),
            ]),
          ],
        },
        court,
      ),
    );
  }
  if (humanAsked) {
    events.push(
      eventOf({
        id: `esc-${serialized.id}`,
        at: serialized.bargain_until ?? serialized.silence_until,
        code: "you",
        agent_id: proposer.id,
        name: proposer.name,
        why: didInsist ? "you" : "you_timeout",
        tone: "active",
        actors: [
          actor(proposer, "watch_state", [
            handle("see", "get_action", "GET", actionPath, verdictSnap),
            handle("see", "inbox", "GET", "/api/inbox", inboxOf(verdictSnap)),
          ]),
        ],
      }),
    );
  }
  if (serialized.status === "permitted" && !verdict && serialized.objections.length === 0) {
    events.push(
      eventOf({
        id: `silence-${serialized.id}`,
        at: serialized.silence_until,
        code: "silence_allow",
        agent_id: proposer.id,
        name: proposer.name,
        why: "silence",
        tone: "history",
        actors: [
          actor(proposer, "watch_state", [
            handle("see", "get_action", "GET", actionPath, verdictSnap),
          ]),
        ],
      }),
    );
    pushReportStep(events, serialized, proposer, actionPath, verdictSnap);
  } else if (serialized.status === "bargaining" && !didInsist) {
    const bargain = canon(serialized, "bargain");
    events.push(
      eventOf({
        id: `bargain-${serialized.id}-${serialized.revision}`,
        at: serialized.silence_until,
        code: "bargaining",
        agent_id: proposer.id,
        name: proposer.name,
        why: "bargain",
        tone: "active",
        actors: [
          actor(proposer, "after_bargain", [
            handle("see", "inbox", "GET", "/api/inbox", inboxOf(bargain)),
            handle("see", "get_action", "GET", actionPath, bargain),
            handle("can", "withdraw", "POST", `${actionPath}/withdraw`),
            handle("can", "revise", "POST", `${actionPath}/revise`),
            handle("can", "insist", "POST", `${actionPath}/insist`),
          ]),
        ],
      }),
    );
  } else if (verdict && (outcome === "allow" || outcome === "allow_a")) {
    events.push(
      eventOf(
        {
          id: `allow-${verdict.id}`,
          at: courtAt,
          code: "allowed",
          agent_id: proposer.id,
          name: proposer.name,
          why: humanOutcome ? "allowed_you" : "allowed",
          tone: "history",
          actors: [
            actor(proposer, "after_permit", [
              handle("see", "get_action", "GET", actionPath, verdictSnap),
            ]),
          ],
        },
        court,
      ),
    );
    pushReportStep(events, serialized, proposer, actionPath, verdictSnap);
  } else if (verdict && outcome === "deny") {
    events.push(
      eventOf(
        {
          id: `deny-${verdict.id}`,
          at: courtAt,
          code: "denied",
          agent_id: proposer.id,
          name: proposer.name,
          why: humanOutcome ? "denied_you" : "denied",
          tone: "history",
          actors: [
            actor(proposer, "stopped", [
              handle("see", "get_action", "GET", actionPath, verdictSnap),
            ]),
          ],
        },
        court,
      ),
    );
    pushReportStep(events, serialized, proposer, actionPath, verdictSnap);
  }
  return { events, wakes: stageWakes };
}

export async function loadTestStage(principal: HousePrincipal, origin?: string) {
  await sweep(principal.id, new Date(), { courts: 0, origin, wakes: false });
  const houseAgents = await listStageAgents(principal.id);
  const kinds = lockedKinds(principal);
  const actionId = await latestTestActionId(principal.id);
  if (!actionId) {
    return {
      agents: houseAgents,
      kinds,
      silence_window_sec: principal.silenceWindowSec,
      current: null,
    };
  }
  const [row] = await getDb().select().from(actions).where(eq(actions.id, actionId)).limit(1);
  if (!row) {
    return { agents: houseAgents, kinds, silence_window_sec: principal.silenceWindowSec, current: null };
  }
  const [actor] = await getDb().select().from(agents).where(eq(agents.id, row.proposerId)).limit(1);
  if (!actor) {
    return { agents: houseAgents, kinds, silence_window_sec: principal.silenceWindowSec, current: null };
  }
  let serialized = await getAction({ agent: actor, principal }, actionId);
  const settled = serialized.verdict?.outcome;
  if (
    serialized.status === "escalated" &&
    (settled === "allow" || settled === "allow_a" || settled === "deny")
  ) {
    await executeAfterAck(actionId);
    serialized = await getAction({ agent: actor, principal }, actionId);
  }
  const { events, wakes: wakeList } = await buildEvents(serialized, houseAgents);
  return {
    agents: houseAgents,
    kinds,
    silence_window_sec: principal.silenceWindowSec,
    current: {
      live: isLive(serialized),
      action: serialized,
      events,
      wakes: wakeList,
    },
  };
}

export async function runTestStage(
  principal: HousePrincipal,
  body: unknown,
  request: Request,
) {
  if (!isRecord(body)) throw new ProtocolError("bad_request", "JSON body required", 400);
  const origin = publicOrigin(request);
  const op = typeof body.op === "string" ? body.op.trim() : "";
  const now = new Date();
  if (op === "propose") {
    const agent = await stageAgent(principal, agentIdOf(body));
    const summary = summaryOf(body, "summary");
    const proposed = await proposeAction(
      { agent, principal },
      { payload: { summary }, justification: summary, evidence: [] },
      now,
      { origin, testPass: true },
    );
    return loadTestStage(principal, origin);
  }
  if (op === "object") {
    const agent = await stageAgent(principal, agentIdOf(body));
    const actionId = actionIdOf(body);
    const [row] = await getDb().select().from(actions).where(eq(actions.id, actionId)).limit(1);
    if (!row || row.principalId !== principal.id || !row.testPass) {
      throw new ProtocolError("not_found", "Unknown action", 404);
    }
    if (row.proposerId === agent.id) {
      throw new ProtocolError("forbidden", "The proposer cannot object to itself", 403);
    }
    await fileObjection({ agent, principal }, actionId, { justification: summaryOf(body, "text"), evidence: [] }, now);
    return loadTestStage(principal, origin);
  }
  if (op === "withdraw" || op === "revise" || op === "insist") {
    const actionId = actionIdOf(body);
    const [row] = await getDb().select().from(actions).where(eq(actions.id, actionId)).limit(1);
    if (!row || row.principalId !== principal.id || !row.testPass) {
      throw new ProtocolError("not_found", "Unknown action", 404);
    }
    const agent = await stageAgent(principal, row.proposerId);
    const auth = { agent, principal };
    if (op === "withdraw") await withdrawAction(auth, actionId);
    if (op === "revise") {
      const summary = summaryOf(body, "summary");
      await reviseAction(auth, actionId, { payload: { summary }, justification: summary, evidence: [] }, now, {
        origin,
      });
    }
    if (op === "insist") await insistAction(auth, actionId, now);
    return loadTestStage(principal, origin);
  }
  if (op === "decide") {
    const actionId = actionIdOf(body);
    const [row] = await getDb().select().from(actions).where(eq(actions.id, actionId)).limit(1);
    if (!row || row.principalId !== principal.id || !row.testPass) {
      throw new ProtocolError("not_found", "Unknown action", 404);
    }
    const [court] = await getDb().select().from(cases).where(eq(cases.actionId, actionId)).limit(1);
    if (!court) throw new ProtocolError("conflict", "No case to decide", 409);
    await appealCase(principal, court.id, body, now);
    return loadTestStage(principal, origin);
  }
  if (op === "report") {
    const actionId = actionIdOf(body);
    const [row] = await getDb().select().from(actions).where(eq(actions.id, actionId)).limit(1);
    if (!row || row.principalId !== principal.id || !row.testPass) {
      throw new ProtocolError("not_found", "Unknown action", 404);
    }
    const agent = await stageAgent(principal, row.proposerId);
    await reportAction({ agent, principal }, actionId);
    return loadTestStage(principal, origin);
  }
  throw new ProtocolError("bad_request", "op must be propose, object, withdraw, revise, insist, decide, or report", 400);
}

export async function inspectTestStage(
  principal: HousePrincipal,
  agentId: string,
  actionId: string,
  origin?: string,
) {
  await sweep(principal.id, new Date(), { courts: 0, origin, wakes: false });
  const agent = await stageAgent(principal, agentId);
  const [row] = await getDb().select().from(actions).where(eq(actions.id, actionId)).limit(1);
  if (!row || row.principalId !== principal.id || !row.testPass) {
    throw new ProtocolError("not_found", "Unknown action", 404);
  }
  const auth = { agent, principal };
  const action = await getAction(auth, actionId);
  const inbox = await inboxFor(auth);
  return {
    agent: { id: agent.id, name: agent.name, role: agent.role, wake: agent.wake },
    constitution: {
      principal_id: principal.id,
      type: principal.type,
      constitution: principal.constitution,
    },
    action,
    inbox: { items: inbox.items.filter((item) => item.id === actionId) },
  };
}

export async function inspectQuery(principal: HousePrincipal, url: URL, origin?: string) {
  const agentId = url.searchParams.get("agent_id")?.trim() ?? "";
  const actionId = url.searchParams.get("action_id")?.trim() ?? "";
  if (!agentId || !actionId) throw new ProtocolError("bad_request", "agent_id and action_id are required", 400);
  return inspectTestStage(principal, agentId, actionId, origin);
}
