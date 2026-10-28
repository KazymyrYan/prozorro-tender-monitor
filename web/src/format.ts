const moneyFormat = new Intl.NumberFormat("uk-UA");

/** For display only: the amount arrives as a string and is never summed for money logic. */
export function formatMoney(amount: string | null, currency?: string | null) {
  if (amount === null) return "—";
  const code = currency ?? "UAH";
  return `${moneyFormat.format(Number(amount))} ${code === "UAH" ? "₴" : code}`;
}

export function kyivDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

export function kyivToday(): string {
  return kyivDay(new Date().toISOString());
}

function dayNumber(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
}

/** Calendar days from today to the deadline, both in Kyiv time. */
export function daysLeft(iso: string, today: string): number {
  return dayNumber(kyivDay(iso)) - dayNumber(today);
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const last = a % 10;
  if (a > 10 && a < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}
