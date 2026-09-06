import { cabinetFromToken, needOperate } from "@/lib/protocol/auth";
import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { markConnectDone } from "@/lib/protocol/cabinet";
import { issueConnectAgent, listConnectAgents } from "@/lib/protocol/house-clients";
import { mcpConfig, MCP_PROMPT_LINES, publicOrigin } from "@/lib/mcp/config";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    const origin = publicOrigin(request);
    const agents = (await listConnectAgents(auth.principal.id)).map((row) => ({
      ...row,
      mcp_config: mcpConfig(origin, row.agent_key),
      mcp_url: `${origin}/api/mcp`,
    }));
    return jsonOk({ agents, prompt_lines: MCP_PROMPT_LINES });
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needOperate(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    if (isRecord(body) && typeof body.name === "string" && body.name.trim()) {
      const issued = await issueConnectAgent(auth.principal, body.name);
      await markConnectDone(auth.principal);
      const origin = publicOrigin(request);
      return jsonOk(
        {
          ...issued,
          mcp_url: `${origin}/api/mcp`,
          mcp_config: mcpConfig(origin, issued.agent_key),
          prompt_lines: MCP_PROMPT_LINES,
        },
        issued.created ? 201 : 200,
      );
    }
    await markConnectDone(auth.principal);
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
