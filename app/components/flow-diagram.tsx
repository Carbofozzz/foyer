import type { Messages } from "@/lib/i18n/load";
import { StatusPill } from "@/app/components/status-pill";

/**
 * One request walking the product: assistants ask, the gateway checks the rules,
 * a dispute goes to court, and only then the world is touched.
 * Static markup — the travelling pulse is CSS, so this stays a server component.
 */
export function FlowDiagram({
  outline,
  cabinet,
}: {
  outline: Messages["outline"];
  cabinet: Messages["cabinet"];
}) {
  return (
    <div className="flow">
      <div className="flow-track">
        <div className="flow-node">
          <span className="flow-num">01</span>
          <span className="flow-name">{outline.flowAgents}</span>
          <span className="flow-sub">Travel · Budget</span>
        </div>

        <Wire label={cabinet.request} delay="0s" />

        <div className="flow-node">
          <span className="flow-num">02</span>
          <span className="flow-name">{outline.gatewayTitle}</span>
          <span className="flow-sub">{outline.constitutionTitle}</span>
        </div>

        <Wire label={cabinet.objection} delay="0.5s" />

        <div className="flow-node flow-node-court">
          <span className="flow-num">03</span>
          <span className="flow-name">{outline.courtTitle}</span>
          <ul className="flow-outcomes">
            <li>
              <StatusPill tone="ok">{cabinet.outcomeAllowA}</StatusPill>
            </li>
            <li>
              <StatusPill tone="info">{cabinet.outcomeAllowB}</StatusPill>
            </li>
            <li>
              <StatusPill tone="warn">{cabinet.outcomeRemedy}</StatusPill>
            </li>
            <li>
              <StatusPill tone="danger">{cabinet.outcomeEscalate}</StatusPill>
            </li>
          </ul>
        </div>

        <Wire label={cabinet.decision} delay="1s" />

        <div className="flow-node">
          <span className="flow-num">04</span>
          <span className="flow-name">{outline.flowAction}</span>
        </div>
      </div>
    </div>
  );
}

function Wire({ label, delay }: { label: string; delay: string }) {
  return (
    <div className="flow-wire">
      <span className="flow-wire-label">{label}</span>
      <span className="flow-pulse" style={{ animationDelay: delay }} aria-hidden="true" />
    </div>
  );
}
