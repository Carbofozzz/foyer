import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { listActivePlans, serializePlan } from "@/lib/billing/plans";
import { SUB_GRACE_MS } from "@/lib/billing/calendar";

function money(cents: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function Mark({ on }: { on: boolean }) {
  return on ? (
    <span className="pricing-yes" aria-hidden="true">
      ✓
    </span>
  ) : (
    <span className="pricing-no" aria-hidden="true">
      —
    </span>
  );
}

export async function PricingView({ locale, t }: { locale: Locale; t: Messages }) {
  const p = t.pricing;
  const plans = (await listActivePlans()).map(serializePlan);
  const free = plans.find((row) => row.kind === "free");
  const pro = plans.find((row) => row.kind === "subscription");
  const packs = plans.filter((row) => row.kind === "pack");
  const graceDays = String(Math.round(SUB_GRACE_MS / 86_400_000));

  const rows: { label: string; free: string | boolean; pro: string | boolean }[] = [
    {
      label: p.rowCourts,
      free: free ? String(free.credits) : false,
      pro: pro ? String(pro.credits) : false,
    },
    { label: p.rowRollover, free: false, pro: Boolean(pro?.rollover) },
    { label: p.rowOrg, free: false, pro: Boolean(pro?.feature_org) },
    { label: p.rowGrace, free: false, pro: p.days.replace("{n}", graceDays) },
    { label: p.rowPacks, free: true, pro: true },
    { label: p.rowLoop, free: true, pro: true },
  ];

  return (
    <main className="pricing">
      <header className="pricing-head">
        <p className="kicker">{p.kicker}</p>
        <h1>{p.title}</h1>
        <p className="lead">{p.lead}</p>
      </header>

      <div className="pricing-grid">
        {free ? (
          <section className="card pricing-card">
            <h2 className="pricing-name">{free.label}</h2>
            <p className="pricing-price">
              {money(0, free.currency, locale)}
              <span className="pricing-unit">{p.perMonth}</span>
            </p>
            <p className="pricing-blurb">{p.freeBlurb.replace("{n}", String(free.credits))}</p>
            <ul className="pricing-checks">
              <li>
                <Mark on />
                {p.courtsPerMonth.replace("{n}", String(free.credits))}
              </li>
              <li>
                <Mark on={false} />
                {p.checkNoRollover}
              </li>
              <li>
                <Mark on={false} />
                {p.checkNoOrg}
              </li>
            </ul>
            <Link className="primary" href={`/${locale}/cabinet`}>
              {p.ctaFree}
            </Link>
          </section>
        ) : null}

        {pro ? (
          <section className="card pricing-card is-featured">
            <h2 className="pricing-name">{pro.label}</h2>
            {pro.price_cents > 0 ? (
              <p className="pricing-price">
                {money(pro.price_cents, pro.currency, locale)}
                <span className="pricing-unit">{p.perMonth}</span>
              </p>
            ) : (
              <p className="pricing-price">
                {p.byCode}
                <span className="pricing-unit">{p.byCodeNote}</span>
              </p>
            )}
            <p className="pricing-blurb">{p.proBlurb}</p>
            <ul className="pricing-checks">
              <li>
                <Mark on />
                {p.courtsPerMonth.replace("{n}", String(pro.credits))}
              </li>
              <li>
                <Mark on={pro.rollover} />
                {p.checkRollover}
              </li>
              <li>
                <Mark on={pro.feature_org} />
                {p.checkOrg}
              </li>
            </ul>
            <Link className="primary" href={`/${locale}/cabinet?tab=plan`}>
              {p.ctaPro}
            </Link>
          </section>
        ) : null}
      </div>

      <section className="pricing-section">
        <h2 className="section-title">{p.compareTitle}</h2>
        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{free?.label ?? "Free"}</th>
                <th scope="col">{pro?.label ?? "Pro"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{typeof row.free === "string" ? row.free : <Mark on={row.free} />}</td>
                  <td>{typeof row.pro === "string" ? row.pro : <Mark on={row.pro} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {packs.length > 0 ? (
        <section className="pricing-section">
          <h2 className="section-title">{p.packsTitle}</h2>
          <p className="hint">{p.packsLead}</p>
          <ul className="pricing-packs">
            {packs.map((pack) => (
              <li key={pack.id} className="card">
                <strong>{p.packCourts.replace("{n}", String(pack.credits))}</strong>
                <span>{pack.price_cents > 0 ? money(pack.price_cents, pack.currency, locale) : p.byCode}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="pricing-section">
        <h2 className="section-title">{p.creditTitle}</h2>
        <ul className="pricing-notes">
          <li>{p.creditWhat}</li>
          <li>{p.creditFreeSteps}</li>
          <li>{p.creditNoTx}</li>
          <li>{p.creditEscalate}</li>
        </ul>
      </section>
    </main>
  );
}
