import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { markConnectDone } from "@/lib/protocol/cabinet";
import { connectRolesFor, issueConnectAgent } from "@/lib/protocol/house-clients";
import { mcpConfig, MCP_PROMPT_LINES, publicOrigin } from "@/lib/mcp/config";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    const wanted = new URL(request.url).searchParams.get("role") ?? undefined;
    const issued = await issueConnectAgent(principal, wanted);
    const origin = publicOrigin(request);
    return jsonOk({
      agent_key: issued.agent_key,
      role: issued.role,
      name: issued.name,
      roles: connectRolesFor(principal.type),
      mcp_url: `${origin}/api/mcp`,
      mcp_config: mcpConfig(origin, issued.agent_key),
      prompt_lines: MCP_PROMPT_LINES,
    });
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    await markConnectDone(principal);
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
