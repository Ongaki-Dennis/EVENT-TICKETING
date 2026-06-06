import "dotenv/config";
import { createApp } from "./app";

const port = Number(process.env.PORT || 3000);
const app = createApp();

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Eventful running on http://localhost:${port}`);
  });
}

export default app;
