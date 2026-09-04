import { requireCabinet } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { markConnectDone } from "@/lib/protocol/cabinet";
import { issueConnectAgent } from "@/lib/protocol/house-clients";
import { cursorMcpConfig, CURSOR_PROMPT_LINES, publicOrigin } from "@/lib/mcp/cursor";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const principal = await requireCabinet(token);
  if (!principal) return jsonError("not_found", "Unknown house", 404);
  try {
    const issued = await issueConnectAgent(principal);
    const origin = publicOrigin(request);
    return jsonOk({
      agent_key: issued.agent_key,
      mcp_url: `${origin}/api/mcp`,
      cursor_config: cursorMcpConfig(origin, issued.agent_key),
      prompt_lines: CURSOR_PROMPT_LINES,
    });
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const principal = await requireCabinet(token);
  if (!principal) return jsonError("not_found", "Unknown house", 404);
  try {
    await markConnectDone(principal);
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
