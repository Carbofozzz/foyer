/** Short personal_sign body. Wallets print SIWE boilerplate if we use createSiweMessage. */
export function loginMessage(nonce: string): string {
  return `Foyer\n\nSign in to the cabinet.\n\n${nonce}`;
}
