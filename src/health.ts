import { initDb, sequelize } from "./db/models";
import { COLLECT_OK_KEY, getState, setState } from "./db/store";
import { sendMessage } from "./telegram/send";

const ALERT_KEY = "last_health_alert";
// GitHub starts the "hourly" job every 3-5 hours in practice, the longest gap seen was 5.4 h
const MAX_SILENCE_HOURS = 8;
const ALERT_EVERY_HOURS = 6; // don't repeat the alert more often than this

const hoursSince = (iso: string) =>
  (Date.now() - new Date(iso).getTime()) / 3_600_000;

await initDb();

const lastOk = await getState(COLLECT_OK_KEY);

if (!lastOk) {
  // nothing recorded yet, e.g. right after the first deploy
  console.log("no successful collect recorded yet, skip");
} else {
  const silence = hoursSince(lastOk);

  if (silence <= MAX_SILENCE_HOURS) {
    console.log(`ok: last successful collect ${silence.toFixed(1)} h ago`);
  } else {
    const lastAlert = await getState(ALERT_KEY);

    if (lastAlert && hoursSince(lastAlert) < ALERT_EVERY_HOURS) {
      console.log("collect is late, alert was already sent recently");
    } else {
      const when = new Date(lastOk).toLocaleString("uk-UA", {
        timeZone: "Europe/Kyiv",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      await sendMessage(
        `⚠️ Збір тендерів не відпрацьовував уже ${Math.floor(silence)} год. Остання успішна збірка: ${when}. Перевір GitHub Actions.`,
      );
      await setState(ALERT_KEY, new Date().toISOString());
      console.log("alert sent");
    }
  }
}

await sequelize.close();
