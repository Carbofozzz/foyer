import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const principals = pgTable("principals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  constitution: text("constitution").notNull(),
  silenceWindowSec: integer("silence_window_sec").notNull().default(60),
  ackTimeoutSec: integer("ack_timeout_sec").notNull().default(300),
  appealWindowSec: integer("appeal_window_sec").notNull().default(600),
  cabinetTokenHash: text("cabinet_token_hash").notNull().unique(),
  lockedKinds: jsonb("locked_kinds")
    .$type<string[]>()
    .notNull()
    .default(sql`'["spend","book","message"]'::jsonb`),
  wizardRulesDone: boolean("wizard_rules_done").notNull().default(false),
  wizardLockDone: boolean("wizard_lock_done").notNull().default(false),
  wizardConnectDone: boolean("wizard_connect_done").notNull().default(false),
  isSpawn: boolean("is_spawn").notNull().default(false),
  courtContract: text("court_contract"),
  walletAddress: text("wallet_address"),
  sealedWalletKey: text("sealed_wallet_key"),
  ownerAddress: text("owner_address").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  principalId: text("principal_id")
    .notNull()
    .references(() => principals.id),
  role: text("role").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  sealedKey: text("sealed_key"),
  isGuardian: boolean("is_guardian").notNull().default(false),
  bondBalance: integer("bond_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollments = pgTable("enrollments", {
  tokenHash: text("token_hash").primaryKey(),
  principalId: text("principal_id")
    .notNull()
    .references(() => principals.id),
  role: text("role").notNull(),
  name: text("name").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const actions = pgTable(
  "actions",
  {
    id: text("id").primaryKey(),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => agents.id),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    justification: text("justification").notNull(),
    evidence: jsonb("evidence").notNull(),
    status: text("status").notNull(),
    silenceUntil: timestamp("silence_until", { withTimezone: true }).notNull(),
    ackUntil: timestamp("ack_until", { withTimezone: true }),
    appealUntil: timestamp("appeal_until", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("actions_principal_status_silence").on(table.principalId, table.status, table.silenceUntil)],
);

export const objections = pgTable(
  "objections",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id),
    objectorId: text("objector_id")
      .notNull()
      .references(() => agents.id),
    justification: text("justification").notNull(),
    evidence: jsonb("evidence").notNull(),
    bond: text("bond").notNull(),
    counterAction: jsonb("counter_action"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("objections_action_objector").on(table.actionId, table.objectorId)],
);

export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  actionId: text("action_id")
    .notNull()
    .references(() => actions.id),
  constitutionSnapshot: text("constitution_snapshot").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verdicts = pgTable("verdicts", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id),
  outcome: text("outcome").notNull(),
  remedyAction: jsonb("remedy_action"),
  reasoning: text("reasoning").notNull(),
  objectionGrounded: boolean("objection_grounded").notNull(),
  judge: text("judge").notNull(),
  tx: text("tx"),
  appealOf: text("appeal_of"),
  escalateExternal: boolean("escalate_external").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const acks = pgTable(
  "acks",
  {
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.actionId, table.agentId] })],
);

export const executions = pgTable("executions", {
  id: text("id").primaryKey(),
  actionId: text("action_id")
    .notNull()
    .references(() => actions.id),
  kind: text("kind").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletTransfers = pgTable(
  "wallet_transfers",
  {
    id: text("id").primaryKey(),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id),
    kind: text("kind").notNull(),
    tx: text("tx").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    amountWei: text("amount_wei").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wallet_transfers_tx").on(table.tx)],
);

/** Wallet that can open this house. Same SIWE login — no second password. */
export const houseMembers = pgTable(
  "house_members",
  {
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id),
    address: text("address").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.principalId, table.address] })],
);

export const waitlist = pgTable("waitlist", {
  email: text("email").primaryKey(),
  locale: text("locale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Almost-real spend adapter receipts. Not a bank wire. */
export const spendReceipts = pgTable("spend_receipts", {
  id: text("id").primaryKey(),
  principalId: text("principal_id")
    .notNull()
    .references(() => principals.id),
  actionId: text("action_id")
    .notNull()
    .references(() => actions.id)
    .unique(),
  amount: text("amount"),
  currency: text("currency"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateBuckets = pgTable("rate_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const requestLogs = pgTable("request_logs", {
  id: text("id").primaryKey(),
  route: text("route").notNull(),
  method: text("method").notNull(),
  status: integer("status").notNull(),
  ipHash: text("ip_hash").notNull(),
  ms: integer("ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cronTicks = pgTable("cron_ticks", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  houses: integer("houses").notNull().default(0),
  advanced: integer("advanced").notNull().default(0),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
});
