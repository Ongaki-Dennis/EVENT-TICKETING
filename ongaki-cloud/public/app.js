const state = {
  overview: null,
  admin: null,
  site: null
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const number = new Intl.NumberFormat("en-US");

document.getElementById("refreshButton").addEventListener("click", loadCurrentView);
loadCurrentView();

async function loadCurrentView() {
  const mode = getMode();

  if (mode === "admin") {
    await loadAdmin();
    return;
  }

  if (mode === "site") {
    await loadSite();
    return;
  }

  await loadClient();
}

function getMode() {
  if (location.pathname.startsWith("/admin")) {
    return "admin";
  }

  if (location.pathname.startsWith("/site")) {
    return "site";
  }

  return "client";
}

async function loadClient() {
  const response = await fetch("/api/overview");
  state.overview = await response.json();
  renderClient();
}

async function loadAdmin() {
  const response = await fetch("/api/admin");
  state.admin = await response.json();
  renderAdmin();
}

async function loadSite() {
  const slug = location.pathname.split("/").filter(Boolean)[1] || "demo-api";
  const response = await fetch(`/api/site/${slug}`);
  state.site = await response.json();
  renderSite();
}

function setHeader(sideLabel, eyebrow, title) {
  document.getElementById("sideLabel").textContent = sideLabel;
  document.getElementById("modeEyebrow").textContent = eyebrow;
  document.getElementById("pageTitle").textContent = title;
}

function renderClient() {
  const { counts, billing, projects, recentDeployments } = state.overview;
  setHeader("Client dashboard", "Client side", "Manage projects, deployments, usage, and payments");

  document.getElementById("view").innerHTML = `
    <section class="metrics-grid" aria-label="Client overview">
      ${metricCard("Tenants", counts.tenants)}
      ${metricCard("Projects", counts.projects)}
      ${metricCard("Deployments", counts.deployments)}
      ${metricCard("Current bill", money.format(billing.total))}
    </section>

    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Projects</p>
            <h2>Create a project</h2>
          </div>
        </div>
        <form id="projectForm" class="form-grid">
          <label>
            Project name
            <input name="name" placeholder="Customer Portal" required>
          </label>
          <label>
            Framework
            <select name="framework">
              <option value="auto">Auto detect</option>
              <option value="static">Static site</option>
              <option value="node">Node API</option>
              <option value="next">Next.js</option>
              <option value="worker">Serverless function</option>
            </select>
          </label>
          <button type="submit">Create project</button>
        </form>
        <div class="list">${renderProjects(projects)}</div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Deployments</p>
            <h2>Deploy a project</h2>
          </div>
        </div>
        <form id="deploymentForm" class="form-grid">
          <label>
            Project
            <select name="projectId">${renderProjectOptions(projects)}</select>
          </label>
          <label>
            Source bundle
            <input name="source" placeholder="site-upload.zip">
          </label>
          <button type="submit">Deploy</button>
        </form>
        <div class="list">${renderDeployments(recentDeployments)}</div>
      </div>
    </section>

    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Billing</p>
            <h2>Usage invoice</h2>
          </div>
        </div>
        ${renderBilling(billing)}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Payments</p>
            <h2>Record top-up</h2>
          </div>
        </div>
        <form id="paymentForm" class="form-grid">
          <label>
            Provider
            <select name="provider">
              <option value="mpesa">M-Pesa</option>
              <option value="stripe">Stripe</option>
              <option value="bitcoin">Bitcoin</option>
              <option value="ethereum">Ethereum</option>
              <option value="usdt">USDT</option>
              <option value="wallet">Internal wallet</option>
            </select>
          </label>
          <label>
            Amount
            <input name="amount" type="number" min="1" step="0.01" value="25" required>
          </label>
          <button type="submit">Add payment</button>
        </form>
        <p id="statusMessage" class="status"></p>
      </div>
    </section>
  `;

  document.getElementById("projectForm").addEventListener("submit", createProject);
  document.getElementById("deploymentForm").addEventListener("submit", createDeployment);
  document.getElementById("paymentForm").addEventListener("submit", createPayment);
}

function renderAdmin() {
  const { revenue, cluster, tenants, projects, deployments, alerts } = state.admin;
  setHeader("Backend control plane", "Backend side", "Operate tenants, infrastructure, billing, and deployments");

  document.getElementById("view").innerHTML = `
    <section class="metrics-grid" aria-label="Admin overview">
      ${metricCard("Billed revenue", money.format(revenue.billed))}
      ${metricCard("Collected", money.format(revenue.collected))}
      ${metricCard("Outstanding", money.format(revenue.outstanding))}
      ${metricCard("Healthy nodes", `${cluster.healthyNodes}/${cluster.nodes}`)}
    </section>

    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Cluster</p>
            <h2>${escapeHtml(cluster.region)}</h2>
          </div>
        </div>
        <div class="ops-grid">
          ${opsItem("CPU allocated", `${cluster.cpuAllocatedPercent}%`)}
          ${opsItem("Memory allocated", `${cluster.memoryAllocatedPercent}%`)}
          ${opsItem("Build queue", cluster.queueDepth)}
          ${opsItem("Tenant count", tenants.length)}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Alerts</p>
            <h2>Platform signals</h2>
          </div>
        </div>
        <div class="list">
          ${alerts
            .map((alert) => `
              <article class="list-item">
                <strong>${escapeHtml(alert.title)}</strong>
                <div class="meta">
                  <span class="pill ${alert.severity}">${escapeHtml(alert.severity)}</span>
                  <span>${escapeHtml(alert.message)}</span>
                </div>
              </article>
            `)
            .join("")}
        </div>
      </div>
    </section>

    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Tenants</p>
            <h2>Customer accounts</h2>
          </div>
        </div>
        <div class="table">
          <div class="row header"><span>Name</span><span>Region</span><span>Slug</span></div>
          ${tenants
            .map((tenant) => `<div class="row"><span>${escapeHtml(tenant.name)}</span><span>${escapeHtml(tenant.region)}</span><span>${escapeHtml(tenant.slug)}</span></div>`)
            .join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Runtime</p>
            <h2>Active deployments</h2>
          </div>
        </div>
        <div class="list">${renderDeployments(deployments.slice(0, 4))}</div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Projects</p>
          <h2>Hosted workloads</h2>
        </div>
      </div>
      <div class="list">${renderProjects(projects)}</div>
    </section>
  `;
}

function renderSite() {
  const { project, deployment, publicApp } = state.site;
  setHeader("User-facing app", "Users side", publicApp.title);

  document.getElementById("view").innerHTML = `
    <section class="public-shell">
      <div class="public-hero">
        <p class="eyebrow">${escapeHtml(publicApp.status)}</p>
        <h2>${escapeHtml(publicApp.headline)}</h2>
        <p>${escapeHtml(publicApp.message)}</p>
        <div class="public-actions">
          <a class="button-link" href="/client">Owner dashboard</a>
          <a class="button-link secondary" href="/admin">Admin backend</a>
        </div>
      </div>
      <div class="public-panel">
        <span>Hosted project</span>
        <strong>${escapeHtml(project.name)}</strong>
        <span>Public path</span>
        <strong>${escapeHtml(publicApp.endpoint)}</strong>
        <span>Last deployment</span>
        <strong>${deployment ? new Date(deployment.createdAt).toLocaleString() : "Not deployed yet"}</strong>
      </div>
    </section>

    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Customer experience</p>
            <h2>Example product page</h2>
          </div>
        </div>
        <div class="product-grid">
          ${["Dashboard", "API", "Database"].map((item) => `<article><strong>${item}</strong><span>Served from Ongaki Cloud runtime</span></article>`).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Runtime status</p>
            <h2>${escapeHtml(project.domain)}</h2>
          </div>
        </div>
        <pre class="logs">${deployment ? deployment.logs.map(escapeHtml).join("\n") : "Waiting for first deployment"}</pre>
      </div>
    </section>
  `;
}

function metricCard(label, value) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function opsItem(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderProjects(projects) {
  if (!projects.length) {
    return `<p class="status">No projects yet.</p>`;
  }

  return projects
    .map((project) => `
      <article class="list-item">
        <strong>${escapeHtml(project.name)}</strong>
        <div class="meta">
          <span class="pill">${escapeHtml(project.status)}</span>
          <span>${escapeHtml(project.framework)}</span>
          <a href="/site/${escapeHtml(project.slug)}">${escapeHtml(project.domain)}</a>
        </div>
      </article>
    `)
    .join("");
}

function renderProjectOptions(projects) {
  return projects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
    .join("");
}

function renderDeployments(deployments) {
  if (!deployments.length) {
    return `<p class="status">No deployments yet.</p>`;
  }

  return deployments
    .map((deployment) => `
      <article class="list-item">
        <strong>${escapeHtml(deployment.source)}</strong>
        <div class="meta">
          <span class="pill">${escapeHtml(deployment.status)}</span>
          <span>${new Date(deployment.createdAt).toLocaleString()}</span>
        </div>
        <pre class="logs">${deployment.logs.map(escapeHtml).join("\n")}</pre>
      </article>
    `)
    .join("");
}

function renderBilling(billing) {
  return `
    <div class="billing-summary">
      <div><span>Subtotal</span><strong>${money.format(billing.subtotal)}</strong></div>
      <div><span>Tax</span><strong>${money.format(billing.tax)}</strong></div>
      <div><span>Total</span><strong>${money.format(billing.total)}</strong></div>
    </div>
    <div class="table">
      <div class="row header">
        <span>Dimension</span>
        <span>Quantity</span>
        <span>Amount</span>
      </div>
      ${billing.lines
        .map((line) => `
          <div class="row">
            <span>${formatDimension(line.dimension)}</span>
            <span>${number.format(line.quantity)}</span>
            <span>${money.format(line.amount)}</span>
          </div>
        `)
        .join("")}
    </div>
  `;
}

async function createProject(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  await apiPost("/api/projects", {
    name: form.get("name"),
    framework: form.get("framework")
  });

  event.currentTarget.reset();
  setStatus("Project created.");
  await loadClient();
}

async function createDeployment(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  await apiPost("/api/deployments", {
    projectId: form.get("projectId"),
    source: form.get("source") || "site-upload.zip"
  });

  event.currentTarget.reset();
  setStatus("Deployment finished and usage was metered.");
  await loadClient();
}

async function createPayment(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  await apiPost("/api/payments", {
    provider: form.get("provider"),
    amount: Number(form.get("amount")),
    currency: "USD"
  });

  setStatus("Payment recorded.");
  await loadClient();
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Request failed");
  }

  return response.json();
}

function setStatus(message) {
  const target = document.getElementById("statusMessage");
  if (target) {
    target.textContent = message;
  }
}

function formatDimension(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
