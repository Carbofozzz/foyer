"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import { assembleCharter, type HouseKind, type PricePreference } from "@/lib/i18n/charter";
import type { Messages } from "@/lib/i18n/load";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { ConnectIssueFields } from "@/app/components/connect-card";
import { notifyHouseChanged } from "@/lib/wallet/events";
import { asHexAddress, GENLAYER_CHAIN_ID, ownerKey } from "@/lib/gen/chain";
import { parseGen, shortGen } from "@/lib/gen/amount";
import type { WakeKind } from "@/lib/protocol/types";

const STEPS = ["rules", "agent", "fund", "contacts"] as const;
type Step = (typeof STEPS)[number];

type WalletView = {
  address: string;
  balance: string;
  owner: string | null;
  studio_faucet?: boolean;
};

export function CabinetSetup({
  token,
  houseId,
  openOnMount,
  wizard,
  connect,
  charter,
  cabinet,
  cabinetError,
  constitution,
  houseType,
  email,
  locale,
}: {
  token: string;
  houseId?: string;
  openOnMount: boolean;
  wizard: Messages["wizard"];
  connect: Messages["connect"];
  charter: Messages["charter"];
  cabinet: Messages["cabinet"];
  cabinetError: string;
  constitution: string;
  houseType: HouseKind;
  email: string;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const dismissKey = `foyer-wizard-${houseId ?? token}`;

  useEffect(() => {
    if (!openOnMount) return;
    try {
      if (sessionStorage.getItem(dismissKey) === "1") return;
    } catch {
      // private mode
    }
    setOpen(true);
  }, [openOnMount, dismissKey]);

  function close() {
    if (openOnMount) {
      try {
        sessionStorage.setItem(dismissKey, "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        {wizard.open}
      </button>
      {open ? (
        <CabinetWizardModal
          token={token}
          houseId={houseId}
          wizard={wizard}
          connect={connect}
          charter={charter}
          cabinet={cabinet}
          cabinetError={cabinetError}
          constitution={constitution}
          houseType={houseType}
          email={email}
          locale={locale}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function CabinetWizardModal({
  token,
  houseId,
  wizard,
  connect,
  charter,
  cabinet,
  cabinetError,
  constitution,
  houseType,
  email: initialEmail,
  locale,
  onClose,
}: {
  token: string;
  houseId?: string;
  wizard: Messages["wizard"];
  connect: Messages["connect"];
  charter: Messages["charter"];
  cabinet: Messages["cabinet"];
  cabinetError: string;
  constitution: string;
  houseType: HouseKind;
  email: string;
  locale: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("rules");
  const index = STEPS.indexOf(step);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [kind, setKind] = useState<HouseKind>(houseType);
  const [spendLimit, setSpendLimit] = useState("500");
  const [price, setPrice] = useState<PricePreference>("save");
  const [human, setHuman] = useState("");
  const assembled = useMemo(
    () => assembleCharter({ spendLimit, price, promises: true, security: true, human }, charter, kind),
    [spendLimit, price, human, charter, kind],
  );
  const [followConstructor, setFollowConstructor] = useState(!constitution.trim());
  const [text, setText] = useState(() => constitution.trim() || assembled);

  const [agentName, setAgentName] = useState("");
  const [wake, setWake] = useState<WakeKind>("outbound");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [callbackSecret, setCallbackSecret] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);

  useEffect(() => {
    if (followConstructor) setText(assembled);
  }, [assembled, followConstructor]);

  useEffect(() => {
    if (step !== "contacts") return;
    fetch(`/api/cabinet/${token}/contacts`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: { telegram?: boolean; telegram_url?: string | null } }>;
      })
      .then((payload) => {
        setTelegramLinked(Boolean(payload.data.telegram));
        setTelegramUrl(payload.data.telegram_url ?? null);
      })
      .catch(() => undefined);
  }, [step, token, houseId]);

  function goNext() {
    setError(null);
    if (step === "rules" && !text.trim()) {
      setError(cabinetError);
      return;
    }
    if (step === "agent" && agentName.trim() && wake === "callback" && !callbackUrl.trim()) {
      setError(connect.callbackNeed);
      return;
    }
    const next = STEPS[index + 1];
    if (next) setStep(next);
  }

  async function finish() {
    if (!text.trim()) {
      setStep("rules");
      setError(cabinetError);
      return;
    }
    if (agentName.trim() && wake === "callback" && !callbackUrl.trim()) {
      setStep("agent");
      setError(connect.callbackNeed);
      return;
    }
    setPending(true);
    setError(null);
    const agent = agentName.trim()
      ? {
          name: agentName.trim(),
          wake,
          callback_url: wake === "callback" ? callbackUrl.trim() : undefined,
          callback_secret: wake === "callback" && callbackSecret.trim() ? callbackSecret.trim() : undefined,
        }
      : undefined;
    const response = await fetch(`/api/cabinet/${token}/wizard`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ constitution: text, type: kind, email, agent, locale }),
    });
    setPending(false);
    if (!response.ok) {
      setError(cabinetError);
      return;
    }
    notifyHouseChanged();
    onClose();
    router.refresh();
  }

  return (
    <div className="wizard-backdrop" role="presentation" onClick={onClose}>
      <div
        className="wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wizard-head">
          <div>
            <h2 id="wizard-title" className="section-title">
              {wizard.title}
            </h2>
            <p className="kicker">{wizard.stepOf.replace("{n}", String(index + 1)).replace("{total}", String(STEPS.length))}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            {wizard.close}
          </button>
        </div>

        {step === "rules" ? (
          <div className="stack">
            <h3>{wizard.rulesTitle}</h3>
            <p className="hint">{wizard.rulesLead}</p>
            <div className="form-grid">
              <label>
                {wizard.qType}
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as HouseKind);
                    setFollowConstructor(true);
                  }}
                >
                  <option value="personal">{wizard.typePersonal}</option>
                  <option value="org">{wizard.typeOrg}</option>
                </select>
              </label>
              <label>
                {wizard.qSpend}
                <input
                  value={spendLimit}
                  onChange={(event) => {
                    setSpendLimit(event.target.value);
                    setFollowConstructor(true);
                  }}
                  inputMode="numeric"
                />
              </label>
            </div>
            {kind === "personal" ? (
              <fieldset className="wizard-choice">
                <legend>{wizard.qPrice}</legend>
                <div className="segmented" role="radiogroup">
                  {(["save", "balance", "comfort"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={price === value ? "segment is-active" : "segment"}
                      aria-pressed={price === value}
                      onClick={() => {
                        setPrice(value);
                        setFollowConstructor(true);
                      }}
                    >
                      {value === "save" ? wizard.qSave : value === "balance" ? wizard.qBalance : wizard.qComfort}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <label>
              {wizard.qHuman}
              <input
                value={human}
                onChange={(event) => {
                  setHuman(event.target.value);
                  setFollowConstructor(true);
                }}
                placeholder={wizard.qHumanPlaceholder}
              />
            </label>
            <label>
              {wizard.preview}
              <textarea
                value={text}
                onChange={(event) => {
                  setFollowConstructor(false);
                  setText(event.target.value);
                }}
                rows={6}
              />
            </label>
          </div>
        ) : null}

        {step === "agent" ? (
          <div className="stack">
            <h3>{wizard.agentTitle}</h3>
            <p className="hint">{wizard.agentLead}</p>
            <div className="connect-issue">
              <p className="feed-label">{connect.another}</p>
              <ConnectIssueFields
                t={connect}
                name={agentName}
                wake={wake}
                callbackUrl={callbackUrl}
                callbackSecret={callbackSecret}
                onName={setAgentName}
                onWake={setWake}
                onCallbackUrl={setCallbackUrl}
                onCallbackSecret={setCallbackSecret}
                showIssue={false}
              />
            </div>
            <p className="hint">{wizard.agentSkip}</p>
          </div>
        ) : null}

        {step === "fund" ? (
          <WizardFundStep token={token} houseId={houseId} wizard={wizard} cabinet={cabinet} cabinetError={cabinetError} />
        ) : null}

        {step === "contacts" ? (
          <div className="stack">
            <h3>{wizard.contactsTitle}</h3>
            <p className="hint">{wizard.contactsLead}</p>
            <label>
              {wizard.emailLabel}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={wizard.emailPlaceholder}
                autoComplete="email"
              />
            </label>
            <div className="contact-channel">
              <p className="contact-channel-label">{cabinet.contactsTelegram}</p>
              {telegramLinked ? <p className="hint">{cabinet.contactsTelegramLinked}</p> : null}
              {!telegramLinked && telegramUrl ? (
                <div className="wallet-actions">
                  <a className="ghost" href={telegramUrl} target="_blank" rel="noreferrer">
                    {wizard.telegram}
                  </a>
                </div>
              ) : null}
              {!telegramLinked && !telegramUrl ? <p className="hint">{wizard.telegramSoon}</p> : null}
            </div>
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="wizard-nav">
          <button type="button" className="ghost" disabled={index === 0 || pending} onClick={() => setStep(STEPS[index - 1]!)}>
            {wizard.back}
          </button>
          {index < STEPS.length - 1 ? (
            <button type="button" className="primary" onClick={goNext}>
              {wizard.next}
            </button>
          ) : (
            <button type="button" className="primary" disabled={pending} aria-busy={pending} onClick={() => void finish()}>
              {pending ? wizard.saving : wizard.finish}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WizardFundStep({
  token,
  houseId,
  wizard,
  cabinet,
  cabinetError,
}: {
  token: string;
  houseId?: string;
  wizard: Messages["wizard"];
  cabinet: Messages["cabinet"];
  cabinetError: string;
}) {
  const { address: connected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: GENLAYER_CHAIN_ID });
  const [data, setData] = useState<WalletView | null>(null);
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState<"deposit" | "faucet" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = data?.owner ? ownerKey(data.owner) : null;

  useEffect(() => {
    fetch(`/api/cabinet/${token}/treasury`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: WalletView }>;
      })
      .then((payload) => {
        setData(payload.data);
        setError(null);
      })
      .catch(() => setError(cabinetError));
  }, [token, houseId, cabinetError]);

  async function deposit() {
    if (!data) return;
    if (!connected) {
      openConnectModal?.();
      return;
    }
    const house = asHexAddress(data.address);
    if (!house) return;
    if (owner && ownerKey(connected) !== owner) {
      setError(cabinet.wrongWallet);
      return;
    }
    setBusy("deposit");
    setError(null);
    try {
      await switchChainAsync({ chainId: GENLAYER_CHAIN_ID });
      const wei = parseGen(amount);
      const tx = await sendTransactionAsync({ to: house, value: wei });
      try {
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 60_000 });
        }
      } catch {
        // Studio-dev receipt can lag.
      }
      const response = await fetch(`/api/cabinet/${token}/treasury`, {
        method: "POST",
        headers: cabinetHeaders(houseId, { "Content-Type": "application/json" }),
        body: JSON.stringify({ deposit: true, tx, from: connected, gen: amount }),
      });
      if (!response.ok) throw new Error("fail");
      const payload = (await response.json()) as { data: WalletView };
      setData(payload.data);
      notifyHouseChanged();
    } catch {
      setError(cabinetError);
    }
    setBusy(null);
  }

  async function faucet() {
    setBusy("faucet");
    setError(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/treasury`, {
        method: "POST",
        headers: cabinetHeaders(houseId, { "Content-Type": "application/json" }),
        body: JSON.stringify({ faucet: true }),
      });
      if (!response.ok) {
        setError(wizard.fundOff);
        setBusy(null);
        return;
      }
      const payload = (await response.json()) as { data: WalletView };
      setData(payload.data);
      notifyHouseChanged();
    } catch {
      setError(cabinetError);
    }
    setBusy(null);
  }

  return (
    <div className="stack">
      <h3>{wizard.fundTitle}</h3>
      <p className="hint">{wizard.fundLead}</p>
      {data ? (
        <p className="wallet-balance" title={data.balance}>
          {shortGen(data.balance)} <span>GEN</span>
        </p>
      ) : (
        <p className="muted">{cabinet.treasuryLoading}</p>
      )}
      <label>
        {cabinet.depositAmount}
        <input value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <div className="wallet-actions">
        <button type="button" className="primary" disabled={!data || busy !== null} aria-busy={busy === "deposit"} onClick={() => void deposit()}>
          {busy === "deposit" ? cabinet.depositing : wizard.fundWallet}
        </button>
        <button
          type="button"
          disabled={!data || busy !== null || data.studio_faucet === false}
          aria-busy={busy === "faucet"}
          onClick={() => void faucet()}
        >
          {busy === "faucet" ? wizard.fundFauceting : wizard.fundFaucet}
        </button>
      </div>
      {data && data.studio_faucet === false ? <p className="hint">{wizard.fundOff}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
