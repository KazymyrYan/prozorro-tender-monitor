import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";

export interface KeywordBlock {
  name: string;
  keywords: string[];
}

export interface SearchConfig {
  // true: a tender needs a keyword AND a CPV code, false: either one is enough
  requireCpv: boolean;
  cpv: string[];
  exclude: string[];
  // keywords too generic to trust alone; a tender found only by them is marked as weak
  weak?: string[];
  blocks: KeywordBlock[];
}

function readRaw(): string {
  // CI gets the config from a secret, locally it is an ignored file
  const fromEnv = process.env.KEYWORDS_JSON;
  if (fromEnv) return fromEnv;
  if (existsSync("keywords.local.json")) {
    return readFileSync("keywords.local.json", "utf8");
  }
  console.warn("keywords.local.json not found, using keywords.example.json");
  return readFileSync("keywords.example.json", "utf8");
}

export const config = JSON.parse(readRaw()) as SearchConfig;
