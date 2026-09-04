import { headers } from "next/headers";

export async function incomingRequest(): Promise<Request> {
  return new Request("http://local", { headers: await headers() });
}
