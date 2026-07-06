-- Одноразові токени доступу до курсу.
-- Життєвий цикл: pending (створено при кліку «Купити»)
--   → paid (WayForPay підтвердив оплату колбеком)
--   → claimed (курс видано в SendPulse; перехід атомарний і одноразовий).
create table if not exists course_tokens (
  token         text primary key,
  status        text not null default 'pending',   -- pending → paid → claimed
  subscriber_id text,
  created_at    timestamptz default now(),
  paid_at       timestamptz,
  claimed_at    timestamptz
);

-- Доступ лише для service_role (Edge Functions). anon/authenticated прав не
-- мають — таблиця недосяжна через публічний REST API навіть без RLS.
grant select, insert, update on table course_tokens to service_role;
