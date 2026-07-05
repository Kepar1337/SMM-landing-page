/* =====================================================================
 * ЧИТ-КОД для SMM — платіжний сервер (WayForPay + одноразове посилання)
 * ---------------------------------------------------------------------
 * Потік:
 *   1) Лендінг → GET /pay → сервер створює замовлення, підписує запит
 *      і редіректить користувача на форму оплати WayForPay.
 *   2) WayForPay → POST /callback (serviceUrl, сервер-до-сервера):
 *      перевіряємо підпис, і якщо оплата Approved — позначаємо замовлення
 *      оплаченим та генеруємо ОДНОРАЗОВИЙ токен.
 *   3) WayForPay → /return (returnUrl, браузер користувача): показуємо
 *      сторінку очікування, яка дочекається підтвердження оплати і
 *      відправить користувача на лендінг з deep-link бота (?tg=...).
 *   4) Telegram-бот (SendPulse) при /start <token> робить HTTP-запит на
 *      GET /validate?token=...&uid=... → сервер «спалює» токен (привʼязує
 *      до першого користувача). Повторне/чуже використання → ok:false.
 *
 * Зберігання стану — у простому JSON-файлі (db.json). Для продакшену з
 * великим навантаженням заміни на реальну БД (Postgres/Redis).
 * ===================================================================== */

'use strict';

// Необовʼязково: локально читаємо .env (на Render/Railway змінні задаються в панелі).
try { require('dotenv').config(); } catch (_) { /* dotenv не встановлено — ок */ }

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------- Конфігурація (з .env) ----------------------
const CFG = {
  PORT:            process.env.PORT || 3000,
  MERCHANT_ACCOUNT: process.env.WFP_MERCHANT_ACCOUNT || 'test_merch_n1',
  MERCHANT_SECRET:  process.env.WFP_MERCHANT_SECRET  || 'flk3409refn54t54t*FNJRET',
  MERCHANT_DOMAIN:  process.env.WFP_MERCHANT_DOMAIN  || 'example.com', // домен без https://
  PRODUCT_NAME:     process.env.PRODUCT_NAME || 'ЧИТ-КОД для SMM',
  PRICE:            Number(process.env.PRICE || 790),
  CURRENCY:         process.env.CURRENCY || 'UAH',
  BOT_USERNAME:     process.env.BOT_USERNAME || 'your_sendpulse_bot', // без @
  SENDPULSE_FLOW_ID: process.env.SENDPULSE_FLOW_ID || 'REPLACE_FLOW_ID', // ID флоу видачі курсу в SendPulse
  ALLOW_REENTRY:    process.env.ALLOW_REENTRY === 'true', // false = строго одноразово (за замовч.)
  LANDING_URL:      process.env.LANDING_URL || 'https://example.com',  // сторінка лендінгу
  SERVER_URL:       process.env.SERVER_URL  || 'https://pay.example.com', // публічний URL цього сервера
  WFP_PAY_ENDPOINT: 'https://secure.wayforpay.com/pay',
};

// ---------------------- Примітивне сховище (JSON) ----------------------
const DB_FILE = path.join(__dirname, 'db.json');
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { orders: {}, tokens: {} }; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
let db = loadDB();

// ---------------------- WayForPay підписи (HMAC-MD5) ----------------------
function hmacMd5(fields) {
  const str = fields.join(';');
  return crypto.createHmac('md5', CFG.MERCHANT_SECRET).update(str, 'utf8').digest('hex');
}
// Підпис запиту Purchase
function purchaseSignature(o) {
  return hmacMd5([
    CFG.MERCHANT_ACCOUNT, CFG.MERCHANT_DOMAIN, o.orderReference, o.orderDate,
    o.amount, CFG.CURRENCY, CFG.PRODUCT_NAME, 1, o.amount,
  ]);
}
// Підпис, який надсилає WayForPay у callback (для перевірки)
function callbackSignature(p) {
  return hmacMd5([
    p.merchantAccount, p.orderReference, p.amount, p.currency,
    p.authCode, p.cardPan, p.transactionStatus, p.reasonCode,
  ]);
}
// Підпис нашої відповіді WayForPay на callback
function acceptSignature(orderReference, status, time) {
  return hmacMd5([orderReference, status, time]);
}

