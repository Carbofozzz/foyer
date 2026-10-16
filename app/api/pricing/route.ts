import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { listActivePlans, serializePlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plans = await listActivePlans();
    return jsonOk({ plans: plans.map(serializePlan) });
  } catch (error) {
    return protocolFail(error);
  }
}
