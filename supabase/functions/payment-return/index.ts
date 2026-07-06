// payment-return: returnUrl для WayForPay. Після оплати WayForPay повертає
// браузер покупця сюди POST-запитом, а tg.pulse.is приймає лише GET —
// тому відповідаємо 303 See Other, і браузер іде на deep-link бота GET-ом.
//
// Токен передається в query (?claim_token=...) ще при створенні замовлення,
// тож тіло POST від WayForPay парсити не треба. Сам факт редіректу нічого
// не видає: без статусу paid (його ставить лише підписаний колбек) токен
// у claim марний.

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

Deno.serve((req) => {
  const botName = required("BOT_NAME");
  const claimFlowId = required("CLAIM_FLOW_ID");

  const token = new URL(req.url).searchParams.get("claim_token") ?? "";
  const target = token
    ? `https://tg.pulse.is/${botName}?start=${claimFlowId}&claim_token=${encodeURIComponent(token)}`
    : `https://tg.pulse.is/${botName}?start=${claimFlowId}`;

  return new Response(null, { status: 303, headers: { Location: target } });
});
