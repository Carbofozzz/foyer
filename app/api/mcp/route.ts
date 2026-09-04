import { handleMcpPost, mcpOptions } from "@/lib/mcp/handler";

export async function OPTIONS() {
  return mcpOptions();
}

export async function POST(request: Request) {
  return handleMcpPost(request);
}
