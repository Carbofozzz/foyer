"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";

export function TestClientsToggle({
  token,
  houseId,
  on,
  onLabel,
  offLabel,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/test-clients`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ on: !on }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="feed-toolbar">
      <button type="button" className="quiet" disabled={pending} aria-busy={pending} onClick={() => void toggle()}>
        {on ? offLabel : onLabel}
      </button>
      {error ? <p className="error">{errorLabel}</p> : null}
    </div>
  );
}
