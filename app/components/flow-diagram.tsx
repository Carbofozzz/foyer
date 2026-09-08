import type { ReactNode } from "react";
import type { Messages } from "@/lib/i18n/load";
import { StatusPill, type PillTone } from "@/app/components/status-pill";

/**
 * The whole request path on one rail: two steps, the fork, court, three endings.
 * Numbered bullets carry the spine; hollow bullets are what can happen along it.
 */
export function FlowDiagram({ outline }: { outline: Messages["outline"] }) {
  return (
    <div className="flow">
      <Row mark="1">
        <div className="flow-node">
          <span className="flow-name">{outline.flowAsk}</span>
        </div>
      </Row>

      <Row mark="2">
        <div className="flow-node">
          <span className="flow-name">{outline.flowWait}</span>
        </div>
      </Row>

      <Row>
        <div className="flow-node is-end">
          <span className="flow-sub">{outline.flowQuiet}</span>
          <span className="flow-name">{outline.flowQuietOut}</span>
        </div>
      </Row>

      <Row>
        <div className="flow-node">
          <span className="flow-sub">{outline.flowObject}</span>
          <span className="flow-name">{outline.flowTalk}</span>
          <ul className="flow-picks">
            <li>{outline.flowTakeBack}</li>
            <li>{outline.flowChange}</li>
            <li className="is-cont">{outline.flowCourtAsk}</li>
          </ul>
        </div>
      </Row>

      <Row mark="3">
        <div className="flow-node flow-node-court">
          <span className="flow-name">{outline.flowCourt}</span>
        </div>
      </Row>

      <Row last>
        <div className="flow-ends">
          <Ending tone="ok" label={outline.flowYes} text={outline.flowAfterYes} />
          <Ending tone="info" label={outline.flowNo} text={outline.flowAfterNo} />
          <Ending tone="danger" label={outline.flowYou} text={outline.flowAfterYou} />
        </div>
      </Row>
    </div>
  );
}

function Row({ mark, last, children }: { mark?: string; last?: boolean; children: ReactNode }) {
  return (
    <div className={last ? "flow-row is-last" : "flow-row"}>
      <span className={mark ? "flow-bullet" : "flow-bullet is-dot"} aria-hidden="true">
        {mark}
      </span>
      {children}
    </div>
  );
}

function Ending({ tone, label, text }: { tone: PillTone; label: string; text: string }) {
  return (
    <div className="flow-node is-end">
      <StatusPill tone={tone}>{label}</StatusPill>
      <span className="flow-name">{text}</span>
    </div>
  );
}
