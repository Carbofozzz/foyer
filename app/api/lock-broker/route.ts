import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The program the customer runs on their computer. No secrets. Foyer does not run it. */
export async function GET() {
  const root = process.cwd();
  try {
    const body = await readFile(path.join(root, "scripts/foyer-lock.bundle.mjs")).catch(() =>
      readFile(path.join(root, "scripts/lock-broker.mjs")),
    );
    return new NextResponse(body, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "content-disposition": 'attachment; filename="foyer-lock.mjs"',
      },
    });
  } catch {
    return NextResponse.json({ error: { message: "Broker file is missing." } }, { status: 404 });
  }
}
