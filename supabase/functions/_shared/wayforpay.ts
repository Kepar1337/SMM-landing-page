// Підписи WayForPay. Усі — HMAC-MD5, ключ = WAYFORPAY_SECRET, hex-дайджест,
// поля конкатенуються через ';' (UTF-8). Точні порядки полів — з документації
// WayForPay, не змінювати.

import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

function hmacMd5(secret: string, fields: Array<string | number>): string {
  return createHmac("md5", secret)
    .update(fields.join(";"), "utf8")
    .digest("hex");
}

export interface PurchaseFields {
  merchantAccount: string;
  merchantDomainName: string;
  orderReference: string;
  orderDate: number;
  amount: string | number;
  currency: string;
  productName: string[];
  productCount: Array<string | number>;
  productPrice: Array<string | number>;
}

// Підпис Purchase-запиту:
// merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;
// productName[...];productCount[...];productPrice[...]
export function signPurchase(secret: string, f: PurchaseFields): string {
  return hmacMd5(secret, [
    f.merchantAccount,
    f.merchantDomainName,
    f.orderReference,
    f.orderDate,
    f.amount,
    f.currency,
    ...f.productName,
    ...f.productCount,
    ...f.productPrice,
  ]);
}

export interface CallbackBody {
  merchantAccount: string;
  orderReference: string;
  amount: string | number;
  currency: string;
  authCode: string;
  cardPan: string;
  transactionStatus: string;
  reasonCode: string | number;
  merchantSignature: string;
  [key: string]: unknown;
}

// Перевірка підпису колбека:
// merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode
export function verifyCallback(secret: string, body: CallbackBody): boolean {
  const expected = hmacMd5(secret, [
    body.merchantAccount,
    body.orderReference,
    body.amount,
    body.currency,
    body.authCode,
    body.cardPan,
    body.transactionStatus,
    body.reasonCode,
  ]);
  const got = String(body.merchantSignature ?? "");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(got, "utf8"));
}

// Підпис нашої відповіді WayForPay: orderReference;status;time
export function signResponse(
  secret: string,
  orderReference: string,
  status: string,
  time: number,
): string {
  return hmacMd5(secret, [orderReference, status, time]);
}
