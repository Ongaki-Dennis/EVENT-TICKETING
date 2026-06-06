import fs from "node:fs";
import path from "node:path";
import { Database } from "./types";

const emptyDatabase = (): Database => ({
  users: [],
  events: [],
  tickets: [],
  payments: [],
  reminders: [],
  emailLogs: []
});

export class JsonStore {
  private db: Database | null = null;

  constructor(private readonly filePath = path.join(process.cwd(), process.env.DATA_DIR || "data", "eventful-db.json")) {}

  read(): Database {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const created = emptyDatabase();
      this.write(created);
      return created;
    }
    const loaded = { ...emptyDatabase(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) };
    this.db = loaded;
    return loaded;
  }

  write(db = this.read()): Database {
    this.db = db;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(db, null, 2));
    return db;
  }

  reset(db = emptyDatabase()): Database {
    this.db = db;
    return this.write(db);
  }
}
