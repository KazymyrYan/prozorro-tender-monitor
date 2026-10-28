import { AppSetting } from "./models";

export interface Settings {
  managers: string[];
  telegramEnabled: boolean;
}

const DEFAULT_MANAGERS = ["М.А.", "Т.И.", "М.В.", "Е.В."];

function parseManagers(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_MANAGERS;
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      return value;
    }
  } catch {
    // broken JSON falls back to the defaults
  }
  return DEFAULT_MANAGERS;
}

/** Missing rows mean defaults, so a fresh database needs no seeding. */
export async function getSettings(): Promise<Settings> {
  const rows = await AppSetting.findAll();
  const raw = new Map(rows.map((row) => [row.key, row.value]));
  return {
    managers: parseManagers(raw.get("managers")),
    telegramEnabled: raw.get("telegram_enabled") !== "false",
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  if (patch.managers) {
    await AppSetting.upsert({
      key: "managers",
      value: JSON.stringify(patch.managers),
    });
  }
  if (patch.telegramEnabled !== undefined) {
    await AppSetting.upsert({
      key: "telegram_enabled",
      value: String(patch.telegramEnabled),
    });
  }
}
