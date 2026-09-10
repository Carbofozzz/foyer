"use client";

import { useEffect, useState } from "react";

/** True while the cabinet radio for this pane is checked. Hidden panes stay mounted. */
export function useCabinetTab(id: string): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    function read() {
      const radio = document.getElementById(`cabinet-tab-${id}`);
      setActive(radio instanceof HTMLInputElement && radio.checked);
    }
    read();
    const radios = document.querySelectorAll("input.cabinet-tab-radio");
    radios.forEach((node) => node.addEventListener("change", read));
    return () => radios.forEach((node) => node.removeEventListener("change", read));
  }, [id]);

  return active;
}
