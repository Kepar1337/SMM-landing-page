# SMM Cheat-code — лендінг + воронка оплати

Продаж міні-курсу **«SMM Cheat-code»** (11 USD): статичний лендінг → оплата
WayForPay → видача матеріалів у Telegram-боті (SendPulse) за **одноразовим
токеном**. Воронка працює в проді й перевірена на живих оплатах.

- 🌐 Лендінг: https://smm-landing-page.vercel.app (деплой з `main` через Vercel)
- ⚙️ Бекенд: Supabase Edge Functions, проєкт `bovhwyysljxifixiekxn`
  (детальна документація — [`supabase/README.md`](supabase/README.md))

## Як працює воронка

```
Кнопка «Купити» (нова вкладка)
   → create-order: одноразовий токен (pending) + підписана форма WayForPay
   → оплата на secure.wayforpay.com
        ├─ serviceUrl → wayforpay-callback: перевірка підпису, Approved → paid
        └─ returnUrl  → payment-return → 303 → tg.pulse.is → Telegram-бот
   → SendPulse claim-флоу → claim: paid → claimed (атомарно, рівно один раз)

Паралельно лендінг полить order-status і показує «Оплата успішна!»
(+ подія Purchase у Facebook Pixel; Lead летить одразу на клік кнопки).
```

Токеном не можна поділитися: `claim` гасить його одним атомарним UPDATE,
повторне використання отримує відмову. Сума й валюта фіксуються на сервері.

## Структура репозиторію

| Шлях | Що це |
|---|---|
| `index.html` | лендінг (Tailwind CDN, весь JS інлайном; конфіг — блок `CONFIG`) |
| `supabase/` | бекенд воронки: міграція + 5 Edge Functions + документація |
| `src/`, `creatives/` | зображення лендінгу та рекламні креативи |
| `server/` | стара Node.js-версія платіжного сервера (не використовується, референс) |
| `CLAUDE.md` | контекст проєкту для AI-асистентів |

## Локальний перегляд лендінгу

```bash
python -m http.server 8080   # → http://localhost:8080
```

Кнопка оплати працює й з localhost — вона б'є в прод-функції Supabase.

## Деплой

- **Лендінг**: push у `main` → Vercel деплоїть автоматично.
- **Бекенд**: `supabase functions deploy ...` + секрети в Supabase
  (див. [`supabase/README.md`](supabase/README.md); секретів у репозиторії немає).

## Що ще не зроблено

- [ ] `FB_PIXEL_ID` в `index.html` — заглушка; без реального ID події
      Lead/Purchase у Facebook не відправляються.
- [ ] У SendPulse замість ✅-заглушки — реальні матеріали курсу.
