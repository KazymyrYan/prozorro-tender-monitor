import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "./api";
import { formatMoney, kyivToday, plural } from "./format";
import { Panel } from "./Panel";
import { SettingsModal } from "./SettingsModal";
import { TenderRow } from "./TenderRow";
import {
  STATUSES,
  STATUS_LABELS,
  type Mark,
  type Settings,
  type Status,
  type Tender,
  type TendersResponse,
} from "./types";

type Period = "all" | "yesterday" | "week" | "date";
type StatusFilter = "all" | Status;
type SortBy = "deadline" | "budget" | "pub";

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "yesterday", label: "За минулий робочий день" },
  { value: "week", label: "За тиждень" },
  { value: "date", label: "Дата" },
];

const COUNTERS: StatusFilter[] = ["all", ...STATUSES];

export default function Home({ onLogout }: { onLogout: () => void }) {
  const [period, setPeriod] = useState<Period>("all");
  const [date, setDate] = useState(kyivToday());
  const [data, setData] = useState<TendersResponse | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [settings, setSettings] = useState<Settings>({
    managers: [],
    telegramEnabled: true,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [manager, setManager] = useState("");
  const [block, setBlock] = useState("");
  const [type, setType] = useState("");
  const [strongOnly, setStrongOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("deadline");
  const [toast, setToast] = useState("");

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(""), 1800);
  }

  // the period is the only filter the server knows about
  useEffect(() => {
    let cancelled = false;
    const query =
      period === "date" ? `period=date&date=${date}` : `period=${period}`;
    setError(false);
    api<TendersResponse>(`/api/tenders?${query}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) onLogout();
        else setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, date, reload]);

  useEffect(() => {
    api<Settings>("/api/settings")
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  const tenders = useMemo(() => data?.tenders ?? [], [data]);
  const today = data?.today ?? kyivToday();
  const openTender = openId ? tenders.find((t) => t.id === openId) : undefined;

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = {
      all: 0,
      interesting: 0,
      preparing: 0,
      submitted: 0,
      won: 0,
      lost: 0,
      archive: 0,
    };
    for (const t of tenders) {
      const status = t.mark?.status ?? null;
      if (status === "archive") result.archive++;
      else {
        result.all++;
        if (status) result[status]++;
      }
    }
    return result;
  }, [tenders]);

  const blockOptions = useMemo(
    () => [...new Set(tenders.flatMap((t) => t.blocks))].sort(),
    [tenders],
  );
  // managers from settings first, then anyone who is still on a tender
  const managerOptions = useMemo(() => {
    const extra = tenders
      .map((t) => t.mark?.manager)
      .filter((m): m is string => !!m && !settings.managers.includes(m));
    return [...settings.managers, ...new Set(extra)];
  }, [tenders, settings.managers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tenders.filter((t) => {
      const status = t.mark?.status ?? null;
      if (statusFilter === "all") {
        if (status === "archive") return false;
      } else if (status !== statusFilter) return false;
      if (customer && t.customer !== customer) return false;
      if (block && !t.blocks.includes(block)) return false;
      if (type && t.type !== type) return false;
      const m = t.mark?.manager ?? null;
      if (manager === "—") {
        if (m) return false;
      } else if (manager && m !== manager) return false;
      if (strongOnly && t.weak) return false;
      if (q) {
        const hay =
          `${t.title} ${t.customer} ${t.region ?? ""} ${t.number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "budget") return Number(b.budget ?? 0) - Number(a.budget ?? 0);
      if (sortBy === "pub")
        return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
      // soonest deadline first, tenders without one go last
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    return list;
  }, [tenders, statusFilter, customer, block, type, manager, strongOnly, search, sortBy]);

  const filtersActive =
    statusFilter !== "all" ||
    period !== "all" ||
    !!manager ||
    !!block ||
    !!search ||
    !!customer;
  // display only, so float is fine here
  const totalBudget = filtered.reduce((sum, t) => sum + Number(t.budget ?? 0), 0);

  /** Saves marks and updates the row; true when the server accepted it. */
  async function patchMark(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const { mark } = await api<{ mark: Mark }>(`/api/tenders/${id}/mark`, {
        method: "PATCH",
        body: patch,
      });
      setData(
        (prev) =>
          prev && {
            ...prev,
            tenders: prev.tenders.map((t) => (t.id === id ? { ...t, mark } : t)),
          },
      );
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout();
      else showToast("Не вдалося зберегти");
      return false;
    }
  }

  // the star is derived from the status: on = has a status other than archive
  function toggleStar(t: Tender) {
    const status = t.mark?.status ?? null;
    const starred = status !== null && status !== "archive";
    if (!starred) void patchMark(t.id, { status: "interesting" });
    else if (status === "interesting") void patchMark(t.id, { status: null });
    else showToast("Щоб зняти ⭐, змініть статус");
  }

  async function saveSettings(patch: Partial<Settings>): Promise<boolean> {
    try {
      setSettings(
        await api<Settings>("/api/settings", { method: "PUT", body: patch }),
      );
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout();
      else showToast("Не вдалося зберегти");
      return false;
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" });
    onLogout();
  }

  return (
    <>
      <header className="header">
        <h1>
          <span>Прозорро</span> Монітор
        </h1>
        <div className="header-actions">
          <button
            className="btn btn-sm"
            onClick={() => setSettingsOpen(true)}
            title="Налаштування"
          >
            ⚙
          </button>
          <button className="btn btn-sm" onClick={logout}>
            Вийти
          </button>
        </div>
      </header>

      <div className="main">
        <div className="period-bar">
          <span className="label">Період:</span>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`period-btn ${period === p.value ? "active" : ""}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
          {period === "date" && (
            <input
              type="date"
              className="period-date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          )}
        </div>

        <div className="counters">
          {COUNTERS.map((key) => (
            <div
              key={key}
              className={`counter ${statusFilter === key ? "active" : ""} ${key === "archive" ? "counter-archive" : ""}`}
              onClick={() => setStatusFilter(key)}
            >
              <div className="label">
                {key === "all" ? "Усі" : STATUS_LABELS[key]}
              </div>
              <div className="value">{counts[key]}</div>
            </div>
          ))}
        </div>

        <div className="filters">
          <div className="filter-group">
            <label>Менеджер</label>
            <select value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="">Усі</option>
              {managerOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="—">Без менеджера</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Блок</label>
            <select value={block} onChange={(e) => setBlock(e.target.value)}>
              <option value="">Усі блоки</option>
              {blockOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Тип</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Усі</option>
              <option value="competitive">З торгами</option>
              <option value="no-tender">Без торгів</option>
            </select>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={strongOnly}
              onChange={(e) => setStrongOnly(e.target.checked)}
            />
            Тільки сильні
          </label>
          <div className="filter-search">
            <input
              type="text"
              placeholder="Пошук: назва, замовник…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {customer && (
          <div className="active-filters">
            <span className="filter-chip">
              Замовник: <strong>{customer}</strong>
              <button onClick={() => setCustomer(null)} title="Скинути">
                ×
              </button>
            </span>
          </div>
        )}

        {filtersActive && filtered.length > 0 && (
          <div className="summary-bar">
            {filtered.length} {plural(filtered.length, "тендер", "тендери", "тендерів")}{" "}
            · сума бюджетів {formatMoney(String(totalBudget))}
          </div>
        )}

        <div className="list">
          <div className="list-header">
            <span>
              {filtered.length}{" "}
              {plural(filtered.length, "тендер", "тендери", "тендерів")}
            </span>
            <label className="sort">
              Сортування:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
              >
                <option value="deadline">Строк подачі ↑</option>
                <option value="budget">Бюджет ↓</option>
                <option value="pub">Дата публікації ↓</option>
              </select>
            </label>
          </div>

          {error && (
            <div className="empty">
              Не вдалося завантажити.{" "}
              <button className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>
                Спробувати ще раз
              </button>
            </div>
          )}
          {!error && !data && <div className="empty">Завантаження…</div>}
          {!error && data && filtered.length === 0 && (
            <div className="empty">Нічого не знайдено за поточними фільтрами</div>
          )}

          {filtered.map((t) => (
            <TenderRow
              key={t.id}
              tender={t}
              today={today}
              onOpen={() => setOpenId(t.id)}
              onStar={() => toggleStar(t)}
              onStatus={(status) => void patchMark(t.id, { status })}
              onCustomer={() => setCustomer(t.customer)}
              onCopy={() => showToast("Номер скопійовано")}
            />
          ))}
        </div>
      </div>

      {openTender && (
        <Panel
          key={openTender.id}
          tender={openTender}
          managers={settings.managers}
          onClose={() => setOpenId(null)}
          onSave={async (patch) => {
            if (await patchMark(openTender.id, patch)) {
              setOpenId(null);
              showToast("Збережено");
            }
          }}
          onCustomer={setCustomer}
          onCopy={() => showToast("Номер скопійовано")}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}
