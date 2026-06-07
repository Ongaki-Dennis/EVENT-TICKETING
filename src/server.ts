import { createApp } from "./app";

const app = createApp();

/**
 * LOCAL ENVIRONMENT
 * Only start a server if we're NOT on Vercel
 */
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
  });
}

/**
 * VERCEL ENVIRONMENT
 * Export the app as default (serverless function entry)
 */
export default app;