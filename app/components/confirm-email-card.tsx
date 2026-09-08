"use client";

import { useEffect, useState } from "react";
import type { Messages } from "@/lib/i18n/load";

export function ConfirmEmailCard({ token, t, cabinetHref }: { token: string; t: Messages["notify"]; cabinetHref: string }) {
  const [state, setState] = useState<"pending" | "ok" | "dead">("pending");

  useEffect(() => {
    fetch("/api/confirm-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => setState(response.ok ? "ok" : "dead"))
      .catch(() => setState("dead"));
  }, [token]);

  if (state === "pending") return <p className="muted">{t.confirming}</p>;
  if (state === "dead") {
    return (
      <>
        <p>{t.dead}</p>
        <p>
          <a href={cabinetHref}>{t.cabinetLink}</a>
        </p>
      </>
    );
  }
  return (
    <>
      <p>{t.confirmed}</p>
      <p>
        <a href={cabinetHref}>{t.cabinetLink}</a>
      </p>
    </>
  );
}
