import { handleMcpGet, handleMcpPost, mcpOptions } from "@/lib/mcp/handler";

export async function OPTIONS() {
  return mcpOptions();
}

export async function GET(request: Request) {
  return handleMcpGet(request);
}

export async function POST(request: Request) {
  return handleMcpPost(request);
}
