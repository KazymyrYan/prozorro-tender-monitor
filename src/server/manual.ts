import { Router } from "express";
import { config } from "../config";
import { TenderMark, TenderRow } from "../db/models";
import { saveTenders } from "../db/store";
import { findCpvMatches } from "../filter/cpv";
import { createDetailedMatcher } from "../filter/matcher";
import { fetchTender, type Tender } from "../prozorro/client";
import { buildTenders } from "./tenders.js";

const findHits = createDetailedMatcher(config.blocks, config.exclude);
const weakWords = new Set(config.weak ?? []);
// the portal's own endpoint, it is the only place that maps a number to the API id
const SUMMARY_URL = "https://prozorro.gov.ua/api/tenders";

class LookupError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

type Parsed = { number: string } | { id: string };

/** Accepts a tender number, a link to the tender page, or the 32-char API id. */
function parseInput(raw: unknown): Parsed {
  if (typeof raw !== "string" || raw.length > 300) {
    throw new LookupError(400, "bad_input");
  }
  const text = raw.trim();
  const number = text.match(/UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]/i)?.[0];
  if (number) {
    // the API keeps the suffix letter in lower case
    return {
      number: number
        .replace(/^ua/i, "UA")
        .replace(/[A-Za-z]$/, (c) => c.toLowerCase()),
    };
  }
  if (/^[0-9a-f]{32}$/i.test(text)) return { id: text.toLowerCase() };
  throw new LookupError(400, "bad_input");
}

function findExisting(parsed: Parsed): Promise<TenderRow | null> {
  return "number" in parsed
    ? TenderRow.findOne({ where: { tenderNumber: parsed.number } })
    : TenderRow.findByPk(parsed.id);
}

async function resolveId(number: string): Promise<string> {
  const response = await fetch(`${SUMMARY_URL}/${number}/summary`, {
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response) throw new LookupError(502, "prozorro_unavailable");
  if (response.status === 404) throw new LookupError(404, "not_found");
  if (!response.ok) throw new LookupError(502, "prozorro_unavailable");
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new LookupError(502, "prozorro_unavailable");
  return body.id;
}

async function loadTender(parsed: Parsed): Promise<Tender> {
  const id = "id" in parsed ? parsed.id : await resolveId(parsed.number);
  try {
    return await fetchTender(id);
  } catch (e) {
    const notFound = e instanceof Error && e.message.includes(": 404");
    throw new LookupError(
      notFound ? 404 : 502,
      notFound ? "not_found" : "prozorro_unavailable",
    );
  }
}

function analyze(tender: Tender) {
  const hits = findHits(tender);
  const words = hits.map((hit) => ({
    text: hit.word,
    strong: !weakWords.has(hit.word),
    place: hit.units.some((unit) => unit > 0) ? "pos" : "title",
  }));
  const cpv = findCpvMatches(tender, config.cpv);
  // same rule as in collect
  const matched = config.requireCpv
    ? words.length > 0 && cpv.length > 0
    : words.length > 0 || cpv.length > 0;
  return { words, cpv, matched };
}

export const manualRouter = Router();

// shows what the search would say about a tender, writes nothing
manualRouter.post("/check", async (req, res) => {
  try {
    const parsed = parseInput(req.body?.input);
    const existing = await findExisting(parsed);
    if (existing) {
      const [built] = await buildTenders([existing]);
      res.json({ exists: true, tender: built.tender });
      return;
    }

    const tender = await loadTender(parsed);
    res.json({
      exists: false,
      preview: {
        number: tender.tenderID,
        title: tender.title.trim(),
        customer: tender.procuringEntity.name.trim(),
        region: tender.procuringEntity.address?.region ?? null,
        procurementMethodType: tender.procurementMethodType,
        status: tender.status,
        budget:
          typeof tender.value?.amount === "number"
            ? String(tender.value.amount)
            : null,
        currency: tender.value?.currency ?? null,
        deadline: tender.tenderPeriod?.endDate ?? null,
      },
      ...analyze(tender),
    });
  } catch (e) {
    if (e instanceof LookupError) {
      res.status(e.status).json({ error: e.code });
      return;
    }
    throw e;
  }
});

// saves the tender whatever the matcher says, the user chose it himself
manualRouter.post("/manual", async (req, res) => {
  try {
    const parsed = parseInput(req.body?.input);
    const star = req.body?.star === true;

    const existing = await findExisting(parsed);
    if (existing) {
      const [built] = await buildTenders([existing]);
      res.json({ exists: true, tender: built.tender });
      return;
    }

    const tender = await loadTender(parsed);
    const { words, cpv } = analyze(tender);
    await saveTenders([
      {
        tender,
        words: [...new Set(words.map((word) => word.text))],
        cpv,
        matched: true,
      },
    ]);
    // he knows about it already, so it must not go to the Telegram digest
    await TenderRow.update(
      { addedManually: true, notifiedAt: new Date() },
      { where: { id: tender.id } },
    );
    if (star) {
      await TenderMark.upsert({ tenderId: tender.id, status: "interesting" });
    }

    const row = await TenderRow.findByPk(tender.id);
    if (!row) throw new Error("manual tender was not saved");
    const [built] = await buildTenders([row]);
    res.status(201).json({ exists: false, tender: built.tender });
  } catch (e) {
    if (e instanceof LookupError) {
      res.status(e.status).json({ error: e.code });
      return;
    }
    throw e;
  }
});
