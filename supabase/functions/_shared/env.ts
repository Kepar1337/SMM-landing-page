// Читання конфігурації з env (Supabase Edge Functions → Secrets).
// Кожна функція читає лише те, що їй потрібно, — щоб відсутність
// нерелевантного секрету не валила функцію.

function required(name: string): string {
  // trim: секрети, вставлені через Dashboard, часом мають хвостовий
  // пробіл/перенос рядка — він ламає URL і підписи.
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY інжектяться платформою автоматично.
export function dbEnv() {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export type DbEnv = ReturnType<typeof dbEnv>;

// Для wayforpay-callback: перевірка підпису і звірка суми.
export function callbackEnv() {
  return {
    merchantSecret: required("WAYFORPAY_SECRET"),
    price: required("PRICE"),
    currency: required("CURRENCY"),
  };
}

// Для create-order: повний набір Purchase-полів.
export function orderEnv() {
  return {
    merchantAccount: required("WAYFORPAY_MERCHANT"),
    merchantSecret: required("WAYFORPAY_SECRET"),
    merchantDomain: required("MERCHANT_DOMAIN"),
    price: required("PRICE"),
    currency: required("CURRENCY"),
    productName: required("PRODUCT_NAME"),
    botName: required("BOT_NAME"),
    claimFlowId: required("CLAIM_FLOW_ID"),
    // Публічний URL функцій для serviceUrl. У проді співпадає з SUPABASE_URL,
    // локально SUPABASE_URL дивиться на внутрішній kong — можна перекрити.
    functionsBaseUrl:
      Deno.env.get("PUBLIC_FUNCTIONS_URL") ??
      `${required("SUPABASE_URL")}/functions/v1`,
  };
}
