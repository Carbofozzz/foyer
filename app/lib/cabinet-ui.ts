export const SHOW_TESTS_COOKIE = "foyer_show_tests";
export const CABINET_TAB_COOKIE = "foyer_cabinet_tab";

export function writeClientCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
