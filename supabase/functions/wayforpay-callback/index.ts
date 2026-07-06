// wayforpay-callback: serviceUrl для WayForPay (сервер-до-сервера).
// Перевіряє HMAC-MD5 підпис колбека; на Approved переводить токен
// pending → paid (ідемпотентно: повторні колбеки — no-op завдяки
// where status='pending'). Завжди відповідає підписаним accept-JSON,
// інакше WayForPay повторюватиме колбек до 4 діб.
//
// Не логуємо повне тіло колбека — там дані картки.

import { callbackEnv, dbEnv } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import {
  type CallbackBody,
  signResponse,
  verifyCallback,
} from "../_shared/wayforpay.ts";

function parseCallbackBody(raw: string): CallbackBody | null {
  try {
    let payload = JSON.parse(raw);
    // Іноді WayForPay шле JSON як єдиний ключ form-даних — тоді перший
    // "ключ" і є JSON-рядком.
    if (payload && typeof payload === "object" && !payload.orderReference) {
      const firstKey = Object.keys(payload)[0];
      if (firstKey && firstKey.trim().startsWith("{")) {
        payload = JSON.parse(firstKey);
      }
    }
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    try {
      const form = new URLSearchParams(raw);
      const firstKey = [...form.keys()][0];
      if (firstKey && firstKey.trim().startsWith("{")) {
        return JSON.parse(firstKey);
      }
    } catch { /* ігноруємо — нижче повернемо null */ }
    return null;
  }
}

Deno.serve(async (req) => {
  const env = callbackEnv();

  const raw = await req.text();
  const body = parseCallbackBody(raw);
  if (!body || !body.orderReference) {
    return new Response("bad payload", { status: 400 });
  }

  if (!verifyCallback(env.merchantSecret, body)) {
    console.warn(
      "wayforpay-callback: signature mismatch for order",
      body.orderReference,
    );
    return new Response("bad signature", { status: 400 });
  }

  if (body.transactionStatus === "Approved") {
    // Захист: сума/валюта мають збігатися з серверним конфігом.
    if (String(body.amount) !== String(env.price) || body.currency !== env.currency) {
      console.warn(
        `wayforpay-callback: amount/currency mismatch for order ${body.orderReference}:`,
        `got ${body.amount} ${body.currency}, expected ${env.price} ${env.currency}`,
      );
    } else {
      const supabase = adminClient(dbEnv());
      const { error } = await supabase
        .from("course_tokens")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("token", body.orderReference)
        .eq("status", "pending"); // ідемпотентність: повторний колбек — no-op
      if (error) {
        console.error("wayforpay-callback: update failed:", error.message);
        // Не підтверджуємо прийом — нехай WayForPay повторить колбек.
        return new Response("db error", { status: 500 });
      }
    }
  }
  // Проміжні статуси (Pending/InProcessing/…) і Declined — нічого не робимо,
  // токен лишається pending.

  const time = Math.floor(Date.now() / 1000);
  const status = "accept";
  return new Response(
    JSON.stringify({
      orderReference: body.orderReference,
      status,
      time,
      signature: signResponse(env.merchantSecret, body.orderReference, status, time),
    }),
    { headers: { "content-type": "application/json" } },
  );
});
