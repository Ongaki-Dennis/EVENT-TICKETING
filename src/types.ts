export type Role = "creator" | "eventee";
export type EventStatus = "draft" | "published" | "cancelled";
export type TicketStatus = "reserved" | "paid" | "checked_in";
export type PaymentStatus = "pending" | "paid" | "failed";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export interface EventReminder {
  id: string;
  offsetMinutes: number;
  channel: "email" | "sms" | "push";
  label: string;
}

export interface EventfulEvent {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  price: number;
  currency: string;
  capacity: number;
  status: EventStatus;
  reminderOptions: EventReminder[];
  shareUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  eventId: string;
  eventeeId: string;
  quantity: number;
  status: TicketStatus;
  qrPayload?: string;
  qrCodeDataUrl?: string;
  checkedInAt?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  eventId: string;
  ticketId: string;
  eventeeId: string;
  creatorId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: "paystack";
  reference: string;
  authorizationUrl?: string;
  paidAt?: string;
  createdAt: string;
}

export interface UserReminder {
  id: string;
  eventId: string;
  eventeeId: string;
  offsetMinutes: number;
  channel: "email" | "sms" | "push";
  createdAt: string;
}

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  html: string;
  status: "sent" | "queued";
  provider: "smtp" | "dev-outbox";
  messageId?: string;
  createdAt: string;
}

export interface Database {
  users: User[];
  events: EventfulEvent[];
  tickets: Ticket[];
  payments: Payment[];
  reminders: UserReminder[];
  emailLogs: EmailLog[];
}

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}
