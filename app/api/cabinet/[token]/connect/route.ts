import { cabinetFromToken } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { markConnectDone } from "@/lib/protocol/cabinet";
import { issueConnectAgent } from "@/lib/protocol/house-clients";
import { mcpConfig, MCP_PROMPT_LINES, publicOrigin } from "@/lib/mcp/config";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    const issued = await issueConnectAgent(principal);
    const origin = publicOrigin(request);
    return jsonOk({
      agent_key: issued.agent_key,
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
  const auth = await cabinetFromToken(token, request);
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  try {
    await markConnectDone(principal);
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
