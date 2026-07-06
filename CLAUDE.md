# SMM Cheat-code — лендінг + воронка оплати

Продукт: міні-курс «SMM Cheat-code» (фінальна ціна 11 USD). Оплата WayForPay,
видача в Telegram-боті через SendPulse, доступ по одноразовому токену.

## Структура

| Що | Де |
|---|---|
| Лендінг (статичний, деплой на Vercel: smm-landing-page.vercel.app) | `index.html` |
| **Бекенд воронки** — Supabase Edge Functions + міграція (детальний README всередині) | `supabase/` |
| Стара Node.js-версія платіжного сервера (не використовується, лишена як референс) | `server/` |
| Рекламні креативи й гайди | `creatives/`, `*.md` у корені |

## Ключові факти (перевірені на живих оплатах)

- Потік: лендінг → `create-order` (JSON, форму сабмітить лендінг) → WayForPay →
  `wayforpay-callback` (`Approved` → `paid`) + `payment-return` (303 у tg.pulse.is)
  → SendPulse claim-флоу → `claim` (`paid → claimed`, атомарно, одноразово).
- `claim` повертає JSON-булеві; SendPulse мапить `$['ok']` у `1`/`0`, тому
  фільтри у флоу порівнюють з `1`, не з `true`.
- Голий `/start` у боті = welcome-флоу **без** курсу; видача — лише через
  launch-link з `claim_token` (налаштовано в SendPulse вручну, поза кодом).
- Секрети WayForPay живуть тільки в Supabase Secrets, у код/git не потрапляють.
- `amount`/`currency` фіксуються на сервері; колбек ідемпотентний; підписи —
  HMAC-MD5 (hex, поля через `;`).

## Правила для змін

- Логіку `create-order`/`wayforpay-callback`/`claim`/`payment-return` не міняти
  без перевірки на живій оплаті — вона відпрацьована (див. «Вивчені уроки» в
  `supabase/README.md`: заборона HTML на `*.supabase.co`, POST на returnUrl,
  поведінка тестового режиму WayForPay).
- SendPulse налаштовується вручну в їхньому кабінеті — у коді його немає.
- Supabase-проєкт воронки: `bovhwyysljxifixiekxn`. Не плутати з іншими
  проєктами в акаунті.
