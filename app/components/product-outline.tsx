import type { Messages } from "@/lib/i18n/load";
import { FlowDiagram } from "@/app/components/flow-diagram";

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
  cabinet,
}: {
  outline: Messages["outline"];
  protocol: Messages["protocol"];
  cabinet: Messages["cabinet"];
}) {
  return (
    <>
      <section className="home-outline-wrap">
        <p className="kicker">{outline.kicker}</p>
        <FlowDiagram outline={outline} cabinet={cabinet} />
        <div className="home-outline">
          <article className="card stack">
            <h2 className="section-title">{outline.constitutionTitle}</h2>
            <p>{outline.constitutionLead}</p>
          </article>
          <article className="card stack">
            <h2 className="section-title">{outline.gatewayTitle}</h2>
            <p>{outline.gatewayLead}</p>
          </article>
          <article className="card stack">
            <h2 className="section-title">{outline.courtTitle}</h2>
            <p>{outline.courtLead}</p>
          </article>
        </div>
      </section>
      <details className="card stack protocol-fold">
        <summary className="section-title">{protocol.title}</summary>
        <p className="hint">{protocol.lead}</p>
        <ul className="method-list">
          {METHODS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
