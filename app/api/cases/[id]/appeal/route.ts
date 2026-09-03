import { jsonError } from "@/lib/protocol/http";

export async function POST() {
  return jsonError("not_implemented", "Appeal lands on day 3", 501);
}
