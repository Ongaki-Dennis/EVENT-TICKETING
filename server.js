require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");

const app = express();

/* =========================
   CONFIG
========================= */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : null; // NOT USED ON VERCEL

/* =========================
   IN-MEMORY STORAGE (VERCEL SAFE)
========================= */

let store = {
  sessions: []
};

/* =========================
   MIDDLEWARE
========================= */

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   SIMPLE STORAGE HELPERS
========================= */

function readStore() {
  return store;
}

function writeStore() {
  return store;
}

/* simple async lock */
let dataLock = Promise.resolve();

function withDataLock(task) {
  const next = dataLock.then(task, task);
  dataLock = next.catch(() => {});
  return next;
}

/* =========================
   UTILS
========================= */

function sanitizeText(value, maxLength = 180) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function validateDeviceId(value) {
  const id = sanitizeText(value, 80);

  if (!/^[a-zA-Z0-9_-]{5,80}$/.test(id)) {
    const err = new Error("Invalid device id");
    err.statusCode = 400;
    throw err;
  }

  return id;
}

/* =========================
   SESSION LOGIC
========================= */

function createSession(deviceId) {
  const now = new Date().toISOString();

  return {
    deviceId,
    createdAt: now,
    updatedAt: now,
    messages: [],
    currentOrder: [],
    placedOrders: [],
    state: { mode: "menu" }
  };
}

function getOrCreateSession(store, deviceId) {
  let session = store.sessions.find(s => s.deviceId === deviceId);

  if (!session) {
    session = createSession(deviceId);
    store.sessions.push(session);
  }

  return session;
}

/* =========================
   ROUTES
========================= */

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "restaurant-chatbot",
    runtime: "vercel"
  });
});

app.get("/api/chat/:deviceId", async (req, res) => {
  try {
    const deviceId = validateDeviceId(req.params.deviceId);

    const session = await withDataLock(async () => {
      const storeRef = readStore();
      const s = getOrCreateSession(storeRef, deviceId);
      writeStore(storeRef);
      return s;
    });

    res.json({ session });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      message: err.message || "Server error"
    });
  }
});

/* =========================
   VERCEL EXPORT
========================= */

module.exports = app;