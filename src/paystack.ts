import crypto from "node:crypto";

interface PaystackInitInput {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export async function initializePaystack(input: PaystackInitInput, secretKey?: string) {
  if (!secretKey) {
    return {
      authorizationUrl: `https://checkout.paystack.com/test_${input.reference}`,
      accessCode: `test_${input.reference}`,
      simulated: true
    };
  }

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: input.email,
      amount: String(Math.round(input.amount * 100)),
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined
    })
  });

  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Paystack initialization failed");
  }
  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    simulated: false
  };
}

export async function verifyPaystackTransaction(reference: string, secretKey?: string) {
  if (!secretKey) {
    return { paid: true, simulated: true, status: "success" };
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`
    }
  });
  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Paystack verification failed");
  }
  return {
    paid: data.data?.status === "success",
    simulated: false,
    status: data.data?.status || "unknown",
    gatewayResponse: data.data?.gateway_response
  };
}

export function verifyPaystackSignature(rawBody: string, signature: string | undefined, secretKey: string | undefined) {
  if (!secretKey || !signature) return false;
  const digest = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
