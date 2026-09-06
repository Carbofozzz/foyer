import { mcpConfig, MCP_PROMPT_LINES } from "@/lib/mcp/config";

export const DEMO_TOKEN = "demo";

export type DemoCase = {
  id: "a" | "b" | "c" | "d" | "e" | "f";
  kind: "book" | "message" | "spend";
  outcome: "allow_a" | "allow_b" | "remedy" | "escalate";
  clauses: Array<"save" | "promisesYes" | "securityYes" | "orgLegal">;
};

export const DEMO_CASES: DemoCase[] = [
  { id: "a", kind: "book", outcome: "remedy", clauses: ["save", "promisesYes"] },
  { id: "b", kind: "book", outcome: "allow_b", clauses: ["save", "promisesYes"] },
  { id: "c", kind: "message", outcome: "allow_b", clauses: ["save", "promisesYes", "securityYes"] },
  { id: "d", kind: "message", outcome: "allow_b", clauses: ["orgLegal"] },
  { id: "e", kind: "book", outcome: "allow_a", clauses: ["save", "promisesYes"] },
  { id: "f", kind: "spend", outcome: "escalate", clauses: [] },
];


const DEMO_ORIGIN = "https://foyerapp.dev";
const DEMO_KEY = "agk_demo";

export const DEMO_TREASURY = {
  address: "0x1111111111111111111111111111111111111111",
  balance: "12.4000",
  withdrawable: "12.3000",
  owner: null,
  transfers: [
    {
      id: "demo-in",
      kind: "deposit" as const,
      tx: "demo-deposit",
      from: "0x2222222222222222222222222222222222222222",
      to: "0x1111111111111111111111111111111111111111",
      amount: "15",
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "demo-court",
      kind: "court" as const,
      tx: "demo-court",
      from: "0x1111111111111111111111111111111111111111",
      to: "0x0000000000000000000000000000000000000000",
      amount: "0.1",
      created_at: "2026-09-01T00:10:00.000Z",
    },
  ],
};

export function demoConnect() {
  return {
    agent_key: DEMO_KEY,
    mcp_url: `${DEMO_ORIGIN}/api/mcp`,
    mcp_config: mcpConfig(DEMO_ORIGIN, DEMO_KEY),
    prompt_lines: [...MCP_PROMPT_LINES],
  };
}
