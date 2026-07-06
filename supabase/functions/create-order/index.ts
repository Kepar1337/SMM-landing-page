// create-order: викликається кнопкою «Купити» на лендінгу (fetch з браузера).
// Створює одноразовий токен у стані pending і повертає JSON з полями
// Purchase-запиту WayForPay; лендінг збирає з них form POST на сторінку
// оплати. (HTML тут віддавати не можна: шлюз *.supabase.co примусово
// ставить text/plain + CSP sandbox для HTML-відповідей.)
//
// amount/currency беруться ТІЛЬКИ з серверного конфігу — будь-які значення
// з клієнта ігноруються.

import { dbEnv, orderEnv } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { signPurchase } from "../_shared/wayforpay.ts";
import { corsHeaders, corsPreflight } from "../_shared/cors.ts";

const WFP_PAY_ENDPOINT = "https://secure.wayforpay.com/pay";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;

  const env = orderEnv();
  const supabase = adminClient(dbEnv());

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from("course_tokens")
    .insert({ token, status: "pending" });
  if (error) {
    console.error("create-order: insert failed:", error.message);
    return json({ ok: false, error: "order_create_failed" }, 500);
  }

  const orderDate = Math.floor(Date.now() / 1000);
  // WayForPay повертає браузер POST-ом, а tg.pulse.is приймає лише GET —
  // тому вертаємо через payment-return, який відповідає 303-редіректом.
  const returnUrl = `${env.functionsBaseUrl}/payment-return?claim_token=${token}`;
  const serviceUrl = `${env.functionsBaseUrl}/wayforpay-callback`;

  const purchase = {
    merchantAccount: env.merchantAccount,
    merchantDomainName: env.merchantDomain,
    orderReference: token,
    orderDate,
    amount: env.price,
    currency: env.currency,
    productName: [env.productName],
    productCount: [1],
    productPrice: [env.price],
  };
  const merchantSignature = signPurchase(env.merchantSecret, purchase);

  // Лендінг ітерує fields; значення-масиви стають полями name[].
  return json({
    ok: true,
    action: WFP_PAY_ENDPOINT,
    fields: {
      merchantAccount: purchase.merchantAccount,
      merchantDomainName: purchase.merchantDomainName,
      merchantSignature,
      orderReference: purchase.orderReference,
      orderDate: purchase.orderDate,
      amount: purchase.amount,
      currency: purchase.currency,
      productName: purchase.productName,
      productCount: purchase.productCount,
      productPrice: purchase.productPrice,
      returnUrl,
      serviceUrl,
    },
  });
});
