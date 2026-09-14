"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Messages } from "@/lib/i18n/load";

export function OrgSettingsCard({
  locale,
  houseId,
  name,
  t,
}: {
  locale: string;
  houseId: string;
  name: string;
  t: Messages["cabinet"];
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const dirty = value.trim() !== name.trim();

  useEffect(() => {
    setValue(name);
  }, [name]);

  async function save() {
    setSaving(true);
    setError(false);
    const response = await fetch("/api/orgs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: houseId, name: value }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(t.orgDeleteConfirm)) return;
    setDeleting(true);
    setError(false);
    const response = await fetch("/api/orgs", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: houseId }),
    });
    if (!response.ok) {
      setDeleting(false);
      setError(true);
      return;
    }
    router.push(`/${locale}/cabinet`);
    router.refresh();
  }

  return (
    <div className="stack">
      <label className="stack">
        {t.orgName}
        <input value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} required />
      </label>
      <button type="button" className="primary" disabled={saving || !value.trim() || !dirty} aria-busy={saving} onClick={() => void save()}>
        {saving ? t.savingRules : t.saveRules}
      </button>
      <p className="hint">{t.orgDeleteHint}</p>
      <button type="button" className="ghost ghost-danger" disabled={deleting} aria-busy={deleting} onClick={() => void remove()}>
        {deleting ? t.orgDeleting : t.orgDelete}
      </button>
      {error ? <p className="hint">{t.error}</p> : null}
    </div>
  );
}
