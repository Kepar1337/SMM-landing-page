# Бекенд воронки оплати — Supabase Edge Functions

Веб-оплата WayForPay → редірект у Telegram-бот (SendPulse) → видача курсу за
**одноразовим токеном**. Життєвий цикл токена: `pending` → `paid` (колбек
WayForPay, лише на `Approved`) → `claimed` (атомарна видача, рівно один раз).

Прод-проєкт Supabase: `bovhwyysljxifixiekxn` («SMM Cheat-code»).
Наскрізний потік перевірений на живих оплатах WayForPay (2026-07-05/06).

```
Лендінг «Купити» (fetch) → create-order → {action, fields} → форму сабмітить лендінг
        │                                                        │
        ▼                                                        ▼
   token=pending                                     сторінка оплати WayForPay
   ├─ serviceUrl → wayforpay-callback: звірка HMAC-MD5, Approved → paid
   └─ returnUrl  → payment-return (WayForPay POST-ить!) → 303 →
                   tg.pulse.is/<бот>?start=<claim-флоу>&claim_token=<token>
                       → SendPulse API Request → claim → видача / відмова
```

## Ендпоінти (усі з `verify_jwt = false`)

Базовий URL: `https://bovhwyysljxifixiekxn.supabase.co/functions/v1`

| Функція | Хто викликає | Що робить |
|---|---|---|
| `create-order` | лендінг (fetch, GET) | створює `pending`-токен, повертає JSON `{ok, action, fields}` з підписаними полями Purchase; **amount/currency — тільки з env**, клієнт вплинути не може |
| `wayforpay-callback` | WayForPay (serviceUrl) | звіряє підпис (400 при підробці), `Approved` + збіг суми → `paid`; ідемпотентний (`where status='pending'`); завжди відповідає підписаним `accept` |
| `payment-return` | браузер покупця (WayForPay POST-ить на returnUrl) | 303 See Other → launch-link claim-флоу в tg.pulse.is |
| `claim` | SendPulse (API Request у claim-флоу) | атомарно `paid → claimed` одним UPDATE…RETURNING; приймає JSON, form-urlencoded або query |

## Контракт `claim` (перевірено на проді — не міняти без потреби)

Запит: `POST {"token":"<claim_token>","subscriber_id":"<id підписника>"}`
(`subscriber_id` необов'язковий).

| Ситуація | HTTP | Тіло (JSON-булеві) |
|---|---|---|
| Успішне погашення (`paid → claimed`) | 200 | `{"ok":true}` |
| Оплата ще не підтверджена (`pending`) | 200 | `{"ok":false,"pending":true}` |
| Токен недійсний або вже використаний | 200 | `{"ok":false,"pending":false}` |
| У запиті немає поля `token` | 400 | `{"ok":false,"pending":false}` |
| Тимчасова помилка БД | 500 | `{"ok":false,"pending":true}` (SendPulse може повторити) |

**Нюанс SendPulse:** він мапить відповідь через `$['ok']` і зберігає булеве як
`1`/`0` (порожньо). Тому Фільтр у флоу порівнює `ok = 1`, а не `ok = true`.
Гілки: `ok=1` → видача; `pending=1` → «оплата обробляється», пауза 30–60 с і
повторний запит; інакше → «посилання недійсне або вже використане».

## SendPulse (налаштовано вручну, поза кодом)

- Бот: `smmcheatcode_bot`; claim-флоу: `6a4aed70b7d1e93c8c01fcf6`.
- Тіло API Request у claim-флоу (перевірене робоче):
  ```json
  { "token": "{{claim_token}}", "subscriber_id": "{{telegram_id}}" }
  ```
  `subscriber_id` зберігається в `course_tokens` — по ньому підтримка бачить,
  який Telegram-акаунт погасив токен.
- Голий `/start` веде у **welcome-флоу без курсу** — це навмисно; claim-флоу
  запускається лише launch-link'ом із `claim_token` (його токен кладеться в
  змінну Audience `claim_token`).
- У боті змінна `claim_token` (Audience, тип текст) має існувати — інакше
  API Request шле порожній токен і отримує 400.

## Секрети (Dashboard → Edge Functions → Secrets, або `supabase secrets set`)

```
WAYFORPAY_MERCHANT   = <бойовий Merchant login>
WAYFORPAY_SECRET     = <бойовий Merchant Secret Key>
MERCHANT_DOMAIN      = smm-landing-page.vercel.app     # без https://
PRICE                = 11        # фінальна ціна (для тестів тимчасово 1)
CURRENCY             = USD       # для тестів тимчасово UAH
PRODUCT_NAME         = SMM Cheat-code
BOT_NAME             = smmcheatcode_bot
CLAIM_FLOW_ID        = 6a4aed70b7d1e93c8c01fcf6
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` інжектяться платформою — руками не
задавати. Значення секретів у git не потрапляють ніколи. Обрізаються пробіли
(`trim`) — хвостовий пробіл із Dashboard уже ламав returnUrl.

## Деплой

```bash
supabase link --project-ref bovhwyysljxifixiekxn
supabase db push
supabase functions deploy create-order wayforpay-callback claim payment-return
```

## Вивчені уроки (чому код саме такий)

1. **Шлюз `*.supabase.co` не віддає HTML** (примусово `text/plain` + CSP
   `sandbox`) — тому `create-order` повертає JSON, а форму на WayForPay
   збирає лендінг (`startServerPayment()` в `index.html`).
2. **WayForPay повертає браузер на returnUrl POST-ом**, а `tg.pulse.is`
   приймає лише GET (інакше 404) — тому між ними стоїть `payment-return`
   з редіректом 303 (303 змушує браузер перейти GET-ом).
3. **Тестовий режим WayForPay (неактивований магазин) все декларує Declined**
   і serviceUrl може не смикатись — наскрізний тест можливий лише на
   активованому магазині (оплата 1 грн + повернення коштів у кабінеті).
4. SendPulse `$['ok']` → `1`/`0` (див. вище).

## Чистка тестових даних перед запуском (виконати вручну, зі згоди власника)

Усі токени, створені до запуску, — тестові. У Supabase SQL Editor:

```sql
delete from course_tokens where created_at < '2026-07-07';  -- підстав дату запуску
```

## Чекліст запуску

- [ ] `supabase secrets set PRICE=11 CURRENCY=USD` (після контрольної оплати на 1 грн)
- [ ] Бойові `WAYFORPAY_MERCHANT`/`WAYFORPAY_SECRET` (задані власником)
- [ ] Контрольна оплата: колбек → `paid` → бот → `claimed`, повторний лінк → відмова
- [ ] Чистка тестових токенів (SQL вище)
- [ ] У SendPulse: реальна видача замість заглушки (+ тег «оплатив»)
- [ ] На лендінгу: справжній Facebook Pixel ID
