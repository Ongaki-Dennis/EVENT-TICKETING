import crypto from "node:crypto";

export type PaymentProvider = "mpesa" | "stripe" | "bitcoin" | "ethereum" | "usdt" | "wallet";
export type PaymentStatus = "pending" | "processing" | "confirmed" | "failed" | "reversed";

export interface PaymentIntent {
  tenantId: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  reference: string;
  metadata: Record<string, string>;
}

export interface ProviderEvent {
  provider: PaymentProvider;
  eventType: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  rawPayload: unknown;
}

export function createWalletTopUpIntent(
  tenantId: string,
  provider: PaymentProvider,
  amount: number,
  currency: string
): PaymentIntent {
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  return {
    tenantId,
    provider,
    amount,
    currency,
    reference: `ongaki_${provider}_${crypto.randomUUID()}`,
    metadata: {
      purpose: "wallet_top_up"
    }
  };
}

export function verifyMpesaCallbackSignature(payload: string, receivedSignature: string, callbackSecret: string): boolean {
  const expected = crypto.createHmac("sha256", callbackSecret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSignature));
}

export function normalizeMpesaEvent(payload: MpesaCallbackPayload): ProviderEvent {
  const resultCode = payload.Body.stkCallback.ResultCode;
  const metadata = payload.Body.stkCallback.CallbackMetadata?.Item ?? [];
  const amount = Number(metadata.find((item) => item.Name === "Amount")?.Value ?? 0);
  const receipt = String(metadata.find((item) => item.Name === "MpesaReceiptNumber")?.Value ?? payload.Body.stkCallback.CheckoutRequestID);

  return {
    provider: "mpesa",
    eventType: "stk_callback",
    reference: receipt,
    status: resultCode === 0 ? "confirmed" : "failed",
    amount,
    currency: "KES",
    rawPayload: payload
  };
}

export function verifyStripeSignature(payload: string, signature: string, webhookSecret: string): boolean {
  const signedPayload = payload.split(".").slice(0, 2).join(".");
  const expected = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
  return signature.includes(expected);
}

export function normalizeCryptoDeposit(
  provider: Extract<PaymentProvider, "bitcoin" | "ethereum" | "usdt">,
  txHash: string,
  confirmations: number,
  requiredConfirmations: number,
  amount: number,
  currency: string
): ProviderEvent {
  return {
    provider,
    eventType: "chain_deposit",
    reference: txHash,
    status: confirmations >= requiredConfirmations ? "confirmed" : "processing",
    amount,
    currency,
    rawPayload: {
      txHash,
      confirmations,
      requiredConfirmations
    }
  };
}

export function applyConfirmedPaymentToWallet(walletBalance: number, event: ProviderEvent): number {
  if (event.status !== "confirmed") {
    return walletBalance;
  }

  return roundMoney(walletBalance + event.amount);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

interface MpesaCallbackPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

