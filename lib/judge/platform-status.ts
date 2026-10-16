import { formatGen } from "@/lib/gen/amount";
import { studioFaucetAvailable } from "./funds";
import { loadCourtGasSummary, type CourtGasSummary } from "./gas-stats";
import { loadPlatformAlertState } from "./platform-alert";
import { platformWallet, platformWalletConfigured } from "./platform-wallet";
import { resolvePlatformThresholds, thresholdsAsGen } from "./platform-thresholds";
import { walletBalance } from "./onchain";

export type PlatformCourtView = {
  configured: boolean;
  address: string | null;
  balance: string | null;
  balance_wei: string | null;
  floor_wei: string;
  alert_wei: string;
  floor_gen: string;
  alert_gen: string;
  thresholds_from_ops: boolean;
  below_floor: boolean;
  below_alert: boolean;
  alert_latched: boolean;
  low_alert_at: string | null;
  studio_faucet: boolean;
  gas: CourtGasSummary;
};

export async function loadPlatformCourtView(): Promise<PlatformCourtView> {
  const gas = await loadCourtGasSummary(30);
  const alertState = await loadPlatformAlertState();
  const thresholds = await resolvePlatformThresholds();
  const gen = thresholdsAsGen(thresholds);
  const floor = thresholds.floorWei;
  const alert = thresholds.alertWei;

  if (!platformWalletConfigured()) {
    return {
      configured: false,
      address: null,
      balance: null,
      balance_wei: null,
      floor_wei: floor.toString(),
      alert_wei: alert.toString(),
      floor_gen: gen.floor_gen,
      alert_gen: gen.alert_gen,
      thresholds_from_ops: thresholds.fromOps,
      below_floor: true,
      below_alert: true,
      alert_latched: alertState.latched,
      low_alert_at: alertState.low_alert_at,
      studio_faucet: studioFaucetAvailable(),
      gas,
    };
  }

  const wallet = platformWallet()!;
  const wei = (await walletBalance(wallet.address)) ?? BigInt(0);
  return {
    configured: true,
    address: wallet.address,
    balance: formatGen(wei),
    balance_wei: wei.toString(),
    floor_wei: floor.toString(),
    alert_wei: alert.toString(),
    floor_gen: gen.floor_gen,
    alert_gen: gen.alert_gen,
    thresholds_from_ops: thresholds.fromOps,
    below_floor: wei < floor,
    below_alert: wei < alert,
    alert_latched: alertState.latched,
    low_alert_at: alertState.low_alert_at,
    studio_faucet: studioFaucetAvailable(),
    gas,
  };
}
