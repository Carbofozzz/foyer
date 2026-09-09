"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";

/** After the cabinet paints, run hook/mail sweep in the background and reload the feed. */
export function CabinetInboxRefresh({ token, houseId }: { token: string; houseId?: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cabinet/${token}/sweep`, { method: "POST", headers: cabinetHeaders(houseId) })
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) router.refresh();
      });
    function inboxChecked() {
      const radio = document.getElementById("cabinet-tab-inbox");
      return radio instanceof HTMLInputElement && radio.checked;
    }
    function refreshIfInbox() {
      if (inboxChecked()) router.refresh();
    }
    function onVis() {
      if (document.visibilityState === "visible") refreshIfInbox();
    }
    const radios = document.querySelectorAll("input.cabinet-tab-radio");
    radios.forEach((node) => node.addEventListener("change", refreshIfInbox));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      cancelled = true;
      radios.forEach((node) => node.removeEventListener("change", refreshIfInbox));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [router, token, houseId]);

  return null;
}
