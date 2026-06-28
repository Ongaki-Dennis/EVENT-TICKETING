import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { JsonStore } from "./db";

interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export function emailConfigured() {
  return getEmailProvider() !== "dev-outbox";
}

export function getEmailProvider() {
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (smtpReady) {
    return "smtp" as const;
  }

  const mailgunReady = Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.MAILGUN_FROM);
  if (mailgunReady) {
    return "mailgun" as const;
  }

  return "dev-outbox" as const;
}

export async function sendEmail(store: JsonStore, input: MailInput) {
  const db = store.read();
  const log = buildLog(input);

  const provider = getEmailProvider();

  if (provider === "dev-outbox") {
    db.emailLogs.push(log);
    store.write(db);
    return log;
  }

  const sentLog =
    provider === "smtp"
      ? await sendViaSmtp(input, log)
      : await sendViaMailgun(input, log);

  db.emailLogs.push(sentLog);
  store.write(db);
  return sentLog;
}

async function sendViaSmtp(input: MailInput, log: ReturnType<typeof buildLog>) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  const result = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    html: input.html
  });

  return {
    ...log,
    status: "sent" as const,
    provider: "smtp" as const,
    messageId: result.messageId
  };
}

async function sendViaMailgun(input: MailInput, log: ReturnType<typeof buildLog>) {
  const domain = process.env.MAILGUN_DOMAIN as string;
  const apiKey = process.env.MAILGUN_API_KEY as string;
  const from = process.env.MAILGUN_FROM as string;

  const body = new URLSearchParams({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html
  });

  const response = await fetch(`https://api.mailgun.net/v3/${encodeURIComponent(domain)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Mailgun send failed");
  }

  return {
    ...log,
    status: "sent" as const,
    provider: "mailgun" as const,
    messageId: data.id || data.message_id
  };
}

function buildLog(input: MailInput) {
  return {
    id: crypto.randomUUID(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    status: "queued" as const,
    provider: "dev-outbox" as const,
    createdAt: new Date().toISOString()
  };
}
