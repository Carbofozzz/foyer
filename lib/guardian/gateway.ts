import { guardianSystemPrompt, guardianUserPrompt } from "./compare";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const CALL_MS = 20_000;

export type GatewayResult =
  | { ok: true; content: string; tokens: number }
  | { ok: false; error: string; tokens: number };

export function guardianModel(): string {
  const model = process.env.FOYER_GUARDIAN_MODEL?.trim();
  return model || DEFAULT_MODEL;
}

export function guardianGatewayKey(): string {
  return process.env.AI_GATEWAY_API_KEY?.trim() ?? "";
}

function chatCompletionsUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

export async function completeGuardian(input: {
  constitution: string;
  proposal: string;
  addendum?: string;
  own?: { url: string; key: string; model: string };
}): Promise<GatewayResult> {
  const own = input.own;
  const key = own?.key || guardianGatewayKey();
  const resolvedModel = own?.model || (await import("./model")).resolveGuardianModel();
  const model = await resolvedModel;
  const url = own ? chatCompletionsUrl(own.url) : GATEWAY_URL;
  if (!key) return { ok: false, error: own ? "House LLM key is empty" : "AI_GATEWAY_API_KEY is unset", tokens: 0 };
  const system = input.addendum?.trim()
    ? `${guardianSystemPrompt()} House note: ${input.addendum.trim()}`
    : guardianSystemPrompt();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: guardianUserPrompt(input.constitution, input.proposal) },
        ],
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      usage?: { total_tokens?: number };
      choices?: { message?: { content?: string } }[];
    } | null;
    const reported = payload?.usage?.total_tokens;
    const tokens = typeof reported === "number" && Number.isFinite(reported) ? reported : null;
    if (!response.ok) {
      const message = payload?.error?.message || `Gateway HTTP ${response.status}`;
      return { ok: false, error: message, tokens: tokens ?? 0 };
    }
    const content = payload?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return { ok: false, error: "Empty gateway content", tokens: 0 };
    // A body with no usage field still counts as a response. An explicit zero does not.
    return { ok: true, content, tokens: tokens === null ? 1 : tokens };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway call failed";
    return { ok: false, error: message, tokens: 0 };
  } finally {
    clearTimeout(timer);
  }
}
