import type { KeywordBlock } from "../config";
import type { Tender } from "../prozorro/client";

// the matcher only needs the texts, so tests and tools can pass a lighter object
export type Searchable = Pick<Tender, "title" | "items">;

// Latin letters that look like Cyrillic ones sneak into tender texts
const LOOKALIKES: Record<string, string> = {
  a: "а",
  b: "в",
  c: "с",
  e: "е",
  h: "н",
  i: "і",
  k: "к",
  m: "м",
  o: "о",
  p: "р",
  t: "т",
  x: "х",
  y: "у",
};

// lower case, one kind of apostrophe, Latin lookalikes turned into Cyrillic
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’ʼ`´]/g, "'")
    .replace(/[abcehikmoptxy]/g, (ch) => LOOKALIKES[ch] ?? ch);
}

// a word is letters and digits, an apostrophe inside stays, a hyphen splits
const WORD = "[\\p{L}\\p{N}]+(?:'[\\p{L}\\p{N}]+)*";
const TEXT_WORD = new RegExp(WORD, "gu");
const PATTERN_WORD = new RegExp(`${WORD}\\*?`, "gu");

const MAX_ENDING = 4; // longest case ending allowed after a stem
const MAX_GAP = 2; // words that may sit between the words of a keyword phrase
// stop phrases are checked inside one position only, so they can look wider:
// "труба поліпропіленова композитна армована скловолокном" must still be caught
const MAX_STOP_GAP = 6;

interface WordPattern {
  stem: string;
  prefix: boolean;
}

function parsePhrase(phrase: string): WordPattern[] {
  const words = normalize(phrase).match(PATTERN_WORD) ?? [];
  return words.map((word) =>
    word.endsWith("*")
      ? { stem: word.slice(0, -1), prefix: true }
      : { stem: word, prefix: false },
  );
}

function wordMatches(pattern: WordPattern, token: string): boolean {
  if (!pattern.prefix) return token === pattern.stem;
  return (
    token.startsWith(pattern.stem) &&
    token.length - pattern.stem.length <= MAX_ENDING
  );
}

/** Looks for the words of a phrase in any order, close to each other. */
function phraseFound(
  words: WordPattern[],
  tokens: string[],
  gap = MAX_GAP,
): boolean {
  const positions: number[][] = [];
  for (const word of words) {
    const hits: number[] = [];
    tokens.forEach((token, index) => {
      if (wordMatches(word, token)) hits.push(index);
    });
    if (hits.length === 0) return false;
    positions.push(hits);
  }
  // the widest distance allowed between the first and the last used word
  const span = words.length - 1 + gap;

  const pick = (k: number, used: number[]): boolean => {
    if (k === positions.length) {
      return Math.max(...used) - Math.min(...used) <= span;
    }
    return positions[k].some(
      (index) => !used.includes(index) && pick(k + 1, [...used, index]),
    );
  };
  return pick(0, []);
}

interface Phrase {
  source: string;
  words: WordPattern[];
}

const compile = (phrases: string[]): Phrase[] =>
  phrases
    .map((source) => ({ source, words: parsePhrase(source) }))
    .filter((phrase) => phrase.words.length > 0);

/**
 * Builds a function that returns the keywords found in a tender.
 * The title and every item are checked on their own: a phrase never glues words
 * from two different positions, and an excluded phrase cancels only its own position.
 */
export function createMatcher(
  blocks: KeywordBlock[],
  exclude: string[],
): (tender: Searchable) => string[] {
  const include = compile(blocks.flatMap((block) => block.keywords));
  const stop = compile(exclude);

  return (tender) => {
    const units = [
      tender.title,
      ...(tender.items ?? []).map((item) => item.description),
    ];
    const found = new Set<string>();

    for (const unit of units) {
      const tokens = normalize(unit).match(TEXT_WORD) ?? [];
      if (
        stop.some((phrase) => phraseFound(phrase.words, tokens, MAX_STOP_GAP))
      ) {
        continue;
      }
      for (const phrase of include) {
        if (phraseFound(phrase.words, tokens)) found.add(phrase.source);
      }
    }

    // keep the order of the config
    return include
      .filter((phrase) => found.has(phrase.source))
      .map((phrase) => phrase.source);
  };
}
