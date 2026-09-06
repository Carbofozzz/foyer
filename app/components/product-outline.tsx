import type { Messages } from "@/lib/i18n/load";
import { FlowDiagram } from "@/app/components/flow-diagram";

export function ProductOutline({
  outline,
  cabinet,
}: {
  outline: Messages["outline"];
  cabinet: Messages["cabinet"];
}) {
  return (
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
  );
}
