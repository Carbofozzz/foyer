"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Reload the activity feed when that cabinet tab is selected or the window is focused. */
export function CabinetInboxRefresh() {
  const router = useRouter();

  useEffect(() => {
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
      radios.forEach((node) => node.removeEventListener("change", refreshIfInbox));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [router]);

  return null;
}
