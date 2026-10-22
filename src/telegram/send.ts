import "dotenv/config";

const MAX_LENGTH = 4096; // Telegram's limit for one message

/** Sends one HTML message to the configured chat. */
export async function sendMessage(html: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
  }
  if (html.length > MAX_LENGTH) {
    throw new Error(`Message is too long: ${html.length}`);
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    },
  );

  // the error text never contains the token, so it is safe to print
  if (!response.ok) {
    throw new Error(
      `Telegram error ${response.status}: ${await response.text()}`,
    );
  }
}
