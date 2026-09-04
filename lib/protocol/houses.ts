import { principals, enrollments } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { hashSecret, mintToken } from "./keys";
import type { PrincipalType } from "./types";

export async function createHouse(input: { name: string; type: PrincipalType }) {
  const db = getDb();
  const principalId = mintToken("hou");
  const cabinetToken = mintToken("cab");
  const enrollmentToken = mintToken("enr");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(principals).values({
    id: principalId,
    name: input.name,
    type: input.type,
    constitution: "",
    cabinetTokenHash: hashSecret(cabinetToken),
  });

  await db.insert(enrollments).values({
    tokenHash: hashSecret(enrollmentToken),
    principalId,
    role: "travel",
    name: "Travel",
    expiresAt,
  });

  return {
    principalId,
    cabinetToken,
    enrollmentToken,
  };
}
