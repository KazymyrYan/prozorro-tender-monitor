import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { formatDateTime, formatMoney } from "./format";
import type { CheckResult } from "./types";

interface Props {
  onClose: () => void;
  onAdded: () => void;
  onUnauthorized: () => void;
}

const ERRORS: Record<string, string> = {
  bad_input: "Введіть номер тендера (UA-…), посилання на нього або id",
  not_found: "Тендер не знайдено",
  prozorro_unavailable: "Прозорро не відповідає, спробуйте пізніше",
};

export function AddTenderModal({ onClose, onAdded, onUnauthorized }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function fail(e: unknown) {
    if (e instanceof ApiError) {
      if (e.status === 401) onUnauthorized();
      else setError(ERRORS[e.message] ?? "Помилка");
    } else {
      setError("Помилка з'єднання");
    }
  }

  async function check() {
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api<CheckResult>("/api/tenders/check", {
          method: "POST",
          body: { input },
        }),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function save(star: boolean) {
    setBusy(true);
    setError("");
    try {
      await api("/api/tenders/manual", {
        method: "POST",
        body: { input, star },
      });
      onAdded();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }

  const fresh = result && !result.exists ? result : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Додати тендер вручну</h2>
          <button className="btn btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Посилання або номер тендера</label>
            <input
              type="text"
              className="field"
              autoFocus
              value={input}
              placeholder="UA-2026-… або https://prozorro.gov.ua/…"
              onChange={(e) => {
                setInput(e.target.value);
                setResult(null);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && void check()}
            />
          </div>
          <button
            className="btn btn-primary full"
            onClick={() => void check()}
            disabled={busy || !input.trim()}
          >
            Перевірити
          </button>

          {error && <div className="login-error form-error">{error}</div>}

          {result?.exists && (
            <div className="check-result">
              Цей тендер уже є в базі: <strong>{result.tender.number}</strong>.
              Знайдіть його в списку за номером.
            </div>
          )}

          {fresh && (
            <div className="check-result">
              <div className="strong">{fresh.preview.title}</div>
              <div className="hint">
                {fresh.preview.customer}
                {fresh.preview.region ? ` · ${fresh.preview.region}` : ""}
              </div>
              <div className="hint">
                {formatMoney(fresh.preview.budget, fresh.preview.currency)}
                {fresh.preview.deadline &&
                  ` · подача до ${formatDateTime(fresh.preview.deadline)}`}
              </div>

              <h4>Слова</h4>
              {fresh.words.length === 0 ? (
                <div className="hint">Слова не спрацювали</div>
              ) : (
                <ul className="hit-list">
                  {fresh.words.map((word) => (
                    <li key={word.text}>
                      <span>{word.place === "pos" ? "🎯" : "(в назві)"}</span>{" "}
                      <strong>{word.text}</strong>
                      {!word.strong && " ⚪"}
                    </li>
                  ))}
                </ul>
              )}
              <p className="check-verdict">
                {fresh.matched
                  ? "Тендер підходить під пошук. Можна зберегти."
                  : "Тендер не підходить під пошук, але його можна додати вручну."}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button
            className="btn"
            disabled={busy || !fresh}
            onClick={() => void save(true)}
          >
            ⭐ Зберегти як «Цікаво»
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !fresh}
            onClick={() => void save(false)}
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}
