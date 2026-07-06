// order-status: read-only опитування стану замовлення з лендінгу.
// Лендінг тримає token (orderReference) після create-order і полить цей
// ендпоінт, щоб показати «дякуємо за покупку», коли оплата підтвердиться.
//
// Тільки читання — погасити токен звідси неможливо (це робить лише claim).
// Токен — секрет покупця, тож відповідь не містить нічого, чого він не знає.

import { dbEnv } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, corsPreflight } from "../_shared/cors.ts";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return json({ ok: false, status: "unknown" }, 400);

  const supabase = adminClient(dbEnv());
  const { data, error } = await supabase
    .from("course_tokens")
    .select("status")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("order-status: select failed:", error.message);
    return json({ ok: false, status: "unknown" }, 500);
  }
  if (!data) return json({ ok: false, status: "unknown" });

  const botName = required("BOT_NAME");
  // paid → launch-link claim-флоу (запасний вхід, якщо вкладка з ботом
  // не відкрилась); claimed → просто бот (токен уже використано).
  const botLink = data.status === "paid"
    ? `https://tg.pulse.is/${botName}?start=${required("CLAIM_FLOW_ID")}&claim_token=${encodeURIComponent(token)}`
    : `https://t.me/${botName}`;

  return json({ ok: true, status: data.status, botLink });
});
