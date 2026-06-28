import "dotenv/config";
import { createApp } from "./app";

const app = createApp();

// ONLY run locally
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT || 3000);

  app.listen(PORT, () => {
    console.log(`Local server running on http://localhost:${PORT}`);
  });
}

// IMPORTANT: export app for Vercel
export default app;
