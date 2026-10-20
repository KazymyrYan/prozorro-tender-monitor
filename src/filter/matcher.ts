import type { Tender } from "../prozorro/client";

// lower case + one kind of apostrophe, Prozorro mixes ' and ’
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[’ʼ`´]/g, "'");
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Returns the keywords found in the tender title or item descriptions.
 * A keyword is a word stem and must sit at the start of a word,
 * so "шин" matches "шини" but not "машини".
 */
export function findMatches(tender: Tender, keywords: string[]): string[] {
  const parts = [tender.title, ...(tender.items ?? []).map((i) => i.description)];
  const text = normalize(parts.join("\n"));

  return keywords.filter((keyword) => {
    // \b doesn't understand Cyrillic, so require "not a letter or digit" before the stem
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalize(keyword))}`,
      "u",
    );
    return pattern.test(text);
  });
}