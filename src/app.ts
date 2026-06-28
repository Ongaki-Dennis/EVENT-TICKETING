import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import QRCode from "qrcode";
import swaggerUi from "swagger-ui-express";

import { TtlCache } from "./cache";
import { JsonStore } from "./db";
import { swaggerDocument } from "./docs";
import { emailConfigured, getEmailProvider, sendEmail } from "./email";
import { rateLimit, requireAuth } from "./middleware";
import { initializePaystack, verifyPaystackTransaction } from "./paystack";
import { hashPassword, signToken, verifyPassword } from "./security";
import { AuthUser, EventfulEvent, Payment, Role, Ticket, User } from "./types";

const required = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const id = () => crypto.randomUUID();

const eastAfricaCurrencies = [
  { code: "KES", name: "Kenyan Shilling", country: "Kenya", paystack: true },
  { code: "USD", name: "US Dollar", country: "Kenya international payments", paystack: true },
  { code: "UGX", name: "Ugandan Shilling", country: "Uganda", paystack: false },
  { code: "TZS", name: "Tanzanian Shilling", country: "Tanzania", paystack: false },
  { code: "RWF", name: "Rwandan Franc", country: "Rwanda", paystack: false },
  { code: "BIF", name: "Burundian Franc", country: "Burundi", paystack: false },
  { code: "ETB", name: "Ethiopian Birr", country: "Ethiopia", paystack: false },
  { code: "SSP", name: "South Sudanese Pound", country: "South Sudan", paystack: false }
];

const paystackCurrencies = new Set(["NGN", "GHS", "ZAR", "KES", "USD", "XOF"]);

