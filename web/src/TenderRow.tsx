import { daysLeft, formatMoney, kyivDay } from "./format";
import { STATUSES, STATUS_LABELS, type Status, type Tender } from "./types";

interface Props {
  tender: Tender;
  today: string;
  onOpen: () => void;
  onStar: () => void;
  onStatus: (status: Status | null) => void;
  onCustomer: () => void;
  onCopy: () => void;
}

function Deadline({ iso, today }: { iso: string | null; today: string }) {
  if (!iso) return null;
  const days = daysLeft(iso, today);
  let cls = "normal";
  if (days >= 0 && days < 2) cls = "red";
  else if (days >= 2 && days < 5) cls = "yellow";
  const text =
    days < 0
      ? "завершено"
      : days === 0
        ? "сьогодні"
        : days === 1
          ? "завтра"
          : `${days} дн.`;
  return <span className={`badge-deadline ${cls}`}>{text}</span>;
}

export function TenderRow({
  tender: t,
  today,
  onOpen,
  onStar,
  onStatus,
  onCustomer,
  onCopy,
}: Props) {
  const status = t.mark?.status ?? null;
  const starred = status !== null && status !== "archive";
  const hasPositionHit = t.words.some((word) => word.place === "pos");

  return (
    <div className="tender-row" onClick={onOpen}>
      <div
        className={`star ${starred ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
      >
        {starred ? "★" : "☆"}
      </div>

      <div className="tender-main">
        <div className="tender-title">{t.title}</div>
        <div className="tender-meta">
          <span
            className="customer-link"
            onClick={(e) => {
              e.stopPropagation();
              onCustomer();
            }}
          >
            {t.customer}
          </span>
          {t.region && <span className="sep">{t.region}</span>}
          {status && (
            <span className={`badge badge-status ${status}`}>
              {STATUS_LABELS[status]}
            </span>
          )}
          {t.mark?.manager && (
            <span className="badge badge-manager">{t.mark.manager}</span>
          )}
          {t.mark?.company && (
            <span className="badge badge-company">{t.mark.company}</span>
          )}
          {t.manual && <span className="badge badge-manual">вручну</span>}
        </div>
        <div className="tender-words">
          {t.words.map((word) => (
            <span
              key={word.text}
              className={`word-tag ${word.strong ? "" : "weak"}`}
            >
              {word.text}
            </span>
          ))}
          {hasPositionHit && " 🎯"}
          {t.weak && <span title="Слабке співпадіння"> ⚪</span>}
          <button
            className="copy-btn"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(t.number).then(onCopy);
            }}
            title="Копіювати номер"
          >
            № {t.number}
          </button>
        </div>
        <div className="row-actions">
          <select
            className="status-quick"
            value={status ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStatus((e.target.value || null) as Status | null)}
          >
            <option value="">—</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tender-side">
        {t.type === "no-tender" ? (
          <>
            <div className="budget">
              {formatMoney(t.winner?.amount ?? t.budget, t.currency)}
            </div>
            <div className="no-tender-info">
              {t.winner?.supplier ?? "—"}
              <br />
              {t.winner?.awardedAt ? kyivDay(t.winner.awardedAt) : ""}
            </div>
            <span className="badge badge-type">без торгів</span>
          </>
        ) : (
          <>
            <div className="budget">{formatMoney(t.budget, t.currency)}</div>
            <Deadline iso={t.deadline} today={today} />
          </>
        )}
      </div>
    </div>
  );
}
