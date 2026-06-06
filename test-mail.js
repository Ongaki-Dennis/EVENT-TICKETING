import { sendMail } from "./src/utils/mail.js";
import "dotenv/config";

await sendMail(
  process.env.SMTP_USER,
  "Test Email",
  "SMTP is working"
);

console.log("Email sent");