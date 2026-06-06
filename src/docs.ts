export const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Eventful API",
    version: "1.0.0",
    description: "Authentication, events, tickets, QR verification, reminders, analytics, sharing, and Paystack payments."
  },
  servers: [{ url: "http://localhost:3000" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
    }
  },
  paths: {
    "/api/auth/register": { post: { summary: "Register a creator or eventee" } },
    "/api/auth/login": { post: { summary: "Login and receive a bearer token" } },
    "/api/auth/demo": { post: { summary: "Create or refresh reliable demo creator/eventee credentials" } },
    "/api/config": { get: { summary: "Read Paystack and email integration status" } },
    "/api/events": {
      get: { summary: "List published events, cached for quick browsing" },
      post: { summary: "Create an event", security: [{ bearerAuth: [] }] }
    },
    "/api/events/mine": { get: { summary: "List events created by the current creator", security: [{ bearerAuth: [] }] } },
    "/api/events/{id}/attend": { post: { summary: "Reserve tickets and initialize Paystack payment", security: [{ bearerAuth: [] }] } },
    "/api/currencies": { get: { summary: "List East Africa currencies and Paystack-supported currencies" } },
    "/api/payments/{reference}/callback": { get: { summary: "Paystack redirect callback that verifies payment and unlocks QR ticket" } },
    "/api/payments/{reference}/confirm": { post: { summary: "Confirm a payment in test/sandbox mode", security: [{ bearerAuth: [] }] } },
    "/api/payments/{reference}/status": { get: { summary: "Read payment status for the buyer or creator", security: [{ bearerAuth: [] }] } },
    "/api/tickets/{id}/qr": { get: { summary: "Read the QR code for a paid ticket", security: [{ bearerAuth: [] }] } },
    "/api/tickets/verify": { post: { summary: "Scan and verify a ticket QR payload", security: [{ bearerAuth: [] }] } },
    "/api/reminders": { post: { summary: "Create a flexible eventee reminder", security: [{ bearerAuth: [] }] } },
    "/api/notifications/reminders/send-due": { post: { summary: "Send due reminder emails using SMTP or dev outbox", security: [{ bearerAuth: [] }] } },
    "/api/notifications/outbox": { get: { summary: "Read sent/dev-outbox email logs", security: [{ bearerAuth: [] }] } },
    "/api/analytics/creator": { get: { summary: "Creator lifetime and per-event analytics", security: [{ bearerAuth: [] }] } },
    "/api/payments/creator": { get: { summary: "Creator payment ledger", security: [{ bearerAuth: [] }] } },
    "/api/share/{id}": { get: { summary: "Get social sharing URLs for an event" } }
  }
};