function randToken() { return crypto.randomBytes(16).toString('hex'); } // 32 символи
// Посилання через проміжний домен SendPulse tg.pulse.is:
//   start=<FLOW_ID> запускає флоу видачі курсу, token=<...> зберігається у
//   змінну підписника (її треба створити в Audience), і флоу перевіряє її через /validate.
function deepLink(token) {
  return `https://tg.pulse.is/${CFG.BOT_USERNAME}?start=${CFG.SENDPULSE_FLOW_ID}&token=${token}`;
}

// ---------------------- App ----------------------
const app = express();
// Для /callback потрібен сирий текст (WayForPay шле JSON у тілі)
app.use('/callback', express.text({ type: () => true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health-check
app.get('/', (_req, res) => res.send('ЧИТ-КОД pay-server: OK'));

/* -------------------- 1) Створення платежу -------------------- */
app.get('/pay', (req, res) => {
  const orderReference = 'CHITKOD-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
  const orderDate = Math.floor(Date.now() / 1000);
  const amount = CFG.PRICE;

  db.orders[orderReference] = { status: 'pending', amount, createdAt: orderDate, token: null };
  saveDB(db);

  const sig = purchaseSignature({ orderReference, orderDate, amount });

  // Автосабміт-форма на сторону WayForPay
  const fields = {
    merchantAccount: CFG.MERCHANT_ACCOUNT,
    merchantDomainName: CFG.MERCHANT_DOMAIN,
    merchantSignature: sig,
    orderReference,
    orderDate,
    amount,
    currency: CFG.CURRENCY,
    productName: [CFG.PRODUCT_NAME],
    productPrice: [amount],
    productCount: [1],
    returnUrl: CFG.SERVER_URL + '/return',
    serviceUrl: CFG.SERVER_URL + '/callback',
    // За бажанням можна передати мову: language: 'UA'
  };

  const inputs = [];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach(item => inputs.push(`<input type="hidden" name="${k}[]" value="${String(item).replace(/"/g,'&quot;')}">`));
    else inputs.push(`<input type="hidden" name="${k}" value="${String(v).replace(/"/g,'&quot;')}">`);
  }

  res.send(`<!doctype html><html lang="uk"><head><meta charset="utf-8">
    <title>Перенаправлення на оплату…</title></head>
    <body style="font-family:sans-serif;text-align:center;padding-top:60px;color:#34302E">
    <p>Перенаправляємо на захищену сторінку оплати WayForPay…</p>
    <form id="wfp" method="post" action="${CFG.WFP_PAY_ENDPOINT}" accept-charset="utf-8">${inputs.join('')}</form>
    <script>document.getElementById('wfp').submit();</script>
    </body></html>`);
});

/* -------------------- 2) Callback від WayForPay (serviceUrl) -------------------- */
app.post('/callback', (req, res) => {
  let payload;
  try {
    // Тіло приходить як JSON-рядок; іноді як перший ключ form-даних
    const raw = typeof req.body === 'string' ? req.body : '';
    payload = raw ? JSON.parse(raw) : req.body;
    if (typeof payload === 'object' && payload && !payload.orderReference) {
      const firstKey = Object.keys(payload)[0];
      if (firstKey && firstKey.trim().startsWith('{')) payload = JSON.parse(firstKey);
    }
  } catch (e) {
    console.error('callback parse error', e);
    return res.status(400).send('bad payload');
  }

  const expected = callbackSignature(payload);
  if (expected !== payload.merchantSignature) {
    console.warn('callback signature mismatch for', payload.orderReference);
    return res.status(403).send('bad signature');
  }

  const order = db.orders[payload.orderReference];
  if (order) {
    if (payload.transactionStatus === 'Approved') {
      if (order.status !== 'paid') {
        order.status = 'paid';
        order.token = randToken();
        db.tokens[order.token] = { orderReference: payload.orderReference, used: false, boundUser: null, createdAt: Math.floor(Date.now()/1000) };
      }
    } else {
      order.status = 'failed:' + payload.transactionStatus;
    }
    saveDB(db);
  }

  // Обовʼязкова відповідь WayForPay
  const time = Math.floor(Date.now() / 1000);
  const status = 'accept';
  res.json({
    orderReference: payload.orderReference,
    status,
    time,
    signature: acceptSignature(payload.orderReference, status, time),
  });
});

/* -------------------- 3) Повернення користувача (returnUrl) -------------------- */
// WayForPay повертає користувача сюди (POST). Показуємо сторінку очікування,
// яка дочекається підтвердження від callback і відправить на лендінг з deep-link.
app.all('/return', (req, res) => {
  const orderReference = (req.body && req.body.orderReference) || req.query.orderReference || '';
  res.send(`<!doctype html><html lang="uk"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Підтверджуємо оплату…</title></head>
    <body style="font-family:sans-serif;text-align:center;padding-top:70px;color:#34302E;background:#F7F1EC">
    <div style="max-width:420px;margin:0 auto">
      <div style="width:44px;height:44px;border:4px solid #E7DCD3;border-top-color:#D9869F;border-radius:50%;margin:0 auto 20px;animation:s 1s linear infinite"></div>
      <h2 style="font-weight:800">Підтверджуємо оплату…</h2>
      <p id="msg" style="color:#5A524D">Це займе кілька секунд. Не закривай сторінку.</p>
    </div>
    <style>@keyframes s{to{transform:rotate(360deg)}}</style>
    <script>
      const ref = ${JSON.stringify(orderReference)};
      const landing = ${JSON.stringify(CFG.LANDING_URL)};
      let tries = 0;
      async function poll(){
        tries++;
        try{
          const r = await fetch('/order-status?ref='+encodeURIComponent(ref), {cache:'no-store'});
          const d = await r.json();
          if (d.status === 'paid' && d.tg){
            location.href = landing + '?status=approved&tg=' + encodeURIComponent(d.tg);
            return;
          }
          if (d.status && d.status.indexOf('failed') === 0){
            location.href = landing + '?status=declined';
            return;
          }
        }catch(e){}
        if (tries > 20){ // ~30 c
          document.getElementById('msg').textContent = 'Оплата ще обробляється. Якщо кошти списано — доступ надійде. Онови сторінку за хвилину.';
          return;
        }
        setTimeout(poll, 1500);
      }
      poll();
    </script>
    </body></html>`);
});

// Поллер статусу для сторінки очікування
app.get('/order-status', (req, res) => {
  const order = db.orders[req.query.ref];
  if (!order) return res.json({ status: 'unknown' });
  res.json({ status: order.status, tg: order.token ? deepLink(order.token) : null });
});

/* -------------------- 4) Валідація одноразового токена (для SendPulse) -------------------- */
// Бот у флоу викликає цей ендпойнт елементом «HTTP-запит».
// Передавай token (обовʼязково) та uid — id підписника Telegram (бажано).
app.get('/validate', (req, res) => {
  const token = req.query.token || '';
  const uid = (req.query.uid || '').toString();
  const t = db.tokens[token];

  if (!t) return res.json({ ok: false, status: 'invalid' });

  // Уже використаний.
  if (t.used) {
    // Строгий режим (за замовч.): посилання спрацьовує РІВНО один раз → відмова.
    // Якщо ALLOW_REENTRY=true — дозволяємо тому самому покупцю повернутись.
    if (CFG.ALLOW_REENTRY && uid && t.boundUser === uid) {
      return res.json({ ok: true, status: 'valid' });
    }
    return res.json({ ok: false, status: 'used' });
  }

  // Перше використання → «спалюємо» токен.
  t.used = true;
  t.boundUser = uid || 'used';
  t.usedAt = Math.floor(Date.now() / 1000);
  saveDB(db);
  return res.json({ ok: true, status: 'valid' });
});

app.listen(CFG.PORT, () => {
  console.log(`ЧИТ-КОД pay-server слухає порт ${CFG.PORT}`);
  console.log(`SERVER_URL=${CFG.SERVER_URL}  LANDING_URL=${CFG.LANDING_URL}  BOT=@${CFG.BOT_USERNAME}`);
});
