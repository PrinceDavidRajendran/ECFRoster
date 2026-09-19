export function loadTelegramConfig(): {
  token: string;
  chatId: string;
} | null {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

export async function sendTelegramMessage(
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadTelegramConfig();
  if (!cfg) {
    return { ok: false, error: "Telegram not configured (token/chatId missing)." };
  }
  try {
    const url = `https://api.telegram.org/bot${cfg.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Telegram API ${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

// Sends a document (e.g. the roster PDF) with an optional HTML caption.
export async function sendTelegramDocument(
  file: Buffer,
  fileName: string,
  caption?: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadTelegramConfig();
  if (!cfg) {
    return { ok: false, error: "Telegram not configured (token/chatId missing)." };
  }
  try {
    const url = `https://api.telegram.org/bot${cfg.token}/sendDocument`;
    const form = new FormData();
    form.append("chat_id", cfg.chatId);
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
    }
    // Convert Node Buffer to a Blob for multipart upload.
    const blob = new Blob([new Uint8Array(file)], { type: "application/pdf" });
    form.append("document", blob, fileName);

    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Telegram API ${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

