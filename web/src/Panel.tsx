import { useEffect, useState } from "react";
import { formatDateTime, formatMoney, kyivDay } from "./format";
import {
  COMPANIES,
  STATUSES,
  STATUS_LABELS,
  type Status,
  type Tender,
} from "./types";

interface Props {
  tender: Tender;
  managers: string[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCustomer: (name: string) => void;
  onCopy: () => void;
}

function FromApi() {
  return <div className="hint">з API Прозорро</div>;
}

export function Panel({
  tender: t,
  managers,
  onClose,
  onSave,
  onCustomer,
  onCopy,
}: Props) {
  const mark = t.mark;
  // the panel is remounted per tender (key), so the draft starts from the saved mark
  const [status, setStatus] = useState<Status | null>(mark?.status ?? null);
  const [manager, setManager] = useState(mark?.manager ?? "");
  const [company, setCompany] = useState(mark?.company ?? "");
  const [note, setNote] = useState(mark?.note ?? "");
  const [itemsNote, setItemsNote] = useState(mark?.itemsNote ?? "");
  const [paymentTerms, setPaymentTerms] = useState(mark?.paymentTerms ?? "");
  const [bankNeeded, setBankNeeded] = useState(
    mark?.bankGuaranteeNeeded ?? false,
  );
  const [bankSum, setBankSum] = useState(mark?.bankGuaranteeSum ?? "");
  const [securityNeeded, setSecurityNeeded] = useState(
    mark?.contractSecurityNeeded ?? false,
  );
  const [securityPercent, setSecurityPercent] = useState(
    mark?.contractSecurityPercent ?? "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // a manager removed from settings stays selectable on tenders that still have him
  const managerList =
    manager && !managers.includes(manager) ? [...managers, manager] : managers;

  async function save() {
    setSaving(true);
    await onSave({
      status,
      manager: manager || null,
      company: company || null,
      note,
      itemsNote,
      paymentTerms,
      bankGuaranteeNeeded: bankNeeded,
      bankGuaranteeSum: bankSum,
      contractSecurityNeeded: securityNeeded,
      contractSecurityPercent: securityPercent,
    });
    setSaving(false);
  }

  function copyNumber() {
    navigator.clipboard.writeText(t.number).then(onCopy);
  }

  const noTender = t.type === "no-tender";

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-header">
          <h2>{t.number}</h2>
          <button className="btn btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="panel-body">
          <div className="panel-section">
            <div className="panel-field">
              <div className="label">Назва</div>
              <div className="value strong">{t.title}</div>
            </div>
            <div className="panel-field">
              <div className="label">Номер</div>
              <div className="value">
                {t.number}{" "}
                <button className="copy-btn" onClick={copyNumber} title="Копіювати">
                  📋
                </button>
                {t.manual && <span className="badge badge-manual">додано вручну</span>}
              </div>
            </div>
            <div className="panel-field">
              <div className="label">Замовник</div>
              <div className="value">
                <span
                  className="customer-link"
                  onClick={() => {
                    onCustomer(t.customer);
                    onClose();
                  }}
                >
                  {t.customer}
                </span>
                {t.region && ` · ${t.region}`}
              </div>
            </div>
            <div className="panel-field">
              <div className="label">{noTender ? "Сума переможця" : "Бюджет"}</div>
              <div className="value">
                {formatMoney(
                  noTender ? (t.winner?.amount ?? t.budget) : t.budget,
                  t.currency,
                )}
                {!noTender && (
                  <span className="badge badge-type">
                    {t.budgetVatIncluded === true
                      ? "з ПДВ"
                      : t.budgetVatIncluded === false
                        ? "без ПДВ"
                        : "ПДВ не вказано"}
                  </span>
                )}
                <FromApi />
              </div>
            </div>
            {noTender && t.winner && (
              <div className="panel-field">
                <div className="label">Переможець</div>
                <div className="value">
                  {t.winner.supplier}
                  {t.winner.edrpou && ` · ЄДРПОУ ${t.winner.edrpou}`}
                  {t.winner.awardedAt && ` · ${kyivDay(t.winner.awardedAt)}`}
                  <FromApi />
                </div>
              </div>
            )}
            {!noTender && (
              <>
                <div className="panel-field">
                  <div className="label">Строк подачі</div>
                  <div className="value">
                    {t.deadline ? formatDateTime(t.deadline) : "—"}
                    <FromApi />
                  </div>
                </div>
                <div className="panel-field">
                  <div className="label">Можливість задати питання до</div>
                  <div className="value">
                    {t.enquiryEnd ? formatDateTime(t.enquiryEnd) : "—"}
                    <FromApi />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="panel-section">
            <h3>Слова</h3>
            <ul className="hit-list">
              {t.words.map((word) => (
                <li key={word.text}>
                  <span>{word.place === "pos" ? "🎯" : "(в назві)"}</span>{" "}
                  <strong>{word.text}</strong>
                  {!word.strong && " ⚪"}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel-section">
            <h3>Позиції</h3>
            <ul className="hit-list">
              {t.items.map((item, i) => (
                <li key={i}>
                  <span>{t.matchedItems.includes(i) ? "🎯" : "•"}</span>
                  <span>
                    {item.description}
                    {item.quantity &&
                      ` — ${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
            <FromApi />
            <div className="label">Мої нотатки до позицій (необов'язково)</div>
            <textarea
              className="field note-area"
              maxLength={5000}
              value={itemsNote}
              onChange={(e) => setItemsNote(e.target.value)}
              placeholder="Уточнення по позиціях, що саме готуємо, нюанси…"
            />
          </div>

          <div className="panel-section">
            <h3>Умови оплати</h3>
            <input
              type="text"
              className="field"
              maxLength={1000}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="наприклад Відстрочка 30 календ. днів"
            />
          </div>

          {status && (
            <>
              <div className="panel-section">
                <h3>Компанія (від кого подаємо)</h3>
                <select
                  className="field"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                >
                  <option value="">— не обрано —</option>
                  {COMPANIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="panel-section">
                <h3>Банківська гарантія та забезпечення</h3>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={bankNeeded}
                    onChange={(e) => setBankNeeded(e.target.checked)}
                  />
                  Потрібна банківська гарантія (тендер)
                </label>
                {bankNeeded && (
                  <input
                    type="text"
                    className="field"
                    maxLength={100}
                    value={bankSum}
                    onChange={(e) => setBankSum(e.target.value)}
                    placeholder="Сума гарантії, наприклад 50 000 ₴"
                  />
                )}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={securityNeeded}
                    onChange={(e) => setSecurityNeeded(e.target.checked)}
                  />
                  Потрібне забезпечення договору
                </label>
                {securityNeeded && (
                  <input
                    type="text"
                    className="field"
                    maxLength={100}
                    value={securityPercent}
                    onChange={(e) => setSecurityPercent(e.target.value)}
                    placeholder="Відсоток забезпечення, наприклад 5%"
                  />
                )}
              </div>
            </>
          )}

          <div className="panel-section">
            <h3>Менеджер</h3>
            <select
              className="field"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
            >
              <option value="">— без менеджера —</option>
              {managerList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="panel-section">
            <h3>Статус роботи</h3>
            <div className="status-select">
              {([null, ...STATUSES] as (Status | null)[]).map((s) => (
                <button
                  key={s ?? "none"}
                  className={`status-btn ${s ?? ""} ${status === s ? "active" : ""}`}
                  onClick={() => setStatus(s)}
                >
                  {s ? STATUS_LABELS[s] : "—"}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>Нотатка</h3>
            <textarea
              className="field note-area"
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Коротка нотатка…"
            />
          </div>
        </div>

        <div className="panel-actions">
          <a
            className="btn"
            href={`https://prozorro.gov.ua/uk/tender/${t.number}`}
            target="_blank"
            rel="noreferrer"
          >
            Прозорро ↗
          </a>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            Зберегти
          </button>
        </div>
      </aside>
    </>
  );
}
