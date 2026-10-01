const crypto = require("crypto");

const BASE_ANON = "https://android.chat.openai.com/backend-anon";
const BASE_AUTH = "https://android.chat.openai.com/backend-api";
const UA = "ChatGPT/1.2026.181 (Android 16; Neo/1.0; build 2222222)";

function randomId() {
  return crypto.randomUUID();
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) {
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      out[key] = decodeURIComponent(value);
    }
  }
  return out;
}

function getSecret() {
  return process.env.SESSION_SECRET || "ESir_Osd9dyqyWqHFl1tjPDRdQg0sCJ8m5acAZUy4BnkfoEJVlkhqcqBbxb19nU9";
}

function encodeSession(session) {
  const payload = base64url(JSON.stringify(session));
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function decodeSession(token) {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function getAuth() {
  const deviceId = randomId();

  const headers = {
    "User-Agent": UA,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "oai-package-name": "com.openai.chatgpt",
    "oai-client-version": "1.2026.181",
    "oai-device-id": deviceId,
    "oai-device-model": "Neo",
    "oai-device-platform": "android",
    "oai-device-tier": "free"
  };

  const response = await fetch(`${BASE_ANON}/sentinel/chat-requirements`, {
    method: "POST",
    headers,
    body: "{}"
  });

  const cookie = (response.headers.getSetCookie ? response.headers.getSetCookie() : [])
    .map(x => x.split(";")[0])
    .join("; ");

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth Error ${response.status}: ${text.slice(0, 1000)}`);
  }

  return {
    deviceId,
    cookie,
    parentMessageId: randomId(),
    chatId: null
  };
}

async function chatgpt(prompt, session) {
  if (!session.auth) session.auth = await getAuth();

  const auth = session.auth;
  const headers = {
    "User-Agent": UA,
    "Accept": "text/event-stream",
    "Content-Type": "application/json",
    "oai-package-name": "com.openai.chatgpt",
    "oai-client-version": "1.2026.181",
    "oai-device-id": auth.deviceId,
    "oai-device-model": "Neo",
    "oai-device-platform": "android",
    "oai-device-tier": "free",
    "Cookie": auth.cookie
  };

  const body = {
    action: "next",
    messages: [{
      id: randomId(),
      author: { role: "user" },
      content: { content_type: "text", parts: [prompt] }
    }],
    parent_message_id: auth.parentMessageId,
    model: "auto",
    timezone: "Asia/Jakarta"
  };

  if (auth.chatId) body.conversation_id = auth.chatId;

  const response = await fetch(`${BASE_AUTH}/f/conversation`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${text.slice(0, 2000)}`);
  }

  let answer = "";
  let newConversationId = auth.chatId;
  let newParentMessageId = auth.parentMessageId;

  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;

    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;

    try {
      const data = JSON.parse(raw);

      if (data.message && data.message.author?.role === "assistant") {
        const parts = data.message.content?.parts;
        if (Array.isArray(parts)) answer = parts.join("");
        if (data.message.id) newParentMessageId = data.message.id;
      }

      if (data.conversation_id) newConversationId = data.conversation_id;
    } catch {
      // Ignore non-JSON SSE lines.
    }
  }

  auth.chatId = newConversationId;
  auth.parentMessageId = newParentMessageId;

  return { answer, chatId: auth.chatId };
}

function json(res, status, data, session) {
  const body = JSON.stringify(data);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  };

  if (session) {
    const token = encodeSession(session);
    headers["Set-Cookie"] =
      `chat_session=${encodeURIComponent(token)}; Path=/; Max-Age=315360000; HttpOnly; Secure; SameSite=Lax`;
  }

  res.writeHead(status, headers);
  res.end(body);
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { success: false, error: "Method Not Allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {
      return json(res, 400, { success: false, error: "JSON tidak valid" });
    }
  }

  const prompt = typeof body?.message === "string" ? body.message.trim() : "";
  if (!prompt) return json(res, 400, { success: false, error: "Pesan kosong" });
  if (prompt.length > 20000) return json(res, 413, { success: false, error: "Pesan terlalu besar" });

  const cookies = parseCookies(req);
  let session = decodeSession(cookies.chat_session);

  if (!session || typeof session !== "object") {
    session = { auth: null };
  }

  try {
    const result = await chatgpt(prompt, session);
    return json(res, 200, {
      success: true,
      answer: result.answer || "(Tidak ada jawaban)",
      chatId: result.chatId || null
    }, session);
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      success: false,
      error: error?.message || "Terjadi kesalahan pada server"
    }, session);
  }
};
