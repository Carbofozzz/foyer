import type { ActionPayload, EvidenceItem } from "@/lib/protocol/types";

export type OpenInboxItem = {
  id: string;
  proposerId: string;
  kind: string;
  payload: ActionPayload;
  evidence: EvidenceItem[];
  status: string;
  alreadyObjected: boolean;
};

export type ObjectionDraft = {
  actionId: string;
  justification: string;
  evidence: EvidenceItem[];
  counter_action: ActionPayload | null;
};
