import { desc, eq, inArray } from "drizzle-orm";
import {
  acks,
  actionReports,
  actions,
  agents,
  cases,
  decideTokens,
  emailConfirmTokens,
  enrollments,
  executions,
  houseMembers,
  notifications,
  objections,
  principals,
  spendReceipts,
  telegramLinkTokens,
  verdicts,
  waitlist,
  wakes,
  walletTransfers,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ownerKey } from "@/lib/gen/chain";
import { ProtocolError } from "./errors";
import { readSession } from "./session";
import { parseWaitlistEmail } from "./waitlist";

export type AdminWaitlistRow = {
  email: string;
  locale: string;
  created_at: string;
};

export type AdminContactRow = {
  email: string;
  verified: boolean;
  owner: string | null;
  spawn: boolean;
};

export type AdminHouseRow = {
  id: string;
  owner: string | null;
  type: string;
  spawn: boolean;
  created_at: string;
  connected: boolean;
  contact_email: string | null;
  email_verified: boolean;
  telegram: boolean;
  telegram_handle: string | null;
  court: boolean;
  agents: number;
  hooks: number;
  members: number;
  actions: number;
  test_actions: number;
  escalated: number;
  last_action_at: string | null;
};

export type AdminOverview = {
  waitlist: AdminWaitlistRow[];
  contacts: AdminContactRow[];
  houses: AdminHouseRow[];
  totals: {
    waitlist: number;
    contacts: number;
    houses: number;
    live: number;
    spawn: number;
    agents: number;
    hooks: number;
    escalated: number;
  };
};

export function configuredAdminAddress(): `0x${string}` | null {
  const raw = process.env.FOYER_ADMIN_ADDRESS?.trim();
  if (!raw) return null;
  return ownerKey(raw);
}

export function isAdminAddress(address: string | null | undefined): boolean {
  const admin = configuredAdminAddress();
  const key = address ? ownerKey(address) : null;
  return Boolean(admin && key && admin === key);
}

export function requireAdmin(request: Request): { address: `0x${string}` } {
  const admin = configuredAdminAddress();
  if (!admin) throw new ProtocolError("not_found", "Not found", 404);
  const session = readSession(request);
  if (!session) throw new ProtocolError("unauthorized", "Sign in required", 401);
  if (session.address !== admin) throw new ProtocolError("not_found", "Not found", 404);
  return session;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const db = getDb();
  const [waitlistRows, houseRows, agentRows, actionRows, memberRows] = await Promise.all([
    db.select().from(waitlist).orderBy(desc(waitlist.createdAt)),
    db
      .select({
        id: principals.id,
        type: principals.type,
        isSpawn: principals.isSpawn,
        ownerAddress: principals.ownerAddress,
        createdAt: principals.createdAt,
        wizardConnectDone: principals.wizardConnectDone,
        contactEmail: principals.contactEmail,
        emailVerifiedAt: principals.emailVerifiedAt,
        telegramLinkedAt: principals.telegramLinkedAt,
        telegramHandle: principals.telegramHandle,
        courtContract: principals.courtContract,
      })
      .from(principals)
      .orderBy(desc(principals.createdAt)),
    db
      .select({
        principalId: agents.principalId,
        wake: agents.wake,
        isGuardian: agents.isGuardian,
      })
      .from(agents),
    db
      .select({
        principalId: actions.principalId,
        status: actions.status,
        testPass: actions.testPass,
        createdAt: actions.createdAt,
      })
      .from(actions),
    db.select({ principalId: houseMembers.principalId }).from(houseMembers),
  ]);

  const agentByHouse = new Map<string, { agents: number; hooks: number }>();
  for (const row of agentRows) {
    if (row.isGuardian) continue;
    const current = agentByHouse.get(row.principalId) ?? { agents: 0, hooks: 0 };
    current.agents += 1;
    if (row.wake === "callback") current.hooks += 1;
    agentByHouse.set(row.principalId, current);
  }

  const actionByHouse = new Map<
    string,
    { actions: number; test_actions: number; escalated: number; last: Date | null }
  >();
  for (const row of actionRows) {
    const current = actionByHouse.get(row.principalId) ?? {
      actions: 0,
      test_actions: 0,
      escalated: 0,
      last: null,
    };
    if (row.testPass) current.test_actions += 1;
    else current.actions += 1;
    if (row.status === "escalated") current.escalated += 1;
    if (!current.last || row.createdAt > current.last) current.last = row.createdAt;
    actionByHouse.set(row.principalId, current);
  }

  const memberByHouse = new Map<string, number>();
  for (const row of memberRows) {
    memberByHouse.set(row.principalId, (memberByHouse.get(row.principalId) ?? 0) + 1);
  }

  const houses: AdminHouseRow[] = houseRows.map((row) => {
    const agent = agentByHouse.get(row.id) ?? { agents: 0, hooks: 0 };
    const action = actionByHouse.get(row.id) ?? {
      actions: 0,
      test_actions: 0,
      escalated: 0,
      last: null,
    };
    return {
      id: row.id,
      owner: row.ownerAddress,
      type: row.type,
      spawn: row.isSpawn,
      created_at: row.createdAt.toISOString(),
      connected: row.wizardConnectDone,
      contact_email: row.contactEmail,
      email_verified: Boolean(row.emailVerifiedAt),
      telegram: Boolean(row.telegramLinkedAt),
      telegram_handle: row.telegramHandle,
      court: Boolean(row.courtContract),
      agents: agent.agents,
      hooks: agent.hooks,
      members: memberByHouse.get(row.id) ?? 0,
      actions: action.actions,
      test_actions: action.test_actions,
      escalated: action.escalated,
      last_action_at: iso(action.last),
    };
  });

  const contacts: AdminContactRow[] = houses
    .filter((row) => row.contact_email)
    .map((row) => ({
      email: row.contact_email as string,
      verified: row.email_verified,
      owner: row.owner,
      spawn: row.spawn,
    }));

  return {
    waitlist: waitlistRows.map((row) => ({
      email: row.email,
      locale: row.locale,
      created_at: row.createdAt.toISOString(),
    })),
    contacts,
    houses,
    totals: {
      waitlist: waitlistRows.length,
      contacts: contacts.length,
      houses: houses.length,
      live: houses.filter((row) => !row.spawn).length,
      spawn: houses.filter((row) => row.spawn).length,
      agents: houses.reduce((sum, row) => sum + row.agents, 0),
      hooks: houses.reduce((sum, row) => sum + row.hooks, 0),
      escalated: houses.reduce((sum, row) => sum + row.escalated, 0),
    },
  };
}

