import { loadMessages } from "@/lib/i18n/load";
import { isLocale, type Locale } from "@/lib/i18n/config";

export async function sendMail(input: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("mail is not configured");
    }
    console.info(`[mail off] to=${input.to} subject=${input.subject}\n${input.text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend ${response.status} ${body.slice(0, 200)}`);
  }
}

export function notifyCopy(locale: string) {
  const loc: Locale = isLocale(locale) ? locale : "en";
  return loadMessages(loc).notify;
}
