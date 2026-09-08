import type { Messages } from "@/lib/i18n/load";
import { FlowDiagram } from "@/app/components/flow-diagram";

export function ProductOutline({ outline }: { outline: Messages["outline"] }) {
  return (
    <section className="home-outline-wrap">
      <p className="kicker">{outline.kicker}</p>
      <FlowDiagram outline={outline} />
      <div className="home-outline">
        <article className="card stack">
          <h2 className="section-title">{outline.card1Title}</h2>
          <p>{outline.card1Lead}</p>
        </article>
        <article className="card stack">
          <h2 className="section-title">{outline.card2Title}</h2>
          <p>{outline.card2Lead}</p>
        </article>
        <article className="card stack">
          <h2 className="section-title">{outline.card3Title}</h2>
          <p>{outline.card3Lead}</p>
        </article>
      </div>
    </section>
  );
}