export function createApp(store = new JsonStore()) {
  const app = express();
  const cache = new TtlCache<unknown>(45_000);
  const authSecret = process.env.AUTH_SECRET || "eventful-local-dev-secret";
  const publicUrl = resolvePublicUrl();

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(rateLimit());
  app.use(express.static(path.join(process.cwd(), "public")));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  const auth = (roles?: Role[]) => requireAuth(authSecret, store, roles);

  app.get("/", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "index.html"));
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "eventful", docs: "/api/docs" });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      paystack: {
        live: Boolean(process.env.PAYSTACK_SECRET_KEY),
        publicKeyConfigured: Boolean(process.env.PAYSTACK_PUBLIC_KEY),
        mode: process.env.PAYSTACK_SECRET_KEY ? "live-or-test-key" : "local-simulation",
        callbackUrlRequired: `${publicUrl}/api/payments/:reference/callback`
      },
      email: {
        live: emailConfigured(),
        mode: getEmailProvider()
      }
    });
  });

  app.get("/api/currencies", (_req, res) => {
    res.json({
      eastAfrica: eastAfricaCurrencies,
      paystackSupported: [...paystackCurrencies],
      defaultCurrency: process.env.DEFAULT_CURRENCY || "KES"
    });
  });

  app.post("/api/auth/register", (req, res) => {
    const { name, email, password, role } = req.body || {};
    const isValidRole = role === "creator" || role === "eventee";

    if (![name, email, password].every(required) || !isValidRole) {
      return res.status(400).json({ message: "Name, email, password, and a valid role are required" });
    }

    const db = store.read();
    const normalizedEmail = String(email).toLowerCase();

    if (db.users.some((user) => user.email === normalizedEmail)) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const user: User = {
      id: id(),
      name,
      email: normalizedEmail,
      role,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    store.write(db);

    const token = signToken({ id: user.id, role: user.role, email: user.email }, authSecret);

    return res.status(201).json({ token, user: sanitizeUser(user) });
  });

  app.post("/api/auth/login", (req, res) => {
    const db = store.read();
    const user = db.users.find((u) => u.email === String(req.body.email || "").toLowerCase());

    if (!user || !verifyPassword(String(req.body.password || ""), user.passwordHash)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({ id: user.id, role: user.role, email: user.email }, authSecret);

    return res.json({ token, user: sanitizeUser(user) });
  });

  app.post("/api/auth/demo", (req, res) => {
    const role: Role = req.body.role === "eventee" ? "eventee" : "creator";
    const db = store.read();
    const email = role === "creator" ? "creator@eventful.test" : "eventee@eventful.test";
    let user = db.users.find((candidate) => candidate.email === email);
    const demoUser = {
      name: role === "creator" ? "Amina Creator" : "Brian Eventee",
      email,
      role,
      passwordHash: hashPassword("password123")
    };

    if (user) {
      user.name = demoUser.name;
      user.role = role;
      user.passwordHash = demoUser.passwordHash;
    } else {
      user = { id: id(), ...demoUser, createdAt: new Date().toISOString() };
      db.users.push(user);
    }

    store.write(db);
    const token = signToken({ id: user.id, role: user.role, email: user.email }, authSecret);
    return res.json({ token, user: sanitizeUser(user), password: "password123" });
  });

  app.get("/api/events", (_req, res) => {
    const cached = cache.get("published-events");
    if (cached) return res.json(cached);
    const events = store.read().events.filter((event) => event.status === "published").sort(byStartDate);
    return res.json(cache.set("published-events", { events }));
  });

  app.post("/api/events", auth(["creator"]), (req, res) => {
    const { title, description, category, venue, startsAt, endsAt, price, currency, capacity, reminderOptions } = req.body;

    if (![title, description, category, venue, startsAt, endsAt].every(required)) {
      return res.status(400).json({ message: "Missing required event details" });
    }

    const eventId = id();
    const now = new Date().toISOString();
    const normalizedCurrency = String(currency || process.env.DEFAULT_CURRENCY || "KES").toUpperCase();

    const event: EventfulEvent = {
      id: eventId,
      creatorId: req.user!.id,
      title,
      description,
      category,
      venue,
      startsAt,
      endsAt,
      price: Number(price || 0),
      currency: normalizedCurrency,
      capacity: Number(capacity || 100),
      status: "published",
      reminderOptions: normalizeReminderOptions(reminderOptions),
      shareUrl: `${publicUrl}/?event=${eventId}`,
      createdAt: now,
      updatedAt: now
    };

    const db = store.read();
    db.events.push(event);
    store.write(db);
    cache.delete("published-events");
    return res.status(201).json({ event });
  });

  app.get("/api/events/mine", auth(["creator"]), (req, res) => {
    const db = store.read();
    const events = db.events.filter((event) => event.creatorId === req.user!.id).sort(byStartDate);
    const eventIds = new Set(events.map((event) => event.id));
    const paymentsByTicket = new Map(db.payments.map((payment) => [payment.ticketId, payment]));
    const eventeesById = new Map(db.users.filter((user) => user.role === "eventee").map((user) => [user.id, user]));
    const attendees = db.tickets
      .filter((ticket) => eventIds.has(ticket.eventId))
      .map((ticket) => {
        const event = events.find((candidate) => candidate.id === ticket.eventId);
        const eventee = eventeesById.get(ticket.eventeeId);
        const payment = paymentsByTicket.get(ticket.id);
        return {
          ticketId: ticket.id,
          eventId: ticket.eventId,
          eventTitle: event?.title || "Unknown event",
          quantity: ticket.quantity,
          ticketStatus: ticket.status,
          appliedAt: ticket.createdAt,
          checkedInAt: ticket.checkedInAt,
          eventee: eventee ? sanitizeUser(eventee) : null,
          payment: payment
            ? {
                reference: payment.reference,
                status: payment.status,
                amount: payment.amount,
                currency: payment.currency,
                paidAt: payment.paidAt
              }
            : null
        };
      });
    return res.json({ events, attendees });
  });

  app.post("/api/events/:id/attend", auth(["eventee"]), async (req, res, next) => {
    try {
      const db = store.read();
      const event = db.events.find((candidate) => candidate.id === req.params.id && candidate.status === "published");
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (!paystackCurrencies.has(event.currency)) {
        return res.status(422).json({
          message: `${event.currency} is available for event display, but Paystack checkout is not supported for that currency yet. Use KES or USD for East Africa Paystack payments.`
        });
      }

      const quantity = Math.max(1, Number(req.body.quantity || 1));
      const sold = db.tickets.filter((ticket) => ticket.eventId === event.id && ticket.status !== "reserved").reduce((sum, ticket) => sum + ticket.quantity, 0);
      if (sold + quantity > event.capacity) return res.status(409).json({ message: "Not enough tickets available" });

      const ticket: Ticket = { id: id(), eventId: event.id, eventeeId: req.user!.id, quantity, status: "reserved", createdAt: new Date().toISOString() };
      const reference = `EVT-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const payment: Payment = {
        id: id(),
        eventId: event.id,
        ticketId: ticket.id,
        eventeeId: req.user!.id,
        creatorId: event.creatorId,
        amount: event.price * quantity,
        currency: event.currency,
        status: "pending",
        provider: "paystack",
        reference,
        createdAt: new Date().toISOString()
      };

      const eventee = db.users.find((user) => user.id === req.user!.id)!;
      const checkout = await initializePaystack({
        email: eventee.email,
        amount: payment.amount,
        currency: payment.currency,
        reference,
        callbackUrl: `${publicUrl}/api/payments/${reference}/callback`,
        metadata: {
          eventId: event.id,
          ticketId: ticket.id,
          eventTitle: event.title,
          quantity
        }
      }, process.env.PAYSTACK_SECRET_KEY);

      payment.authorizationUrl = checkout.authorizationUrl;
      db.tickets.push(ticket);
      db.payments.push(payment);
      store.write(db);
      return res.status(201).json({ ticket, payment, checkout });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/payments/:reference/callback", async (req, res, next) => {
    try {
      await confirmPayment(String(req.params.reference), store, cache, authSecret);
      return res.redirect(`/?payment=${encodeURIComponent(req.params.reference)}&status=paid`);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/payments/:reference/status", auth(), (req, res) => {
    const payment = store.read().payments.find((candidate) => candidate.reference === req.params.reference);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (req.user!.role === "eventee" && payment.eventeeId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
    if (req.user!.role === "creator" && payment.creatorId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
    return res.json({ payment });
  });

  app.post("/api/payments/:reference/confirm", auth(["eventee"]), async (req, res) => {
    const db = store.read();
    const payment = db.payments.find((candidate) => candidate.reference === req.params.reference && candidate.eventeeId === req.user!.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    const result = await confirmPayment(String(req.params.reference), store, cache, authSecret);
    return res.json(result);
  });

  app.get("/api/tickets/me", auth(["eventee"]), (req, res) => {
    const db = store.read();
    const tickets = db.tickets.filter((ticket) => ticket.eventeeId === req.user!.id);
    return res.json({ tickets });
  });

  app.get("/api/tickets/:id/qr", auth(), (req, res) => {
    const db = store.read();
    const ticket = db.tickets.find((candidate) => candidate.id === req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (req.user!.role === "eventee" && ticket.eventeeId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
    if (req.user!.role === "creator") {
      const event = db.events.find((candidate) => candidate.id === ticket.eventId);
      if (!event || event.creatorId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
    }
    if (!ticket.qrCodeDataUrl) return res.status(409).json({ message: "Ticket is not paid yet" });
    return res.json({ ticketId: ticket.id, qrPayload: ticket.qrPayload, qrCodeDataUrl: ticket.qrCodeDataUrl });
  });

  app.post("/api/tickets/verify", auth(["creator"]), (req, res) => {
    let payload: { ticketId?: string; eventId?: string; eventeeId?: string } | null = null;
    try {
      payload = parseQrPayload(req.body.qrPayload, authSecret);
    } catch {
      return res.status(400).json({ valid: false, message: "Invalid QR code signature" });
    }

    const db = store.read();
    const ticket = db.tickets.find((candidate) => candidate.id === payload?.ticketId);
    const event = ticket && db.events.find((candidate) => candidate.id === ticket.eventId);
    if (!ticket || !event || event.creatorId !== req.user!.id || ticket.status === "reserved" || ticket.eventId !== payload?.eventId || ticket.eventeeId !== payload?.eventeeId) {
      return res.status(400).json({ valid: false, message: "Invalid ticket" });
    }
    if (ticket.status === "checked_in") {
      return res.status(409).json({ valid: false, message: "Ticket has already been scanned", ticket });
    }
    ticket.status = "checked_in";
    ticket.checkedInAt = new Date().toISOString();
    store.write(db);
    return res.json({ valid: true, ticket });
  });

  app.post("/api/reminders", auth(["eventee"]), (req, res) => {
    const db = store.read();
    if (!db.events.some((event) => event.id === req.body.eventId)) return res.status(404).json({ message: "Event not found" });
    const reminder = {
      id: id(),
      eventId: req.body.eventId,
      eventeeId: req.user!.id,
      offsetMinutes: Number(req.body.offsetMinutes || 1440),
      channel: ["email", "sms", "push"].includes(req.body.channel) ? req.body.channel : "email",
      createdAt: new Date().toISOString()
    };
    db.reminders.push(reminder);
    store.write(db);
    return res.status(201).json({ reminder });
  });

  app.post("/api/notifications/reminders/send-due", auth(), async (req, res, next) => {
    try {
      const now = new Date(req.body.now || new Date());
      const db = store.read();
      const sent = [];
      for (const reminder of db.reminders) {
        const event = db.events.find((candidate) => candidate.id === reminder.eventId);
        const eventee = db.users.find((candidate) => candidate.id === reminder.eventeeId);
        if (!event || !eventee) continue;
        const dueAt = new Date(new Date(event.startsAt).getTime() - reminder.offsetMinutes * 60_000);
        if (dueAt <= now) {
          sent.push(await sendEventReminder(store, event, eventee.email, reminder.offsetMinutes));
        }
      }
      return res.json({ sent });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/notifications/outbox", auth(), (req, res) => {
    const db = store.read();
    const emailLogs = req.user!.role === "creator" ? db.emailLogs : db.emailLogs.filter((log) => log.to === req.user!.email);
    return res.json({ emailLogs });
  });

  app.get("/api/analytics/creator", auth(["creator"]), (req, res) => {
    const db = store.read();
    const events = db.events.filter((event) => event.creatorId === req.user!.id);
    const eventIds = new Set(events.map((event) => event.id));
    const tickets = db.tickets.filter((ticket) => eventIds.has(ticket.eventId));
    const payments = db.payments.filter((payment) => eventIds.has(payment.eventId));
    return res.json({
      lifetime: {
        attendees: new Set(tickets.map((ticket) => ticket.eventeeId)).size,
        ticketsBought: tickets.filter((ticket) => ticket.status !== "reserved").reduce((sum, ticket) => sum + ticket.quantity, 0),
        checkedIn: tickets.filter((ticket) => ticket.status === "checked_in").length,
        revenue: payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0)
      },
      events: events.map((event) => eventAnalytics(event, tickets, payments))
    });
  });

  app.get("/api/payments/creator", auth(["creator"]), (req, res) => {
    const payments = store.read().payments.filter((payment) => payment.creatorId === req.user!.id);
    return res.json({ payments });
  });

  app.get("/api/share/:id", (req, res) => {
    const event = store.read().events.find((candidate) => candidate.id === req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    const shareText = `Join me at ${event.title} on Eventful`;
    const text = encodeURIComponent(shareText);
    const url = encodeURIComponent(event.shareUrl);
    return res.json({
      url: event.shareUrl,
      title: event.title,
      text: shareText,
      links: {
        x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
        whatsapp: `https://wa.me/?text=${text}%20${url}`,
        telegram: `https://t.me/share/url?url=${url}&text=${text}`,
        email: `mailto:?subject=${encodeURIComponent(event.title)}&body=${text}%0A${url}`
      }
    });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error" });
  });

  return app;
}

