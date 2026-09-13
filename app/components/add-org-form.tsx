"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Messages } from "@/lib/i18n/load";
import type { HouseListing } from "@/lib/protocol/members";

export function AddOrgForm({
  locale,
  currentId,
  houses,
  t,
}: {
  locale: string;
  currentId: string;
  houses: HouseListing[];
  t: Messages["cabinet"];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const org = houses.find((house) => house.type === "org");
  const canCreate = houses.some((house) => house.own && house.type !== "org");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const response = await fetch("/api/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json().catch(() => null)) as { data?: { id: string } } | null;
    setPending(false);
    if (!response.ok || !payload?.data?.id) {
      setError(true);
      return;
    }
    router.push(`/${locale}/cabinet?house=${payload.data.id}`);
    router.refresh();
  }

  if (org) {
    const onOrg = org.id === currentId;
    if (onOrg) {
      return (
        <a className="ghost" href={`/${locale}/cabinet`}>
          {t.kicker}
        </a>
      );
    }
    return (
      <a className="ghost" href={`/${locale}/cabinet?house=${org.id}`}>
        {org.name.trim() || t.houseOrg}
      </a>
    );
  }

  if (!canCreate) return null;

  if (composing) {
    return (
      <form className="add-org-inline" onSubmit={(event) => void onSubmit(event)}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.orgName}
          aria-label={t.orgName}
          required
          maxLength={80}
          autoFocus
        />
        <button type="submit" className="primary" disabled={pending || !name.trim()} aria-busy={pending}>
          {pending ? t.orgAdding : t.orgCreate}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setComposing(false);
            setError(false);
          }}
        >
          {t.cancel}
        </button>
        {error ? <p className="hint">{t.error}</p> : null}
      </form>
    );
  }

  return (
    <button type="button" className="ghost" onClick={() => setComposing(true)}>
      {t.addOrg}
    </button>
  );
}
