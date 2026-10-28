import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import Home from "./Home";

type Screen = "loading" | "login" | "app";

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", body: { password } });
      onDone();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(
        status === 401
          ? "Невірний пароль"
          : status === 429
            ? "Забагато спроб, спробуйте через 15 хвилин"
            : "Помилка з'єднання",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <h1>
          <span>Прозорро</span> Монітор
        </h1>
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !password}>
          Увійти
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    api("/api/me")
      .then(() => setScreen("app"))
      .catch(() => setScreen("login"));
  }, []);

  if (screen === "loading") return <div className="center">Завантаження…</div>;
  if (screen === "login") return <Login onDone={() => setScreen("app")} />;
  return <Home onLogout={() => setScreen("login")} />;
}
