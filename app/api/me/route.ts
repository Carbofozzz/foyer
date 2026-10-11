import { jsonOk } from "@/lib/protocol/http";
import { listHousesFor } from "@/lib/protocol/members";
import { sessionUser } from "@/lib/protocol/session";
import { isPlatformAdmin, platformRole } from "@/lib/protocol/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await sessionUser();
  if (!user) return jsonOk({ user: null, houses: [], platform_role: "none", admin: false });
  return jsonOk({
    user: { id: user.id, email: user.email, email_verified: user.emailVerified, name: user.name },
    houses: await listHousesFor(user.id),
    platform_role: platformRole(user),
    admin: isPlatformAdmin(user),
  });
}
