import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import swaggerUi from "swagger-ui-express";

import { TtlCache } from "./cache";
import { JsonStore } from "./db";
import { swaggerDocument } from "./docs";
import { emailConfigured } from "./email";
import { rateLimit, requireAuth } from "./middleware";
import { hashPassword, signToken, verifyPassword } from "./security";

const required = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

const id = () => crypto.randomUUID();

function sanitizeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function createApp(store = new JsonStore()) {
  const app = express();

  const authSecret =
    process.env.AUTH_SECRET || "eventful-local-dev-secret";

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(rateLimit());
  app.use(express.static(path.join(process.cwd(), "public")));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "eventful" });
  });

  app.post("/api/auth/register", (req, res) => {
    const { name, email, password, role } = req.body || {};

    const isValidRole = role === "creator" || role === "eventee";

    if (![name, email, password].every(required) || !isValidRole) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const db = store.read();
    const normalizedEmail = String(email).toLowerCase();

    if (db.users.some((u: any) => u.email === normalizedEmail)) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const user = {
      id: id(),
      name,
      email: normalizedEmail,
      role,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    store.write(db);

    const token = signToken(
      { id: user.id, role: user.role, email: user.email },
      authSecret
    );

    return res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const db = store.read();

    const user = db.users.find(
      (u: any) =>
        u.email === String(req.body.email || "").toLowerCase()
    );

    if (!user || !verifyPassword(req.body.password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(
      { id: user.id, role: user.role, email: user.email },
      authSecret
    );

    return res.json({
      token,
      user: sanitizeUser(user),
    });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      email: {
        live: emailConfigured(),
        mode: emailConfigured() ? "smtp" : "dev",
      },
    });
  });

  return app;
}