function resolvePublicUrl() {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

function sanitizeUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

function normalizeReminderOptions(options: unknown) {
  const defaults = [
    { id: id(), offsetMinutes: 1440, channel: "email" as const, label: "1 day before" },
    { id: id(), offsetMinutes: 10080, channel: "email" as const, label: "1 week before" }
  ];
  if (!Array.isArray(options) || !options.length) return defaults;
  return options.map((option) => ({
    id: id(),
    offsetMinutes: Number((option as { offsetMinutes?: number }).offsetMinutes || 1440),
    channel: ["email", "sms", "push"].includes(String((option as { channel?: string }).channel)) ? (option as { channel: "email" | "sms" | "push" }).channel : "email",
    label: String((option as { label?: string }).label || `${(option as { offsetMinutes?: number }).offsetMinutes || 1440} minutes before`)
  }));
}

function byStartDate(a: EventfulEvent, b: EventfulEvent) {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function eventAnalytics(event: EventfulEvent, tickets: Ticket[], payments: Payment[]) {
  const scopedTickets = tickets.filter((ticket) => ticket.eventId === event.id);
  const scopedPayments = payments.filter((payment) => payment.eventId === event.id);
  return {
    eventId: event.id,
    title: event.title,
    attendees: new Set(scopedTickets.map((ticket) => ticket.eventeeId)).size,
    ticketsBought: scopedTickets.filter((ticket) => ticket.status !== "reserved").reduce((sum, ticket) => sum + ticket.quantity, 0),
    checkedIn: scopedTickets.filter((ticket) => ticket.status === "checked_in").length,
    revenue: scopedPayments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0)
  };
}

async function confirmPayment(reference: string, store: JsonStore, cache: TtlCache<unknown>, authSecret: string) {
  const db = store.read();
  const payment = db.payments.find((candidate) => candidate.reference === reference);
  if (!payment) throw new Error("Payment not found");
  const verification = await verifyPaystackTransaction(reference, process.env.PAYSTACK_SECRET_KEY);
  if (!verification.paid) {
    payment.status = "failed";
    store.write(db);
    return { payment, verification };
  }

  payment.status = "paid";
  payment.paidAt = payment.paidAt || new Date().toISOString();
  const ticket = db.tickets.find((candidate) => candidate.id === payment.ticketId);
  if (!ticket) throw new Error("Ticket not found");
  ticket.status = ticket.status === "checked_in" ? "checked_in" : "paid";
  ticket.qrPayload = ticket.qrPayload || createQrPayload(ticket, authSecret);
  ticket.qrCodeDataUrl = ticket.qrCodeDataUrl || await QRCode.toDataURL(ticket.qrPayload);
  store.write(db);
  cache.delete("published-events");
  const event = db.events.find((candidate) => candidate.id === ticket.eventId);
  const eventee = db.users.find((candidate) => candidate.id === ticket.eventeeId);
  if (event && eventee) {
    await sendEmail(store, {
      to: eventee.email,
      subject: `Your Eventful ticket for ${event.title}`,
      html: `<h1>${event.title}</h1><p>Your payment is confirmed. Your QR ticket is ready in Eventful.</p><p>Venue: ${event.venue}</p><p>Starts: ${new Date(event.startsAt).toLocaleString()}</p>`
    });
  }
  return { payment, ticket, verification };
}

function createQrPayload(ticket: Ticket, secret: string) {
  const payload = {
    ticketId: ticket.id,
    eventId: ticket.eventId,
    eventeeId: ticket.eventeeId,
    issuedAt: new Date().toISOString()
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function parseQrPayload(rawPayload: unknown, secret: string) {
  if (typeof rawPayload !== "string") {
    throw new Error("QR payload must be a string");
  }

  if (rawPayload.includes(".")) {
    const [body, signature] = rawPayload.split(".");
    if (!body || !signature) throw new Error("Malformed QR payload");
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new Error("Invalid QR signature");
    }
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  }

  return JSON.parse(rawPayload);
}

async function sendEventReminder(store: JsonStore, event: EventfulEvent, email: string, offsetMinutes: number) {
  const label = offsetMinutes >= 1440 ? `${Math.round(offsetMinutes / 1440)} day(s)` : `${offsetMinutes} minute(s)`;
  return sendEmail(store, {
    to: email,
    subject: `Reminder: ${event.title} starts soon`,
    html: `<h1>${event.title}</h1><p>This is your Eventful reminder ${label} before the event.</p><p>${event.venue}</p><p>${new Date(event.startsAt).toLocaleString()}</p>`
  });
}
