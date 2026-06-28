const fs = require("node:fs");
const path = require("node:path");

const compiled = path.join(__dirname, "dist", "src", "server.js");

if (!fs.existsSync(compiled)) {
  console.error("Build output not found. Run `npm run build` first.");
  process.exit(1);
}

require(compiled);
