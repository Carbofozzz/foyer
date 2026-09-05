import { jsonOk } from "@/lib/protocol/http";
import { publicOrigin } from "@/lib/mcp/config";
import { openApiSpec } from "@/lib/openapi/spec";

export async function GET(request: Request) {
  return jsonOk(openApiSpec(publicOrigin(request)));
}
