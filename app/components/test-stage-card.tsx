"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";
import { MCP_INBOX_POLL_SEC } from "@/lib/mcp/config";
import { REPORT_ACK_SEC } from "@/lib/protocol/types";

type StageAgent = { id: string; name: string; role: string; wake: string };

type StageHandle = {
  id: string;
  kind: "did" | "can" | "see";
  tool: string;
  method: string;
  path: string;
  snapshot: Record<string, unknown> | null;
};

type StageActor = {
  agent_id: string | null;
  name: string;
  wake: string | null;
  rule: string;
  handles: StageHandle[];
};

type StageEvent = {
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

type StageWake = { agent_id: string; name: string; status: string };

type ModalView =
  | { kind: "json"; title: string; json: Record<string, unknown> }
  | { kind: "note"; title: string; text: string };

type StageAction = {
  id: string;
  kind: string;
  status: string;
  phase: string;
  proposer_id: string;
  revision: number;
  silence_until: string;
  bargain_until: string | null;
  insisted_at: string | null;
  ack_until: string | null;
  may_act: boolean;
  report: { at: string } | null;
  proposer_can: { withdraw: boolean; revise: boolean; insist: boolean };
  objections: { objector_id: string }[];
  case: { id: string } | null;
};

type StagePayload = {
  agents: StageAgent[];
  kinds: string[];
  silence_window_sec: number;
  current: {
    live: boolean;
    action: StageAction;
    events: StageEvent[];
    wakes: StageWake[];
  } | null;
};

export function TestStageCard({
  token,
  houseId,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<StagePayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [watching, setWatching] = useState(false);
  const [proposer, setProposer] = useState("");
  const [summary, setSummary] = useState("");
  const [objector, setObjector] = useState("");
  const [reply, setReply] = useState("");
  const [reviseText, setReviseText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [modal, setModal] = useState<ModalView>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/cabinet/${token}/test`, { headers: cabinetHeaders(houseId) });
    if (!response.ok) throw new Error("fail");
    const payload = (await response.json()) as { data: StagePayload };
    setStage(payload.data);
    return payload.data;
  }, [token, houseId]);

  useEffect(() => {
    load()
      .then((data) => {
        setProposer((id) => id || data.agents[0]?.id || "");
        if (data.current?.live || data.current?.action.status === "escalated") setWatching(true);
        setLoaded(true);
      })
      .catch(() => {
        setError(errorLabel);
        setLoaded(true);
      });
  }, [load, errorLabel]);

  const current = watching ? (stage?.current ?? null) : null;
  const waitingCourtTx = Boolean(
    current &&
      (current.action.phase === "in_court" || current.action.insisted_at) &&
      !current.events.some((row) => row.court_href),
  );
  const polling = watching && Boolean(stage?.current?.live) && !pending;

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      void load().catch(() => setError(errorLabel));
    }, waitingCourtTx ? 8000 : 1000);
    return () => window.clearInterval(id);
  }, [polling, waitingCourtTx, load, errorLabel]);

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [polling]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const agents = stage?.agents ?? [];
  const collecting = current?.action.status === "open";
  const inCourt = Boolean(current?.action.insisted_at);
  const bargaining = current?.action.status === "bargaining" && !inCourt;
  const reportWait = Boolean(current?.action.status === "permitted" && !current.action.report);
  const windowIso = bargaining
    ? current?.action.bargain_until
    : collecting
      ? current?.action.silence_until
      : reportWait
        ? current?.action.ack_until
        : null;
  const left = remaining(windowIso, now);

  const objectors = agents.filter((row) => {
    if (!current) return false;
    if (row.id === current.action.proposer_id) return false;
    return !current.action.objections.some((item) => item.objector_id === row.id);
  });
  const selectedObjector = objectors.some((row) => row.id === objector) ? objector : (objectors[0]?.id ?? "");
  const proposerName = agents.find((row) => row.id === current?.action.proposer_id)?.name ?? "";

  async function post(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/cabinet/${token}/test`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: StagePayload; error?: { message?: string } }
      | null;
    setPending(false);
    if (!response.ok || !payload?.data) {
      setError(payload?.error?.message ?? errorLabel);
      return;
    }
    setStage(payload.data);
    if (body.op === "propose") setWatching(true);
    router.refresh();
  }

  function stopTest() {
    setWatching(false);
    setModal(null);
    setReply("");
    setReviseText("");
    setError(null);
  }

  return (
    <section className="stack test-stage">
      {!watching ? <p className="hint">{t.testLead}</p> : null}
      {!loaded ? <p className="muted">{t.treasuryLoading}</p> : null}
      {loaded && agents.length === 0 ? <p className="empty">{t.testEmpty}</p> : null}

      {loaded && agents.length > 0 && !watching ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void post({ op: "propose", agent_id: proposer, summary }).then(() => setSummary(""));
          }}
        >
          <label className="stack">
            <span className="feed-label">{t.testProposer}</span>
            <select value={proposer} onChange={(event) => setProposer(event.target.value)} disabled={pending}>
              {agents.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack">
            <span className="feed-label">{t.testSummary}</span>
            <textarea
              rows={3}
              value={summary}
              required
              disabled={pending}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <button type="submit" disabled={pending || !summary.trim()} aria-busy={pending}>
            {pending ? t.testSending : t.testPropose}
          </button>
        </form>
      ) : null}

      {current ? (
        <>
          <div className="test-head">
            <p className="test-now">{nowLine(current.action, left, proposerName, t)}</p>
            <button type="button" className="ghost" onClick={stopTest}>
              {t.testStop}
            </button>
          </div>
          <ol className="test-cards">
            {current.events.map((row) => {
              const whyText = cardWhy(row, stage?.silence_window_sec ?? 60, left, t);
              const tone = row.tone ?? (row.code === "wakes" ? "service" : "history");
              return (
                <li key={row.id} className={tone === "active" ? "test-card is-active" : "test-card"}>
                  <h3>{cardTitle(row, t)}</h3>
                  {row.text ? <p className="test-card-text">{row.text}</p> : null}
                  {whyText ? <p className="test-why">{whyText}</p> : null}
                  {courtPlateLink(row, t)}
                  {tone === "service" ? null : tone === "active" ? (
                    <LiveActions
                      row={row}
                      action={current.action}
                      pending={pending}
                      reviseText={reviseText}
                      setReviseText={setReviseText}
                      t={t}
                      onPost={(body) => void post(body)}
                    />
                  ) : (
                    <ul className="test-actors">
                      {row.actors.map((person) => (
                        <li key={`${row.id}:${person.agent_id ?? person.name}`} className="test-actor">
                          <p className="test-actor-name">
                            <strong>{person.name}</strong>
                          </p>
                          {person.rule ? (
                            <p className="test-kicker">{actorRule(person.rule, person.name, t)}</p>
                          ) : null}
                          <ActorButtons
                            person={person}
                            row={row}
                            action={current.action}
                            pending={pending}
                            live={false}
                            t={t}
                            onModal={setModal}
                            onPost={(body) => void post(body)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {collecting && objectors.length > 0 ? (
              <li className="test-card is-active">
                <h3>{t.testCardReact}</h3>
                <p className="test-why">{t.testWhyReact}</p>
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void post({
                      op: "object",
                      agent_id: selectedObjector,
                      action_id: current.action.id,
                      text: reply,
                    }).then(() => setReply(""));
                  }}
                >
                  <label className="stack">
                    <span className="feed-label">{t.testReactWho}</span>
                    <select
                      value={selectedObjector}
                      onChange={(event) => setObjector(event.target.value)}
                      disabled={pending}
                    >
                      {objectors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack">
                    <span className="feed-label">{t.testReply}</span>
                    <textarea
                      rows={3}
                      value={reply}
                      required
                      disabled={pending}
                      onChange={(event) => setReply(event.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={pending || !reply.trim()} aria-busy={pending}>
                    {pending ? t.testSending : t.testObject}
                  </button>
                </form>
              </li>
            ) : null}
          </ol>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {modal ? (
        <div className="test-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div
            className="test-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-state-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="test-modal-head">
              <h3 id="test-state-title">{modal.title}</h3>
              <button type="button" className="ghost" onClick={() => setModal(null)}>
                {t.testStateClose}
              </button>
            </div>
            {modal.kind === "json" ? (
              <pre className="mono snippet">{JSON.stringify(modal.json, null, 2)}</pre>
            ) : (
              <p className="test-why">{modal.text}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function remaining(iso: string | null | undefined, now: number) {
  if (!iso) return 0;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function courtPlateLink(row: StageEvent, t: Messages["cabinet"]) {
  const courtPlate = row.why === "denied" || row.why === "allowed" || row.why === "you" || row.why === "court";
  if (!courtPlate) return null;
  if (row.court_href) {
    return (
      <p className="test-handles">
        <a className="ghost" href={row.court_href} target="_blank" rel="noreferrer">
          {t.testCourt}
        </a>
      </p>
    );
  }
  if (row.why === "court") return <p className="test-kicker">{t.testCourtWait}</p>;
  return null;
}

function nowLine(action: StageAction, left: number, name: string, t: Messages["cabinet"]) {
  if (action.status === "escalated") return t.testNowYou;
  if (action.status === "permitted" && !action.report) {
    if (action.ack_until && left === 0) return t.testNowReportMiss.replace("{name}", name);
    return t.testNowReport.replace("{name}", name).replace("{s}", String(action.ack_until ? left : REPORT_ACK_SEC));
  }
  if (action.insisted_at) return t.testNowCourt;
  if (action.status === "open") return t.testTimerCollect.replace("{s}", String(left));
  if (action.status === "bargaining") {
    return t.testNowBargain.replace("{name}", name).replace("{s}", String(left));
  }
  return t.testNowDone;
}

function cardTitle(row: StageEvent, t: Messages["cabinet"]) {
  const name = row.name ?? "";
  if (row.code === "proposed") return t.testCardProposed.replace("{name}", name);
  if (row.code === "wakes") return t.testCardWakes;
  if (row.code === "objected") return t.testCardObjected.replace("{name}", name);
  if (row.code === "bargaining") return t.testCardBargaining.replace("{name}", name);
  if (row.code === "withdrawn") return t.testCardWithdrawn.replace("{name}", name);
  if (row.code === "silence_allow") return t.testCardSilence;
  if (row.code === "court") return t.testCardCourt.replace("{name}", name);
  if (row.code === "allowed") return row.why === "allowed_you" ? t.testCardAllowedYou : t.testCardAllowed;
  if (row.code === "denied") return row.why === "denied_you" ? t.testCardDeniedYou : t.testCardDenied;
  if (row.code === "you") return row.court_href || row.court_tx ? t.testCardYouCourt : t.testCardYou;
  if (row.code === "report") return t.testCardReport.replace("{name}", name);
  if (row.code === "report_miss") return t.testCardReportMiss.replace("{name}", name);
  if (row.code === "reported") return t.testCardReported.replace("{name}", name);
  return row.code;
}

function cardWhy(row: StageEvent, silenceSec: number, reportLeft: number, t: Messages["cabinet"]) {
  const name = row.name ?? "";
  if (row.why === "proposed") return t.testWhyProposed.replace("{name}", name).replace("{s}", String(silenceSec));
  if (row.why === "wakes" || row.why === "wakes_chats" || row.why === "wakes_none") {
    return t.testWhyWakes.replace("{s}", String(silenceSec));
  }
  if (row.why === "objected") return t.testWhyObjected.replace("{name}", name);
  if (row.why === "bargain") return t.testWhyBargain.replace("{name}", name);
  if (row.why === "court") return t.testWhyCourt.replace("{name}", name);
  if (row.why === "denied") return t.testWhyDenied;
  if (row.why === "denied_you") return t.testWhyDeniedYou;
  if (row.why === "allowed") return t.testWhyAllowed;
  if (row.why === "allowed_you") return t.testWhyAllowedYou;
  if (row.why === "you") return t.testWhyYou;
  if (row.why === "you_timeout") return t.testWhyYouTimeout;
  if (row.why === "silence") return t.testWhySilence;
  if (row.why === "report") return t.testWhyReport.replace("{name}", name).replace("{s}", String(reportLeft));
  if (row.why === "report_miss") return t.testWhyReportMiss.replace("{name}", name);
  if (row.why === "reported") return t.testWhyReported.replace("{name}", name);
  if (row.why === "withdrawn") return t.testWhyWithdrawn.replace("{name}", name);
  return row.why;
}

function actorRule(rule: string, name: string, t: Messages["cabinet"]) {
  const poll = String(MCP_INBOX_POLL_SEC);
  const fill = (line: string) => line.replace("{name}", name).replace("{poll}", poll);
  if (rule === "collecting") return fill(t.testActorCollect);
  if (rule === "after_permit") return fill(t.testActorOutbound);
  if (rule === "after_deny") return fill(t.testActorOutboundIdle);
  if (rule === "watch_state") return fill(t.testActorWatch);
  if (rule === "stopped") return fill(t.testActorStopped);
  if (rule === "stopped_allow") return fill(t.testActorStoppedAllow);
  if (rule === "stopped_withdrawn") return fill(t.testActorStoppedWithdrawn);
  if (rule === "notified") return fill(t.testActorCallback);
  if (rule === "must_poll") return fill(t.testActorMustPoll);
  if (rule === "after_bargain") return fill(t.testActorFoyer);
  if (rule === "wait_verdict") return fill(t.testActorWaitVerdict);
  if (rule === "report_due") return fill(t.testActorReport);
  if (rule === "report_miss") return fill(t.testActorReportMiss);
  return "";
}

function actionSnapshot(person: StageActor): Record<string, unknown> | null {
  const sees = person.handles.filter((item) => item.kind === "see" && item.snapshot);
  const action = sees.find((item) => item.tool === "get_action");
  return action?.snapshot ?? sees[0]?.snapshot ?? null;
}

function LiveActions({
  row,
  action,
  pending,
  reviseText,
  setReviseText,
  t,
  onPost,
}: {
  row: StageEvent;
  action: StageAction;
  pending: boolean;
  reviseText: string;
  setReviseText: (value: string) => void;
  t: Messages["cabinet"];
  onPost: (body: Record<string, unknown>) => void;
}) {
  if (row.code === "you") {
    return (
      <div className="test-handles">
        <button
          type="button"
          className="ghost"
          disabled={pending}
          aria-busy={pending}
          onClick={() => onPost({ op: "decide", action_id: action.id, outcome: "allow" })}
        >
          {pending ? t.testSending : t.testDecideAllow}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={pending}
          aria-busy={pending}
          onClick={() => onPost({ op: "decide", action_id: action.id, outcome: "deny" })}
        >
          {pending ? t.testSending : t.testDecideDeny}
        </button>
      </div>
    );
  }
  if (row.code === "report") {
    return (
      <div className="test-handles">
        <button
          type="button"
          className="ghost"
          disabled={pending}
          aria-busy={pending}
          onClick={() => onPost({ op: "report", action_id: action.id })}
        >
          {t.testReportAck}
        </button>
      </div>
    );
  }
  if (row.code === "bargaining") {
    return (
      <>
        <div className="test-handles">
          {action.proposer_can.withdraw ? (
            <button
              type="button"
              className="ghost"
              disabled={pending}
              aria-busy={pending}
              onClick={() => onPost({ op: "withdraw", action_id: action.id })}
            >
              {t.testWithdraw}
            </button>
          ) : null}
          {action.proposer_can.insist ? (
            <button
              type="button"
              className="ghost"
              disabled={pending}
              aria-busy={pending}
              onClick={() => onPost({ op: "insist", action_id: action.id })}
            >
              {t.testInsist}
            </button>
          ) : null}
        </div>
        {action.proposer_can.revise ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onPost({ op: "revise", action_id: action.id, summary: reviseText });
              setReviseText("");
            }}
          >
            <label className="stack">
              <span className="feed-label">{t.testRevise}</span>
              <textarea
                rows={3}
                value={reviseText}
                required
                disabled={pending}
                onChange={(event) => setReviseText(event.target.value)}
              />
            </label>
            <button type="submit" className="ghost" disabled={pending || !reviseText.trim()} aria-busy={pending}>
              {pending ? t.testSending : t.testRevise}
            </button>
          </form>
        ) : null}
      </>
    );
  }
  if (row.code === "proposed" && action.proposer_can.withdraw) {
    return (
      <div className="test-handles">
        <button
          type="button"
          className="ghost"
          disabled={pending}
          aria-busy={pending}
          onClick={() => onPost({ op: "withdraw", action_id: action.id })}
        >
          {t.testWithdraw}
        </button>
      </div>
    );
  }
  if (row.code === "court") {
    return row.court_href ? (
      <div className="test-handles">
        <a className="ghost" href={row.court_href} target="_blank" rel="noreferrer">
          {t.testCourt}
        </a>
      </div>
    ) : (
      <p className="test-kicker">{t.testCourtWait}</p>
    );
  }
  return null;
}

function ActorButtons({
  person,
  row,
  action,
  pending,
  live,
  t,
  onModal,
  onPost,
}: {
  person: StageActor;
  row: StageEvent;
  action: StageAction;
  pending: boolean;
  live: boolean;
  t: Messages["cabinet"];
  onModal: (view: ModalView) => void;
  onPost: (body: Record<string, unknown>) => void;
}) {
  const snap = actionSnapshot(person);
  return (
    <div className="test-handles">
      <button
        type="button"
        className="ghost"
        onClick={() =>
          onModal({
            kind: "note",
            title: t.testHandleInbox,
            text: t.testNoteInbox.replace("{name}", person.name),
          })
        }
      >
        {t.testHandleInbox}
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() =>
          onModal({
            kind: "note",
            title: t.testHandleRules,
            text: t.testNoteRules.replace("{name}", person.name),
          })
        }
      >
        {t.testHandleRules}
      </button>
      {snap ? (
        <button
          type="button"
          className="ghost"
          onClick={() => onModal({ kind: "json", title: t.testState, json: snap })}
        >
          {t.testState}
        </button>
      ) : null}
    </div>
  );
}
