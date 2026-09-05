"use client";

import type { HouseListing } from "@/lib/protocol/members";
import type { Messages } from "@/lib/i18n/load";

export function HouseSwitch({
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
  if (houses.length < 2) return null;
  return (
    <nav className="house-switch" aria-label={t.houses}>
      {houses.map((house) => {
        const href = house.own ? `/${locale}/cabinet` : `/${locale}/cabinet?house=${house.id}`;
        const current = house.id === currentId;
        const label = house.own ? t.houseMine : house.type === "org" ? t.houseOrg : t.houseMine;
        return current ? (
          <span key={house.id} aria-current="page">
            {label}
            {house.own ? "" : ` · ${roleLabel(house.role, t)}`}
          </span>
        ) : (
          <a key={house.id} href={href}>
            {label}
            {house.own ? "" : ` · ${roleLabel(house.role, t)}`}
          </a>
        );
      })}
    </nav>
  );
}

export function roleLabel(role: string, t: Messages["cabinet"]) {
  if (role === "operator") return t.memberOperator;
  if (role === "observer") return t.memberObserver;
  return t.memberOwner;
}
