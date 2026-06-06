import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { JsonStore } from "./db";

interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(store: JsonStore, input: MailInput) {
  const db = store.read();
  const log = {
    id: crypto.randomUUID(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    status: "queued" as const,
    provider: "dev-outbox" as const,
    createdAt: new Date().toISOString()
  };

  if (!emailConfigured()) {
    db.emailLogs.push(log);
    store.write(db);
    return log;
  }

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

  const sentLog = {
    ...log,
    status: "sent" as const,
    provider: "smtp" as const,
    messageId: result.messageId
  };
  db.emailLogs.push(sentLog);
  store.write(db);
  return sentLog;
}
