import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { JsonStore } from "../src/db";

function testApp() {
  const store = new JsonStore(path.join(os.tmpdir(), `eventful-${crypto.randomUUID()}.json`));
  return createApp(store);
}

function emptyDatabase() {
  return {
    users: [],
    events: [],
    tickets: [],
    payments: [],
    reminders: [],
    emailLogs: []
  };
}

async function register(app: ReturnType<typeof createApp>, role: "creator" | "eventee", email: string) {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ name: `${role} user`, email, password: "password123", role })
    .expect(201);
  return response.body.token as string;
}

describe("Eventful API", () => {
  it("provides reliable demo logins and service configuration status", async () => {
    const app = testApp();

    await request(app).get("/api/config").expect(200).expect((response) => {
      expect(response.body.paystack.mode).toBe("local-simulation");
      expect(response.body.email.mode).toBe("dev-outbox");
    });

    const creatorResponse = await request(app).post("/api/auth/demo").send({ role: "creator" }).expect(200);
    expect(creatorResponse.body.user.email).toBe("creator@eventful.test");

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "creator@eventful.test", password: "password123" })
      .expect(200);
    expect(loginResponse.body.user.role).toBe("creator");
  });

  it("seeds the default demo accounts on a fresh store so login works immediately", async () => {
    const store = new JsonStore(path.join(os.tmpdir(), `eventful-${crypto.randomUUID()}.json`));
    store.reset(emptyDatabase());
    const app = createApp(store);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "creator@eventful.test", password: "password123" })
      .expect(200);

    expect(response.body.user.email).toBe("creator@eventful.test");
  });

  it("registers creators, publishes events, sells tickets, generates QR codes, and verifies entry", async () => {
    const app = testApp();
    const creatorToken = await register(app, "creator", "creator@test.local");
    const eventeeToken = await register(app, "eventee", "eventee@test.local");

    const eventResponse = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        title: "Jazz in the Garden",
        description: "A warm outdoor concert.",
        category: "Concert",
        venue: "City Garden",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        price: 5000,
        currency: "KES",
        capacity: 30
      })
      .expect(201);

    const eventId = eventResponse.body.event.id;

    await request(app).get("/api/events").expect(200).expect((response) => {
      expect(response.body.events).toHaveLength(1);
    });

    const attendResponse = await request(app)
      .post(`/api/events/${eventId}/attend`)
      .set("Authorization", `Bearer ${eventeeToken}`)
      .send({ quantity: 2 })
      .expect(201);

    const confirmResponse = await request(app)
      .post(`/api/payments/${attendResponse.body.payment.reference}/confirm`)
      .set("Authorization", `Bearer ${eventeeToken}`)
      .send({})
      .expect(200);

    expect(confirmResponse.body.ticket.qrCodeDataUrl).toContain("data:image/png;base64");
    expect(confirmResponse.body.ticket.qrPayload).toContain(".");

    await request(app)
      .get("/api/notifications/outbox")
      .set("Authorization", `Bearer ${eventeeToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.emailLogs[0].subject).toContain("Jazz in the Garden");
      });

    const verifyResponse = await request(app)
      .post("/api/tickets/verify")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ qrPayload: confirmResponse.body.ticket.qrPayload })
      .expect(200);

    expect(verifyResponse.body.valid).toBe(true);

    await request(app)
      .post("/api/tickets/verify")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ qrPayload: confirmResponse.body.ticket.qrPayload })
      .expect(409);

    await request(app)
      .get("/api/analytics/creator")
      .set("Authorization", `Bearer ${creatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.lifetime.ticketsBought).toBe(2);
        expect(response.body.lifetime.checkedIn).toBe(1);
      });

    await request(app)
      .get("/api/events/mine")
      .set("Authorization", `Bearer ${creatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.events).toHaveLength(1);
        expect(response.body.attendees).toHaveLength(1);
        expect(response.body.attendees[0].eventee.email).toBe("eventee@test.local");
        expect(response.body.attendees[0].payment.status).toBe("paid");
      });

    await request(app)
      .get(`/api/share/${eventId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.url).toContain(eventId);
        expect(response.body.text).toContain("Jazz in the Garden");
        expect(Object.keys(response.body.links)).toEqual(expect.arrayContaining(["x", "facebook", "linkedin", "whatsapp", "telegram", "email"]));
      });
  });

  it("blocks event creation by eventees", async () => {
    const app = testApp();
    const eventeeToken = await register(app, "eventee", "fan@test.local");

    await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${eventeeToken}`)
      .send({ title: "Nope" })
      .expect(403);
  });

  it("blocks creators from attending events", async () => {
    const app = testApp();
    const creatorToken = await register(app, "creator", "owner@test.local");

    const eventResponse = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        title: "Creator Only Test",
        description: "A role guard test.",
        category: "Workshop",
        venue: "Nairobi",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        price: 1000,
        currency: "KES",
        capacity: 20
      })
      .expect(201);

    await request(app)
      .post(`/api/events/${eventResponse.body.event.id}/attend`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ quantity: 1 })
      .expect(403);
  });

  it("rejects tampered QR payloads", async () => {
    const app = testApp();
    const creatorToken = await register(app, "creator", "qr-creator@test.local");
    const eventeeToken = await register(app, "eventee", "qr-eventee@test.local");

    const eventResponse = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        title: "QR Guard Test",
        description: "A signed QR test.",
        category: "Security",
        venue: "Kigali",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        price: 1500,
        currency: "KES",
        capacity: 20
      })
      .expect(201);

    const attendResponse = await request(app)
      .post(`/api/events/${eventResponse.body.event.id}/attend`)
      .set("Authorization", `Bearer ${eventeeToken}`)
      .send({ quantity: 1 })
      .expect(201);

    const confirmResponse = await request(app)
      .post(`/api/payments/${attendResponse.body.payment.reference}/confirm`)
      .set("Authorization", `Bearer ${eventeeToken}`)
      .send({})
      .expect(200);

    const [, signature] = confirmResponse.body.ticket.qrPayload.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ ticketId: "fake", eventId: "fake", eventeeId: "fake" })).toString("base64url");

    await request(app)
      .post("/api/tickets/verify")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ qrPayload: `${tamperedBody}.${signature}` })
      .expect(400);
  });

  it("exposes East Africa currencies and blocks unsupported Paystack checkout currencies", async () => {
    const app = testApp();
    const creatorToken = await register(app, "creator", "ea-creator@test.local");
    const eventeeToken = await register(app, "eventee", "ea-eventee@test.local");

    await request(app).get("/api/currencies").expect(200).expect((response) => {
      expect(response.body.eastAfrica.map((currency: { code: string }) => currency.code)).toContain("KES");
      expect(response.body.eastAfrica.map((currency: { code: string }) => currency.code)).toContain("TZS");
    });

    const eventResponse = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        title: "Dar Tech Mixer",
        description: "A founder and builder meetup.",
        category: "Conference",
        venue: "Dar es Salaam",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        price: 25000,
        currency: "TZS",
        capacity: 40
      })
      .expect(201);

    await request(app)
      .post(`/api/events/${eventResponse.body.event.id}/attend`)
      .set("Authorization", `Bearer ${eventeeToken}`)
      .send({ quantity: 1 })
      .expect(422);
  });
});
