require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const app = express();

/* =========================
   CONFIG
========================= */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");

const DATA_FILE = path.join(DATA_DIR, "restaurant-sessions.json");

/* =========================
   MIDDLEWARE
========================= */

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   DATA STORAGE (Vercel SAFE BUT TEMPORARY)
========================= */

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify({ sessions: [] }, null, 2),
      "utf8"
    );
  }
}

async function readStore() {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf8");

  try {
    return JSON.parse(content);
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(store) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

/* =========================
   SIMPLE LOCK
========================= */

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
   SESSION
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
    runtime: "vercel-ready"
  });
});

app.get("/api/chat/:deviceId", async (req, res) => {
  try {
    const deviceId = validateDeviceId(req.params.deviceId);

    const session = await withDataLock(async () => {
      const store = await readStore();
      const s = getOrCreateSession(store, deviceId);
      await writeStore(store);
      return s;
    });

    res.json({ session });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

/* =========================
   VERCEL ENTRY POINT
========================= */

module.exports = app;