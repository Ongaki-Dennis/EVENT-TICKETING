const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.ONGAKI_PORT || process.env.PORT || 4010;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "control-plane.json");

const PRICE_BOOK = {
  cpuSeconds: 0.000011,
  memoryGbSeconds: 0.000003,
  bandwidthGb: 0.085,
  storageGbMonth: 0.023,
  apiRequests: 0.0000008,
  functionCalls: 0.0000002,
  dbReads: 0.00000012,
  dbWrites: 0.00000025,
  cdnGb: 0.045
};

const DEFAULT_USAGE = {
  cpuSeconds: 240000,
  memoryGbSeconds: 420000,
  bandwidthGb: 180,
  storageGbMonth: 12,
  apiRequests: 2200000,
  functionCalls: 1800000,
  dbReads: 7000000,
  dbWrites: 1400000,
  cdnGb: 80
};

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const now = new Date().toISOString();
    const tenantId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const deploymentId = crypto.randomUUID();

    writeDb({
      tenants: [
        {
          id: tenantId,
          name: "Demo Tenant",
          slug: "demo",
          region: "af-east-1",
          createdAt: now
        }
      ],
      projects: [
        {
          id: projectId,
          tenantId,
          name: "Demo API",
          slug: "demo-api",
          framework: "node",
          status: "ready",
          domain: "demo-api-demo.ongaki.local",
          createdAt: now
        }
      ],
      deployments: [
        {
          id: deploymentId,
          tenantId,
          projectId,
          status: "ready",
          source: "demo-upload.zip",
          image: "registry.ongaki.local/demo/demo-api:latest",
          logs: [
            "Queued deployment",
            "Detected Node.js project",
            "Built container image",
            "Created Knative service",
            "Deployment is ready"
          ],
          createdAt: now
        }
      ],
      usage: [
        {
          id: crypto.randomUUID(),
          tenantId,
          projectId,
          cycle: currentCycle(),
          ...DEFAULT_USAGE,
          createdAt: now
        }
      ],
      payments: [],
      invoices: []
    });
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`);
}

function currentCycle() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function requireText(value, field) {
  const clean = String(value || "").trim();
  if (!clean) {
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  return clean;
}

function calculateUsageCost(usage) {
  const lines = Object.entries(PRICE_BOOK).map(([key, price]) => {
    const quantity = Number(usage[key] || 0);
    const amount = roundMoney(quantity * price);
    return {
      dimension: key,
      quantity,
      unitPrice: price,
      amount
    };
  });

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const tax = roundMoney(subtotal * 0.16);

  return {
    currency: "USD",
    subtotal,
    tax,
    total: roundMoney(subtotal + tax),
    lines
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

function findActiveTenant(db) {
  return db.tenants[0] || null;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "ongaki-cloud-mvp",
    port: Number(PORT),
    runtime: "local"
  });
});

app.get("/api/overview", (req, res) => {
  const db = readDb();
  const tenant = findActiveTenant(db);
  const tenantUsage = tenant ? db.usage.filter((item) => item.tenantId === tenant.id) : [];
  const latestUsage = tenantUsage[tenantUsage.length - 1] || DEFAULT_USAGE;
  const billing = calculateUsageCost(latestUsage);

  res.json({
    tenant,
    counts: {
      tenants: db.tenants.length,
      projects: db.projects.length,
      deployments: db.deployments.length,
      payments: db.payments.length
    },
    billing,
    recentDeployments: db.deployments.slice(-5).reverse(),
    projects: db.projects
  });
});

app.get("/api/admin", (req, res) => {
  const db = readDb();
  const totalUsageCost = db.usage.reduce((sum, item) => sum + calculateUsageCost(item).total, 0);
  const paymentsTotal = db.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const readyDeployments = db.deployments.filter((deployment) => deployment.status === "ready").length;
  const activeProjects = db.projects.filter((project) => project.status === "ready").length;

  res.json({
    revenue: {
      billed: roundMoney(totalUsageCost),
      collected: roundMoney(paymentsTotal),
      outstanding: roundMoney(Math.max(totalUsageCost - paymentsTotal, 0))
    },
    cluster: {
      region: "af-east-1",
      nodes: 3,
      healthyNodes: 3,
      cpuAllocatedPercent: Math.min(82, 34 + db.deployments.length * 6),
      memoryAllocatedPercent: Math.min(88, 41 + db.projects.length * 5),
      queueDepth: Math.max(0, db.deployments.length - readyDeployments)
    },
    tenants: db.tenants,
    projects: db.projects,
    deployments: db.deployments.slice().reverse(),
    alerts: [
      {
        severity: "info",
        title: "Local runtime",
        message: "This MVP is running locally without Kubernetes or Knative."
      },
      {
        severity: activeProjects > 3 ? "warning" : "healthy",
        title: "Capacity",
        message: `${activeProjects} ready project${activeProjects === 1 ? "" : "s"} on the local control plane.`
      }
    ]
  });
});

app.get("/api/tenants", (req, res) => {
  res.json({ tenants: readDb().tenants });
});

app.post("/api/tenants", (req, res, next) => {
  try {
    const db = readDb();
    const name = requireText(req.body.name, "Tenant name");
    const slug = slugify(req.body.slug || name);

    if (!slug) {
      const error = new Error("Tenant slug is invalid");
      error.status = 400;
      throw error;
    }

    if (db.tenants.some((tenant) => tenant.slug === slug)) {
      const error = new Error("Tenant slug already exists");
      error.status = 409;
      throw error;
    }

    const tenant = {
      id: crypto.randomUUID(),
      name,
      slug,
      region: req.body.region || "af-east-1",
      createdAt: new Date().toISOString()
    };

    db.tenants.push(tenant);
    writeDb(db);
    res.status(201).json({ tenant });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", (req, res) => {
  res.json({ projects: readDb().projects });
});

app.post("/api/projects", (req, res, next) => {
  try {
    const db = readDb();
    const tenant = db.tenants.find((item) => item.id === req.body.tenantId) || findActiveTenant(db);

    if (!tenant) {
      const error = new Error("Create a tenant before creating a project");
      error.status = 400;
      throw error;
    }

    const name = requireText(req.body.name, "Project name");
    const slug = slugify(req.body.slug || name);
    const project = {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      name,
      slug,
      framework: req.body.framework || "auto",
      status: "created",
      domain: `${slug}-${tenant.slug}.ongaki.local`,
      createdAt: new Date().toISOString()
    };

    db.projects.push(project);
    writeDb(db);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deployments", (req, res, next) => {
  try {
    const db = readDb();
    const project = db.projects.find((item) => item.id === req.body.projectId) || db.projects[0];

    if (!project) {
      const error = new Error("Create a project before deploying");
      error.status = 400;
      throw error;
    }

    const now = new Date().toISOString();
    const source = req.body.source || `${project.slug}-upload.zip`;
    const deployment = {
      id: crypto.randomUUID(),
      tenantId: project.tenantId,
      projectId: project.id,
      status: "ready",
      source,
      image: `registry.ongaki.local/${project.tenantId}/${project.slug}:${Date.now()}`,
      logs: [
        "Queued deployment",
        `Received source ${source}`,
        `Detected framework ${project.framework}`,
        "Generated container image",
        "Provisioned local subdomain",
        "Started metering engine",
        "Deployment is ready"
      ],
      createdAt: now
    };

    project.status = "ready";
    db.deployments.push(deployment);
    db.usage.push({
      id: crypto.randomUUID(),
      tenantId: project.tenantId,
      projectId: project.id,
      cycle: currentCycle(),
      ...DEFAULT_USAGE,
      cpuSeconds: Math.round(DEFAULT_USAGE.cpuSeconds * (1 + db.deployments.length * 0.07)),
      apiRequests: Math.round(DEFAULT_USAGE.apiRequests * (1 + db.deployments.length * 0.05)),
      createdAt: now
    });

    writeDb(db);
    res.status(202).json({ deployment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/deployments", (req, res) => {
  res.json({ deployments: readDb().deployments.slice().reverse() });
});

app.get("/api/site/:slug", (req, res) => {
  const db = readDb();
  const project = db.projects.find((item) => item.slug === req.params.slug) || db.projects[0];

  if (!project) {
    res.status(404).json({ message: "Hosted app not found" });
    return;
  }

  const deployment = db.deployments
    .filter((item) => item.projectId === project.id)
    .slice(-1)[0];

  res.json({
    project,
    deployment,
    publicApp: {
      title: project.name,
      status: project.status === "ready" ? "Online" : "Preparing",
      headline: `${project.name} is live on Ongaki Cloud`,
      message: "This is the user-facing side your customers would visit after you deploy a website, API, or business app.",
      endpoint: `/site/${project.slug}`,
      updatedAt: deployment?.createdAt || project.createdAt
    }
  });
});

app.get("/api/billing", (req, res) => {
  const db = readDb();
  const tenant = findActiveTenant(db);
  const records = tenant ? db.usage.filter((item) => item.tenantId === tenant.id) : [];
  const usage = records[records.length - 1] || DEFAULT_USAGE;
  res.json({
    cycle: currentCycle(),
    usage,
    invoice: calculateUsageCost(usage)
  });
});

app.post("/api/payments", (req, res, next) => {
  try {
    const db = readDb();
    const tenant = findActiveTenant(db);

    if (!tenant) {
      const error = new Error("Create a tenant before recording payments");
      error.status = 400;
      throw error;
    }

    const amount = Number(req.body.amount || 0);
    if (amount <= 0) {
      const error = new Error("Payment amount must be greater than zero");
      error.status = 400;
      throw error;
    }

    const payment = {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      provider: req.body.provider || "wallet",
      status: "confirmed",
      amount,
      currency: req.body.currency || "USD",
      reference: `pay_${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    db.payments.push(payment);
    writeDb(db);
    res.status(201).json({ payment });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    message: error.message || "Server error"
  });
});

ensureDb();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ongaki Cloud MVP running on http://localhost:${PORT}`);
  });
}

module.exports = app;
