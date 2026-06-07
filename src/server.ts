import { createApp } from "./app";

const app = createApp();

// Local only
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT || 3000);

  app.listen(PORT, () => {
    console.log(`Local server running on http://localhost:${PORT}`);
  });
}

// Vercel uses this
export default app;