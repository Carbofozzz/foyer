/**
 * OS secret store for lock hands. The MCP paste must not carry these keys.
 * Service: foyer.lock. Accounts: pay.x402, pay.ap2.
 */
import { spawnSync } from "node:child_process";

export const LOCK_SERVICE = "foyer.lock";
export const PAY_X402_ACCOUNT = "pay.x402";
export const PAY_AP2_ACCOUNT = "pay.ap2";

export function readLockSecret(account) {
  if (process.platform === "darwin") return readDarwin(account);
  if (process.platform === "linux") return readLinux(account);
  if (process.platform === "win32") return readWindows(account);
  return "";
}

export function hasPayerKey() {
  return Boolean(normalizeKey(readLockSecret(PAY_X402_ACCOUNT)));
}

export function payerKey() {
  const key = normalizeKey(readLockSecret(PAY_X402_ACCOUNT));
  if (!key) throw new Error("Payer key is not in the OS keychain (foyer.lock / pay.x402)");
  return key;
}

export function ap2Key() {
  const key = readLockSecret(PAY_AP2_ACCOUNT).trim();
  if (!key || key === "YOUR_KEY") throw new Error("Signing key is not in the OS keychain (foyer.lock / pay.ap2)");
  return key;
}

function normalizeKey(raw) {
  const key = String(raw || "").trim();
  if (!key || key === "YOUR_KEY") return "";
  return key.startsWith("0x") ? key : `0x${key}`;
}

function readDarwin(account) {
  const result = spawnSync("security", ["find-generic-password", "-s", LOCK_SERVICE, "-a", account, "-w"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return "";
  return (result.stdout || "").trim();
}

function readLinux(account) {
  const result = spawnSync("secret-tool", ["lookup", "service", LOCK_SERVICE, "account", account], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return "";
  return (result.stdout || "").trim();
}

function readWindows(account) {
  const script = [
    "Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue | Out-Null",
    "[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]",
    "$vault = New-Object Windows.Security.Credentials.PasswordVault",
    `try { $c = $vault.Retrieve('${LOCK_SERVICE}','${account}'); $c.RetrievePassword(); Write-Output $c.Password } catch { }`,
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return "";
  return (result.stdout || "").trim();
}
