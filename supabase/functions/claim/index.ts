// claim: перший крок claim-флоу в SendPulse (елемент API Request).
// Атомарно "спалює" оплачений токен: paid → claimed, одним UPDATE з
// returning — жодних read-then-write, повторне використання неможливе.
//
// Відповіді:
//   { ok: true }                  — токен був paid, курс можна видавати
//   { ok: false, pending: true }  — оплата ще не підтверджена (зачекай і повтори)
//   { ok: false, pending: false } — токен недійсний або вже використаний

import { dbEnv } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";

async function extractParams(
  req: Request,
): Promise<{ token: string; subscriberId: string | null }> {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  let subscriberId = url.searchParams.get("subscriber_id");
  if (req.method === "POST") {
    const raw = await req.text();
    try {
      const body = JSON.parse(raw);
      if (body && typeof body === "object") {
        if (typeof body.token === "string" && body.token) token = body.token;
        if (body.subscriber_id != null) subscriberId = String(body.subscriber_id);
      }
    } catch {
      // Не JSON — пробуємо form-urlencoded (SendPulse вміє слати і так).
      const form = new URLSearchParams(raw);
      if (form.get("token")) token = form.get("token")!;
      if (form.get("subscriber_id")) subscriberId = form.get("subscriber_id");
    }
  }
  return { token, subscriberId };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const supabase = adminClient(dbEnv());

  const { token, subscriberId } = await extractParams(req);
  if (!token) return json({ ok: false, pending: false }, 400);

  // Атомарний перехід paid → claimed.
  const { data: claimed, error } = await supabase
    .from("course_tokens")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      subscriber_id: subscriberId,
    })
    .eq("token", token)
    .eq("status", "paid")
    .select("token");
  if (error) {
    console.error("claim: update failed:", error.message);
    return json({ ok: false, pending: true }, 500); // тимчасова помилка — хай повторить
  }
  if (claimed && claimed.length > 0) {
    return json({ ok: true });
  }

  // Не спрацювало — розрізняємо «ще не оплачено» і «недійсний/використаний».
  const { data: existing } = await supabase
    .from("course_tokens")
    .select("status")
    .eq("token", token)
    .maybeSingle();

  if (existing?.status === "pending") {
    return json({ ok: false, pending: true });
  }
  return json({ ok: false, pending: false });
});
