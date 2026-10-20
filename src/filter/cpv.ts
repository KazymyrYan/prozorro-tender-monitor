import type { Tender } from "../prozorro/client";

// "39000000-2" -> "39", "39220000-0" -> "3922"; a division is 2 digits at minimum
function cpvPrefix(code: string): string {
  const digits = code.split("-")[0] ?? "";
  return digits.replace(/0+$/, "").padEnd(2, "0");
}

/**
 * Returns the codes from `codes` that at least one tender item falls under.
 * Codes are hierarchical, so "39000000-2" also covers "39220000-0".
 */
export function findCpvMatches(tender: Tender, codes: string[]): string[] {
  const itemCodes = (tender.items ?? []).map((item) => item.classification.id);

  return codes.filter((code) => {
    const prefix = cpvPrefix(code);
    return itemCodes.some((itemCode) => itemCode.startsWith(prefix));
  });
}
