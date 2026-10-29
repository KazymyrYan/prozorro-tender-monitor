import { useEffect, useState } from "react";
import { COMPANIES, type Settings } from "./types";

interface Props {
  settings: Settings;
  onSave: (patch: Partial<Settings>) => Promise<boolean>;
  onClose: () => void;
}

function Toggle({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`toggle ${on ? "on" : ""}`}
      onClick={onClick}
    />
  );
}

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [name, setName] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleTelegram() {
    const next = !settings.telegramEnabled;
    // turning it on marks the backlog as sent, so ask first
    if (
      next &&
      !window.confirm(
        "Увімкнути Telegram? Тендери, що накопичилися, не надсилатимуться: дайджест почнеться з нових.",
      )
    ) {
      return;
    }
    await onSave({ telegramEnabled: next });
  }

  async function addManager() {
    const value = name.trim();
    if (!value || settings.managers.includes(value)) return;
    if (await onSave({ managers: [...settings.managers, value] })) setName("");
  }

  function removeManager(manager: string) {
    void onSave({ managers: settings.managers.filter((m) => m !== manager) });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Налаштування</h2>
          <button className="btn btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="toggle-row">
            <div>
              <div className="strong">Telegram</div>
              <div className="hint">Щоденний дайджест</div>
            </div>
            <Toggle on={settings.telegramEnabled} onClick={toggleTelegram} />
          </div>
          <div className="toggle-row muted-row">
            <div>
              <div className="strong">Пошта</div>
              <div className="hint">Дайджест на e-mail · скоро</div>
            </div>
            <Toggle on={false} disabled />
          </div>
          <div className="toggle-row muted-row">
            <div>
              <div className="strong">Google-таблиця</div>
              <div className="hint">Версія 1.5</div>
            </div>
            <Toggle on={false} disabled />
          </div>

          <div className="settings-block">
            <div className="strong">Менеджери</div>
            <div className="chips">
              {settings.managers.length === 0 && (
                <span className="hint">Немає менеджерів</span>
              )}
              {settings.managers.map((m) => (
                <span key={m} className="mgr-chip">
                  {m}
                  <button
                    type="button"
                    title="Видалити"
                    onClick={() => removeManager(m)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="add-row">
              <input
                type="text"
                maxLength={20}
                placeholder="Новий менеджер (напр. І.П.)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addManager()}
              />
              <button className="btn btn-sm" onClick={() => void addManager()}>
                + Додати
              </button>
            </div>
          </div>

          <div className="settings-block">
            <div className="strong">Компанії (від кого подаємо)</div>
            <div className="chips">
              {COMPANIES.map((c) => (
                <span key={c} className="badge badge-company">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="settings-block">
            <div className="strong">Ключові слова та виключення</div>
            <p className="hint">
              Редагуються у файлі keywords.local.json і в секреті KEYWORDS_JSON.
              Редагування з інтерфейсу з'явиться пізніше.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
