"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assembleCharter, type PricePreference } from "@/lib/i18n/charter";
import type { Messages } from "@/lib/i18n/load";
import { ConnectCard } from "@/app/components/connect-card";

type Step = "rules" | "lock" | "connect" | "guardian" | "first";

export function CabinetWizard({
  token,
  step,
  wizard,
  connect,
  charter,
  cabinetError,
  constitution,
}: {
  token: string;
  step: Step;
  wizard: Messages["wizard"];
  connect: Messages["connect"];
  charter: Messages["charter"];
  cabinetError: string;
  constitution: string;
}) {
  if (step === "rules") {
    return <RulesStep token={token} wizard={wizard} charter={charter} cabinetError={cabinetError} constitution={constitution} />;
  }
  if (step === "lock") {
    return <LockStep token={token} wizard={wizard} cabinetError={cabinetError} />;
  }
  if (step === "connect") {
    return <ConnectCard token={token} t={connect} errorLabel={cabinetError} asWizard />;
  }
  if (step === "guardian") {
    return (
      <ActionStep
        token={token}
        path="guardian"
        cabinetError={cabinetError}
        kicker={wizard.guardianKicker}
        title={wizard.guardianTitle}
        lead={wizard.guardianLead}
        label={wizard.guardianEnable}
        pendingLabel={wizard.guardianEnabling}
      />
    );
  }
  return (
    <ActionStep
      token={token}
      path="first-pass"
      cabinetError={cabinetError}
      kicker={wizard.firstKicker}
      title={wizard.firstTitle}
      lead={wizard.firstLead}
      label={wizard.firstRun}
      pendingLabel={wizard.firstRunning}
    />
  );
}

function RulesStep({
  token,
  wizard,
  charter,
  cabinetError,
  constitution,
}: {
  token: string;
  wizard: Messages["wizard"];
  charter: Messages["charter"];
  cabinetError: string;
  constitution: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [spendLimit, setSpendLimit] = useState("500");
  const [price, setPrice] = useState<PricePreference>("save");
  const [promises, setPromises] = useState(true);
  const [security, setSecurity] = useState(true);
  const [human, setHuman] = useState("");
  const assembled = useMemo(
    () => assembleCharter({ spendLimit, price, promises, security, human }, charter),
    [spendLimit, price, promises, security, human, charter],
  );
  const [text, setText] = useState(constitution.trim() || assembled);
  const [edited, setEdited] = useState(Boolean(constitution.trim()));

  useEffect(() => {
    if (!edited) setText(assembled);
  }, [assembled, edited]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/constitution`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ constitution: text }),
    });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <p className="kicker">{wizard.rulesKicker}</p>
      <h2 className="section-title">{wizard.rulesTitle}</h2>
      <p className="hint">{wizard.rulesLead}</p>
      <label>
        {wizard.qSpend}
        <input value={spendLimit} onChange={(event) => setSpendLimit(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        {wizard.qPrice}
        <select value={price} onChange={(event) => setPrice(event.target.value as PricePreference)}>
          <option value="save">{wizard.qSave}</option>
          <option value="balance">{wizard.qBalance}</option>
          <option value="comfort">{wizard.qComfort}</option>
        </select>
      </label>
      <label>
        {wizard.qPromises}
        <select value={promises ? "yes" : "no"} onChange={(event) => setPromises(event.target.value === "yes")}>
          <option value="yes">{wizard.yes}</option>
          <option value="no">{wizard.no}</option>
        </select>
      </label>
      <label>
        {wizard.qSecurity}
        <select value={security ? "yes" : "no"} onChange={(event) => setSecurity(event.target.value === "yes")}>
          <option value="yes">{wizard.yes}</option>
          <option value="no">{wizard.no}</option>
        </select>
      </label>
      <label>
        {wizard.qHuman}
        <input value={human} onChange={(event) => setHuman(event.target.value)} placeholder={wizard.qHumanPlaceholder} />
      </label>
      <label>
        {wizard.preview}
        <textarea
          value={text}
          onChange={(event) => {
            setEdited(true);
            setText(event.target.value);
          }}
          rows={10}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? wizard.saving : wizard.next}
      </button>
      {error ? <p className="error">{cabinetError}</p> : null}
    </form>
  );
}

function LockStep({
  token,
  wizard,
  cabinetError,
}: {
  token: string;
  wizard: Messages["wizard"];
  cabinetError: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [spend, setSpend] = useState(true);
  const [book, setBook] = useState(true);
  const [message, setMessage] = useState(true);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const kinds = [
      ...(spend ? ["spend"] : []),
      ...(book ? ["book"] : []),
      ...(message ? ["message"] : []),
    ];
    const response = await fetch(`/api/cabinet/${token}/locks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kinds }),
    });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <p className="kicker">{wizard.lockKicker}</p>
      <h2 className="section-title">{wizard.lockTitle}</h2>
      <p className="hint">{wizard.lockLead}</p>
      <label className="check-row">
        <input type="checkbox" checked={spend} onChange={(event) => setSpend(event.target.checked)} />
        {wizard.lockSpend}
      </label>
      <label className="check-row">
        <input type="checkbox" checked={book} onChange={(event) => setBook(event.target.checked)} />
        {wizard.lockBook}
      </label>
      <label className="check-row">
        <input type="checkbox" checked={message} onChange={(event) => setMessage(event.target.checked)} />
        {wizard.lockMessage}
      </label>
      <button type="submit" disabled={pending}>
        {pending ? wizard.saving : wizard.next}
      </button>
      {error ? <p className="error">{cabinetError}</p> : null}
    </form>
  );
}

function ActionStep({
  token,
  path,
  cabinetError,
  kicker,
  title,
  lead,
  label,
  pendingLabel,
}: {
  token: string;
  path: "guardian" | "first-pass";
  cabinetError: string;
  kicker: string;
  title: string;
  lead: string;
  label: string;
  pendingLabel: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/cabinet/${token}/${path}`, { method: "POST" });
      if (!response.ok) {
        setError(true);
        setPending(false);
        return;
      }
      window.location.reload();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <p className="kicker">{kicker}</p>
      <h2 className="section-title">{title}</h2>
      <p className="hint">{lead}</p>
      <button type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
      {error ? <p className="error">{cabinetError}</p> : null}
    </form>
  );
}
