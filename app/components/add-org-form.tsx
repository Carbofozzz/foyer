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
  const personal = houses.find((house) => house.own && house.type !== "org");
  const orgs = houses.filter((house) => house.type === "org");
  const ownsOrg = orgs.some((house) => house.own);
  const canCreate = Boolean(personal) && !ownsOrg;
  const onPersonal = personal?.id === currentId;

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

  const links = (
    <>
      {!onPersonal && personal ? (
        <a className="ghost" href={`/${locale}/cabinet`}>
          {t.kicker}
        </a>
      ) : null}
      {orgs.map((org) =>
        org.id === currentId ? null : (
          <a key={org.id} className="ghost" href={`/${locale}/cabinet?house=${org.id}`}>
            {org.name.trim() || t.houseOrg}
            {org.own ? "" : ` · ${t.accessLimitedShort}`}
          </a>
        ),
      )}
    </>
  );

  if (composing && canCreate) {
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
    <>
      {links}
      {canCreate ? (
        <button type="button" className="ghost" onClick={() => setComposing(true)}>
          {t.addOrg}
        </button>
      ) : null}
    </>
  );
}
