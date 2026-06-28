import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./security";
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
    if (this.db) {
      const seeded = seedDemoUsers(this.db);
      if (seeded.changed) {
        this.write(seeded.db);
      }
      return seeded.db;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const created = seedDemoUsers(emptyDatabase()).db;
      this.write(created);
      return created;
    }
    const seeded = seedDemoUsers({ ...emptyDatabase(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) });
    this.db = seeded.db;
    if (seeded.changed) {
      this.write(seeded.db);
    }
    return seeded.db;
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

function seedDemoUsers(db: Database): { db: Database; changed: boolean } {
  const demoUsers = [
    {
      name: "Amina Creator",
      email: "creator@eventful.test",
      role: "creator" as const
    },
    {
      name: "Brian Eventee",
      email: "eventee@eventful.test",
      role: "eventee" as const
    }
  ];

  let changed = false;
  for (const demo of demoUsers) {
    if (!db.users.some((user) => user.email === demo.email)) {
      db.users.push({
        id: crypto.randomUUID(),
        name: demo.name,
        email: demo.email,
        role: demo.role,
        passwordHash: hashPassword("password123"),
        createdAt: new Date().toISOString()
      });
      changed = true;
    }
  }

  return { db, changed };
}
