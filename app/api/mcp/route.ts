import { handleMcpGet, handleMcpPost, mcpOptions } from "@/lib/mcp/handler";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function OPTIONS() {
  return mcpOptions();
}

export async function GET(request: Request) {
  return handleMcpGet(request);
}

export async function POST(request: Request) {
  return guardPublicWrite(request, "mcp", LIMITS.mcp, () => handleMcpPost(request));
}
