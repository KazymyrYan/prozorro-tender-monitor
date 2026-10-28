import { Router } from "express";
import { TenderRow } from "../db/models";
import { getSettings, saveSettings, type Settings } from "../db/settings";

export const settingsRouter = Router();

function parseManagers(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const name = item.trim();
    if (name.length === 0 || name.length > 20) return null;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

settingsRouter.get("/", async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put("/", async (req, res) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  const input = body as Record<string, unknown>;
  const patch: Partial<Settings> = {};

  if ("managers" in input) {
    const managers = parseManagers(input.managers);
    if (!managers) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    patch.managers = managers;
  }
  if ("telegramEnabled" in input) {
    if (typeof input.telegramEnabled !== "boolean") {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    patch.telegramEnabled = input.telegramEnabled;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  const before = await getSettings();
  await saveSettings(patch);

  // a channel starts "from today": what piled up while it was off is not sent
  if (patch.telegramEnabled === true && !before.telegramEnabled) {
    await TenderRow.update(
      { notifiedAt: new Date() },
      { where: { notifiedAt: null } },
    );
  }

  res.json(await getSettings());
});
