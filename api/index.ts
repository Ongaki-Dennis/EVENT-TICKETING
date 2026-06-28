import "dotenv/config";
import serverless from "serverless-http";
import { createApp } from "../src/app";

// Create the Express app
const app = createApp();

// Export as Vercel serverless function
export default serverless(app);
