import express from "express";

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

export default app;