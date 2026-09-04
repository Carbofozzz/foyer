import type { Messages } from "@/lib/i18n/load";

const METHODS = [
  "POST /api/agents",
  "GET /api/constitution",
  "POST /api/actions",
  "POST /api/actions/:id/objections",
  "GET /api/inbox",
  "POST /api/actions/:id/ack",
  "GET /api/actions/:id",
  "POST /api/cases/:id/appeal",
  "POST /api/mcp",
  "POST /api/tick",
];

export function ProductOutline({
  outline,
  protocol,
}: {
  outline: Messages["outline"];
  protocol: Messages["protocol"];
}) {
  return (
    <>
      <section className="card stack">
        <p className="kicker">{outline.kicker}</p>
        <h2 className="section-title">{outline.constitutionTitle}</h2>
        <p>{outline.constitutionLead}</p>
        <h2 className="section-title">{outline.gatewayTitle}</h2>
        <p>{outline.gatewayLead}</p>
        <h2 className="section-title">{outline.courtTitle}</h2>
        <p>{outline.courtLead}</p>
      </section>
      <section className="card stack">
        <h2 className="section-title">{protocol.title}</h2>
        <p className="hint">{protocol.lead}</p>
        <ul className="method-list">
          {METHODS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
