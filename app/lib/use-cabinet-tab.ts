"use client";

import { useEffect, useState } from "react";
import { CABINET_TAB_COOKIE, writeClientCookie } from "@/app/lib/cabinet-ui";

/** True while the cabinet radio for this pane is checked. Hidden panes stay mounted. */
export function useCabinetTab(id: string): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    function read() {
      const radio = document.getElementById(`cabinet-tab-${id}`);
      setActive(radio instanceof HTMLInputElement && radio.checked);
    }
    function onChange(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains("cabinet-tab-radio")) return;
      if (target.checked) writeClientCookie(CABINET_TAB_COOKIE, target.id.replace(/^cabinet-tab-/, ""));
      read();
    }
    read();
    const frame = window.requestAnimationFrame(read);
    const panel = document.querySelector(".cabinet-panel");
    panel?.addEventListener("change", onChange);
    return () => {
      window.cancelAnimationFrame(frame);
      panel?.removeEventListener("change", onChange);
    };
  }, [id]);

  return active;
}
