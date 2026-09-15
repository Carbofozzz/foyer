import { cabinetFromToken, needGrant } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { markConnectDone } from "@/lib/protocol/cabinet";
import { mcpConfig, MCP_PROMPT_LINES, publicOrigin } from "@/lib/mcp/config";
import { issueConnectAgent, listConnectAgents, rotateConnectAgent, updateAgentPrompt } from "@/lib/protocol/house-clients";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needGrant(await cabinetFromToken(token, request), "agents");
  if ("error" in auth) return auth.error;
  try {
    const origin = publicOrigin(request);
    const agents = (await listConnectAgents(auth.principal.id)).map((row) => ({
      ...row,
      mcp_config: mcpConfig(origin, row.agent_key, row.sign_secret, row.prompt_sha),
      mcp_url: `${origin}/api/mcp`,
    }));
    return jsonOk({ agents, prompt_lines: MCP_PROMPT_LINES });
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needGrant(await cabinetFromToken(token, request), "agents");
  if ("error" in auth) return auth.error;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    if (isRecord(body) && body.rotate === true && typeof body.id === "string" && body.id.trim()) {
      const rotated = await rotateConnectAgent(auth.principal, body.id);
      const origin = publicOrigin(request);
      return jsonOk({
        ...rotated,
        mcp_url: `${origin}/api/mcp`,
        mcp_config: mcpConfig(origin, rotated.agent_key, rotated.sign_secret, rotated.prompt_sha),
      });
    }
    if (isRecord(body) && typeof body.name === "string" && body.name.trim()) {
      const issued = await issueConnectAgent(auth.principal, body);
      await markConnectDone(auth.principal);
      const origin = publicOrigin(request);
      return jsonOk(
        {
          ...issued,
          mcp_url: `${origin}/api/mcp`,
          mcp_config: mcpConfig(origin, issued.agent_key, issued.sign_secret, issued.prompt_sha),
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

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needGrant(await cabinetFromToken(token, request), "agents");
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.id !== "string" || !body.id.trim()) {
    return jsonError("bad_request", "id is required", 400);
  }
  try {
    const origin = publicOrigin(request);
    const updated = await updateAgentPrompt(auth.principal, body.id, body);
    return jsonOk({
      ...updated,
      mcp_url: `${origin}/api/mcp`,
      mcp_config: mcpConfig(origin, updated.agent_key, updated.sign_secret, updated.prompt_sha),
    });
  } catch (error) {
    return protocolFail(error);
  }
}