export async function deleteWaitlistEmail(raw: string) {
  const email = parseWaitlistEmail(raw);
  const db = getDb();
  const removed = await db.delete(waitlist).where(eq(waitlist.email, email)).returning({ email: waitlist.email });
  if (removed.length === 0) throw new ProtocolError("not_found", "Not found", 404);
}

export async function deleteHouse(houseId: string) {
  const id = houseId.trim();
  if (!id || id.length > 80) throw new ProtocolError("bad_request", "house_id is invalid", 400);
  const db = getDb();
  const [house] = await db.select({ id: principals.id }).from(principals).where(eq(principals.id, id)).limit(1);
  if (!house) throw new ProtocolError("not_found", "Not found", 404);

  const actionRows = await db.select({ id: actions.id }).from(actions).where(eq(actions.principalId, id));
  const actionIds = actionRows.map((row) => row.id);
  const caseRows =
    actionIds.length === 0
      ? []
      : await db.select({ id: cases.id }).from(cases).where(inArray(cases.actionId, actionIds));
  const caseIds = caseRows.map((row) => row.id);

  if (actionIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.actionId, actionIds));
    await db.delete(decideTokens).where(inArray(decideTokens.actionId, actionIds));
    await db.delete(actionReports).where(inArray(actionReports.actionId, actionIds));
    await db.delete(spendReceipts).where(inArray(spendReceipts.actionId, actionIds));
    await db.delete(executions).where(inArray(executions.actionId, actionIds));
    await db.delete(acks).where(inArray(acks.actionId, actionIds));
    if (caseIds.length > 0) await db.delete(verdicts).where(inArray(verdicts.caseId, caseIds));
    await db.delete(cases).where(inArray(cases.actionId, actionIds));
    await db.delete(wakes).where(inArray(wakes.actionId, actionIds));
    await db.delete(objections).where(inArray(objections.actionId, actionIds));
    await db.delete(actions).where(inArray(actions.id, actionIds));
  }

  await db.delete(enrollments).where(eq(enrollments.principalId, id));
  await db.delete(emailConfirmTokens).where(eq(emailConfirmTokens.principalId, id));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, id));
  await db.delete(walletTransfers).where(eq(walletTransfers.principalId, id));
  await db.delete(houseMembers).where(eq(houseMembers.principalId, id));
  await db.delete(spendReceipts).where(eq(spendReceipts.principalId, id));
  await db.delete(agents).where(eq(agents.principalId, id));
  await db.delete(principals).where(eq(principals.id, id));
}
