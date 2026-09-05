export type PricePreference = "save" | "balance" | "comfort";
export type HouseKind = "personal" | "org";

export type CharterLines = {
  spend: string;
  save: string;
  balance: string;
  comfort: string;
  promisesYes: string;
  promisesNo: string;
  securityYes: string;
  securityNo: string;
  orgLegal: string;
  orgFinance: string;
  human: string;
};

export type CharterAnswers = {
  spendLimit: string;
  price: PricePreference;
  promises: boolean;
  security: boolean;
  human: string;
};

export function assembleCharter(
  answers: CharterAnswers,
  lines: CharterLines,
  type: HouseKind = "personal",
): string {
  const limit = answers.spendLimit.trim() || "200";
  const note = answers.human.trim();
  if (type === "org") {
    const parts = [
      lines.spend.replace("{limit}", limit),
      answers.promises ? lines.orgLegal : lines.promisesNo,
      answers.security ? lines.orgFinance : lines.securityNo,
    ];
    if (note) parts.push(lines.human.replace("{note}", note));
    return parts.join("\n\n");
  }
  const price =
    answers.price === "comfort" ? lines.comfort : answers.price === "balance" ? lines.balance : lines.save;
  const parts = [
    lines.spend.replace("{limit}", limit),
    price,
    answers.promises ? lines.promisesYes : lines.promisesNo,
    answers.security ? lines.securityYes : lines.securityNo,
  ];
  if (note) parts.push(lines.human.replace("{note}", note));
  return parts.join("\n\n");
}
