"use client";

import { useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import type { Messages } from "@/lib/i18n/load";

type ConnectPayload = {
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
};

export function TechCard({
  token,
  houseId,
  locale,
  t,
  errorLabel,
  docLabel,
}: {
  token: string;
  houseId?: string;
  locale: string;
  t: Messages["tech"];
  errorLabel: string;
  docLabel: string;
}) {
  const [data, setData] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/cabinet/${token}/connect`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: ConnectPayload }>;
      })
      .then((payload) => setData(payload.data))
      .catch(() => setError(true));
  }, [token, houseId]);

  if (error) return <p className="error">{errorLabel}</p>;
  if (!data) return <p className="muted">{t.loading}</p>;

  const origin = data.mcp_url.replace(/\/api\/mcp$/, "");
  const curl = curlSample(origin, data.agent_key);
  const python = pythonSample(origin, data.agent_key);
  const mcp = mcpPingSample(origin, data.agent_key);
  const cli = [
    `FOYER_URL=${origin} FOYER_AGENT_KEY=${data.agent_key} npm run http:client`,
    `FOYER_URL=${origin} FOYER_AGENT_KEY=${data.agent_key} npm run http:client -- --propose`,
  ].join("\n");

  return (
    <div className="stack">
      <p className="hint">{t.lead}</p>
      <p>
        <a href={`/${locale}/connect`}>{docLabel}</a>
        {" · "}
        <a href="/api/openapi" target="_blank" rel="noreferrer">
          {t.openapi}
        </a>
      </p>
      <label>
        {t.curlLabel}
        <textarea readOnly rows={8} value={curl} />
      </label>
      <CopyButton text={curl} copyLabel={t.copy} copiedLabel={t.copied} />
      <label>
        {t.pythonLabel}
        <textarea readOnly rows={10} value={python} />
      </label>
      <CopyButton text={python} copyLabel={t.copy} copiedLabel={t.copied} />
      <label>
        {t.mcpLabel}
        <textarea readOnly rows={3} value={mcp} />
      </label>
      <CopyButton text={mcp} copyLabel={t.copy} copiedLabel={t.copied} />
      <label>
        {t.cliLabel}
        <textarea readOnly rows={3} value={cli} />
      </label>
      <CopyButton text={cli} copyLabel={t.copy} copiedLabel={t.copied} />
    </div>
  );
}

function curlSample(origin: string, key: string) {
  return [
    `curl -s ${origin}/api/constitution \\`,
    `  -H "Authorization: Bearer ${key}"`,
    "",
    `curl -s ${origin}/api/inbox \\`,
    `  -H "Authorization: Bearer ${key}"`,
    "",
    `curl -s ${origin}/api/actions \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -H "content-type: application/json" \\`,
    `  -d '{"kind":"book","payload":{"kind":"book","summary":"Probe"},"justification":"HTTP loop"}'`,
  ].join("\n");
}

function pythonSample(origin: string, key: string) {
  return [
    "import json, urllib.request",
    `ORIGIN = ${JSON.stringify(origin)}`,
    `KEY = ${JSON.stringify(key)}`,
    "req = urllib.request.Request(",
    "    f\"{ORIGIN}/api/constitution\",",
    "    headers={\"Authorization\": f\"Bearer {KEY}\"},",
    ")",
    "print(json.load(urllib.request.urlopen(req)))",
  ].join("\n");
}

function mcpPingSample(origin: string, key: string) {
  return [
    `curl -s ${origin}/api/mcp \\`,
    `  -H "Authorization: Bearer ${key}"`,
  ].join("\n");
}
