"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";
import { TEST_CAST } from "@/lib/protocol/test-cast";

type Kind = "spend" | "book" | "message" | "cancel";

export function TestRequestCard({
  token,
  houseId,
  kinds,
  t,
  errorLabel,
  locked = false,
}: {
  token: string;
  houseId?: string;
  kinds: Kind[];
  t: Messages["cabinet"];
  errorLabel: string;
  locked?: boolean;
}) {
  const router = useRouter();
  const options = useMemo(() => (kinds.includes("cancel") ? kinds : [...kinds, "cancel" as const]), [kinds]);
  const [proposer, setProposer] = useState(TEST_CAST[0].role);
  const [objector, setObjector] = useState(TEST_CAST[1].role);
  const [kind, setKind] = useState<Kind>(options[0] ?? "spend");
  const [summary, setSummary] = useState("");
  const [reply, setReply] = useState("");
  const [path, setPath] = useState<"pass" | "court">("pass");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [needReply, setNeedReply] = useState(false);
  const [ok, setOk] = useState(false);

  function resetForm() {
    setProposer(TEST_CAST[0].role);
    setObjector(TEST_CAST[1].role);
    setKind(options[0] ?? "spend");
    setSummary("");
    setReply("");
    setPath("pass");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    if (path === "court" && !reply.trim()) {
      setNeedReply(true);
      setError(false);
      setOk(false);
      return;
    }
    setPending(true);
    setError(false);
    setNeedReply(false);
    setOk(false);
    const response = await fetch(`/api/cabinet/${token}/test-request`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({
        proposer,
        objector,
        kind,
        summary,
        reply,
        path,
      }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    resetForm();
    setOk(true);
    router.refresh();
  }

  return (
    <form className="stack test-request" onSubmit={onSubmit}>
      <p className="hint">{t.testLead}</p>
      <label className="stack">
        <span className="feed-label">{t.testProposer}</span>
        <select value={proposer} disabled={locked} onChange={(event) => setProposer(event.target.value)}>
          {TEST_CAST.map((row) => (
            <option key={row.role} value={row.role} disabled={row.role === objector}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <label className="stack">
        <span className="feed-label">{t.testKind}</span>
        <select value={kind} disabled={locked} onChange={(event) => setKind(event.target.value as Kind)}>
          {options.map((row) => (
            <option key={row} value={row}>
              {kindLabel(row, t)}
            </option>
          ))}
        </select>
      </label>
      <label className="stack">
        <span className="feed-label">{t.testSummary}</span>
        <textarea
          rows={3}
          value={summary}
          disabled={locked}
          required={!locked}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>
      <label className="stack">
        <span className="feed-label">{t.testObjector}</span>
        <select value={objector} disabled={locked} onChange={(event) => setObjector(event.target.value)}>
          {TEST_CAST.map((row) => (
            <option key={row.role} value={row.role} disabled={row.role === proposer}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="stack test-path" disabled={locked}>
        <legend className="feed-label">{t.testPath}</legend>
        <label className="check-row">
          <input
            type="radio"
            name="test-path"
            checked={path === "pass"}
            onChange={() => {
              setPath("pass");
              setNeedReply(false);
            }}
          />
          {t.testPathPass}
        </label>
        <label className="check-row">
          <input type="radio" name="test-path" checked={path === "court"} onChange={() => setPath("court")} />
          {t.testPathCourt}
        </label>
      </fieldset>
      {path === "court" ? (
        <label className="stack">
          <span className="feed-label">{t.testReply}</span>
          <textarea
            rows={3}
            value={reply}
            disabled={locked}
            onChange={(event) => {
              setReply(event.target.value);
              setNeedReply(false);
            }}
          />
        </label>
      ) : null}
      <button type="submit" disabled={locked || pending} aria-busy={pending}>
        {pending ? t.testSending : t.testSend}
      </button>
      {ok ? <p className="ok" role="status">{t.testOk}</p> : null}
      {needReply ? <p className="error">{t.testReplyNeed}</p> : null}
      {error ? <p className="error">{errorLabel}</p> : null}
    </form>
  );
}

function kindLabel(kind: Kind, t: Messages["cabinet"]) {
  if (kind === "book") return t.kindBook;
  if (kind === "spend") return t.kindSpend;
  if (kind === "message") return t.kindMessage;
  return t.kindCancel;
}
