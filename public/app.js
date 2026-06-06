const state = {
  token: localStorage.getItem("eventful-token"),
  user: JSON.parse(localStorage.getItem("eventful-user") || "null"),
  events: [],
  tickets: [],
  creatorEvents: [],
  attendees: [],
  currencies: [],
  filter: "",
  config: null,
  authMode: "login"
};

const authForm = document.querySelector("#auth-form");
const eventForm = document.querySelector("#event-form");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const sessionLabel = document.querySelector("#session-label");
const eventsList = document.querySelector("#events-list");
const ticketsList = document.querySelector("#tickets-list");
const analyticsPanel = document.querySelector("#analytics-panel");
const verifyForm = document.querySelector("#verify-form");
const verifyResult = document.querySelector("#verify-result");
const shareSheet = document.querySelector("#share-sheet");
const shareTitle = document.querySelector("#share-title");
const shareText = document.querySelector("#share-text");
const shareActions = document.querySelector("#share-actions");
const shareClose = document.querySelector("#share-close");
const toast = document.querySelector("#toast");
const roleButtons = document.querySelectorAll("[data-role-choice]");
const currencySelect = document.querySelector("#currency-select");
const currencyNote = document.querySelector("#currency-note");
const eventSearch = document.querySelector("#event-search");
const systemStatus = document.querySelector("#system-status");
const outboxPanel = document.querySelector("#outbox-panel");
const demoButtons = document.querySelectorAll("[data-demo-login]");
const authModeButtons = document.querySelectorAll("[data-auth-mode]");
const nameField = document.querySelector("[data-name-field]");
const authSubmit = document.querySelector("#auth-submit");

const now = new Date();
eventForm.startsAt.value = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
eventForm.endsAt.value = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || "KES"} ${Number(amount || 0).toLocaleString()}`;
  }
}

function notify(message, tone = "success") {
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.dataset.show = "true";
  setTimeout(() => delete toast.dataset.show, 3200);
}

function setBusy(element, busy) {
  element.toggleAttribute("aria-busy", busy);
  element.querySelectorAll("button, input, textarea, select").forEach((control) => {
    if (!control.classList.contains("ghost")) control.disabled = busy;
  });
}

function saveSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("eventful-token", data.token);
  localStorage.setItem("eventful-user", JSON.stringify(data.user));
  renderSession();
}

function renderSession() {
  sessionLabel.textContent = state.user ? `${state.user.name} signed in as ${state.user.role}` : "Not signed in";
  document.body.dataset.role = state.user?.role || "guest";
  verifyForm.hidden = state.user?.role !== "creator";
}

function renderAuthMode() {
  authModeButtons.forEach((button) => button.classList.toggle("active", button.dataset.authMode === state.authMode));
  nameField.hidden = state.authMode === "login";
  authSubmit.textContent = state.authMode === "login" ? "Login" : "Create account";
}

function renderConfig() {
  if (!state.config) return;
  systemStatus.innerHTML = `
    <span data-live="${state.config.paystack.live}"><b>Paystack</b>${state.config.paystack.live ? "Secret key active" : "Local simulation - add PAYSTACK_SECRET_KEY"}${state.config.paystack.publicKeyConfigured ? " | public key set" : " | add PAYSTACK_PUBLIC_KEY"}</span>
    <span data-live="${state.config.email.live}"><b>Email</b>${state.config.email.live ? "SMTP active" : "Dev outbox - add SMTP settings"}</span>
  `;
}

function renderCurrencyOptions() {
  currencySelect.innerHTML = state.currencies.map((currency) => `
    <option value="${currency.code}" ${currency.code === "KES" ? "selected" : ""}>
      ${currency.code} - ${currency.name}${currency.paystack ? "" : " (display only)"}
    </option>
  `).join("");
  renderCurrencyNote();
}

function renderCurrencyNote() {
  const currency = state.currencies.find((item) => item.code === currencySelect.value);
  currencyNote.textContent = currency?.paystack
    ? `${currency.code} can initialize Paystack checkout.`
    : `${currency?.code || "This currency"} is available for East Africa event display, but Paystack checkout currently needs KES or USD here.`;
  currencyNote.dataset.supported = String(Boolean(currency?.paystack));
}

function filteredEvents() {
  const query = state.filter.trim().toLowerCase();
  if (!query) return state.events;
  return state.events.filter((event) => [event.title, event.description, event.category, event.venue, event.currency].join(" ").toLowerCase().includes(query));
}

function eventCard(event) {
  const date = new Date(event.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const paystackReady = ["KES", "USD", "NGN", "GHS", "ZAR", "XOF"].includes(event.currency);
  const canPay = paystackReady && state.user?.role === "eventee";
  const payLabel = !paystackReady ? "Unsupported currency" : state.user?.role === "eventee" ? "Pay with Paystack" : "Eventee login required";
  return `
    <article class="event-card">
      <div class="event-media">
        <span>${event.category.slice(0, 1).toUpperCase()}</span>
      </div>
      <div class="event-body">
        <div class="event-topline">
          <span>${event.category}</span>
          <b>${date}</b>
        </div>
        <h3>${event.title}</h3>
        <p>${event.description}</p>
        <dl>
          <div><dt>Venue</dt><dd>${event.venue}</dd></div>
          <div><dt>Ticket</dt><dd>${money(event.price, event.currency)}</dd></div>
          <div><dt>Capacity</dt><dd>${event.capacity}</dd></div>
        </dl>
        <div class="button-row">
          <button data-attend="${event.id}" ${canPay ? "" : "disabled"}>${payLabel}</button>
          <button class="secondary" data-share="${event.id}">Share</button>
        </div>
      </div>
    </article>
  `;
}

function renderEvents() {
  const events = filteredEvents();
  eventsList.innerHTML = events.length ? events.map(eventCard).join("") : '<div class="empty">No events match this view yet.</div>';
  document.querySelector("#event-count").textContent = state.events.length;
}

async function loadEvents() {
  const data = await api("/api/events");
  state.events = data.events;
  renderEvents();
}

async function loadTickets() {
  if (!state.token || state.user?.role !== "eventee") {
    ticketsList.innerHTML = '<div class="empty">Sign in as an eventee to see tickets and QR passes.</div>';
    document.querySelector("#ticket-count").textContent = "0";
    document.querySelector("#scan-count").textContent = "0";
    return;
  }
  const data = await api("/api/tickets/me");
  state.tickets = data.tickets;
  document.querySelector("#ticket-count").textContent = data.tickets.length;
  document.querySelector("#scan-count").textContent = data.tickets.filter((ticket) => ticket.status === "checked_in").length;
  ticketsList.innerHTML = data.tickets.length
    ? data.tickets.map((ticket) => `
      <article class="ticket-card">
        <div>
          <span>${ticket.status.replace("_", " ")}</span>
          <b>${ticket.quantity} ticket${ticket.quantity > 1 ? "s" : ""}</b>
        </div>
        ${
          ticket.qrCodeDataUrl
            ? `<div class="qr-pass"><img src="${ticket.qrCodeDataUrl}" alt="Ticket QR code" /><button class="secondary" data-copy-qr="${ticket.id}">Copy QR payload</button></div>`
            : "<small>Payment pending. QR unlocks after Paystack confirms the transaction.</small>"
        }
      </article>`).join("")
    : '<div class="empty">No tickets yet. Buy a ticket from an event card.</div>';
}

async function loadOutbox() {
  if (!state.token) {
    outboxPanel.innerHTML = "";
    return;
  }
  const data = await api("/api/notifications/outbox");
  outboxPanel.innerHTML = data.emailLogs.length
    ? `<article class="mini-card outbox"><b>Email activity</b>${data.emailLogs.slice(-5).reverse().map((email) => `<span>${email.status} via ${email.provider}: ${email.subject} to ${email.to}</span>`).join("")}</article>`
    : "";
}

async function loadCreatorWorkspace() {
  if (!state.token || state.user?.role !== "creator") {
    state.creatorEvents = [];
    state.attendees = [];
    return null;
  }
  const data = await api("/api/events/mine");
  state.creatorEvents = data.events;
  state.attendees = data.attendees;
  return data;
}

async function loadAnalytics() {
  if (!state.token || state.user?.role !== "creator") {
    analyticsPanel.innerHTML = '<div class="empty">Sign in as a creator to see revenue and check-in analytics.</div>';
    return;
  }
  const [data, workspace] = await Promise.all([api("/api/analytics/creator"), loadCreatorWorkspace()]);
  const attendees = workspace?.attendees || [];
  analyticsPanel.innerHTML = `
    <article class="metric-grid">
      <span><b>${data.lifetime.attendees}</b> attendees</span>
      <span><b>${data.lifetime.ticketsBought}</b> tickets</span>
      <span><b>${data.lifetime.checkedIn}</b> scanned</span>
      <span><b>${data.lifetime.revenue.toLocaleString()}</b> revenue</span>
    </article>
    ${data.events.map((event) => `<article class="mini-card"><b>${event.title}</b><span>${event.ticketsBought} sold | ${event.checkedIn} scanned | ${event.revenue.toLocaleString()} revenue</span></article>`).join("")}
    <article class="mini-card attendee-list">
      <b>Applications and attendees</b>
      ${
        attendees.length
          ? attendees.map((attendee) => `
              <span>
                ${attendee.eventee?.name || "Unknown eventee"} applied for ${attendee.eventTitle}
                | ${attendee.quantity} ticket${attendee.quantity > 1 ? "s" : ""}
                | ${attendee.payment?.status || attendee.ticketStatus}
              </span>
            `).join("")
          : "<span>No eventees have applied yet.</span>"
      }
    </article>
  `;
}

async function loadCurrencies() {
  const data = await api("/api/currencies");
  state.currencies = data.eastAfrica;
  renderCurrencyOptions();
}

async function loadConfig() {
  state.config = await api("/api/config");
  renderConfig();
}

async function refresh() {
  await Promise.all([loadEvents(), loadTickets(), loadAnalytics(), loadOutbox()]);
}

async function handlePayment(eventId, button) {
  button.disabled = true;
  button.textContent = "Starting checkout";
  const data = await api(`/api/events/${eventId}/attend`, { method: "POST", body: JSON.stringify({ quantity: 1 }) });
  if (data.checkout?.simulated) {
    await api(`/api/payments/${data.payment.reference}/confirm`, { method: "POST", body: "{}" });
    notify("Local payment simulated. QR ticket generated.");
    await refresh();
    return;
  }
  notify("Redirecting to Paystack checkout...");
  window.location.href = data.checkout.authorizationUrl;
}

async function openShareSheet(eventId) {
  const data = await api(`/api/share/${eventId}`);
  shareTitle.textContent = data.title;
  shareText.textContent = data.text;
  shareActions.innerHTML = `
    <button type="button" data-native-share>Native share</button>
    <button type="button" class="secondary" data-copy-share="${data.url}">Copy link</button>
    ${Object.entries(data.links).map(([name, href]) => `<a href="${href}" target="_blank" rel="noopener">${name}</a>`).join("")}
  `;
  shareSheet.hidden = false;
  shareSheet.dataset.url = data.url;
  shareSheet.dataset.title = data.title;
  shareSheet.dataset.text = data.text;
}

roleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    roleButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    authForm.role.value = button.dataset.roleChoice;
    authForm.name.value = button.dataset.roleChoice === "creator" ? "Amina Creator" : "Brian Eventee";
    authForm.email.value = button.dataset.roleChoice === "creator" ? "creator@eventful.test" : "eventee@eventful.test";
  });
});

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    renderAuthMode();
  });
});

demoButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    setBusy(authForm, true);
    try {
      const data = await api("/api/auth/demo", { method: "POST", body: JSON.stringify({ role: button.dataset.demoLogin }) });
      saveSession(data);
      notify(`${data.user.role} demo login ready`);
      await refresh();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(authForm, false);
    }
  });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(authForm, true);
  try {
    const body = Object.fromEntries(new FormData(authForm));
    const data = state.authMode === "login"
      ? await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: body.email, password: body.password }) })
      : await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
    saveSession(data);
    notify(state.authMode === "login" ? "Signed in" : "Account created");
    await refresh();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setBusy(authForm, false);
  }
});

loginButton.addEventListener("click", async () => {
  setBusy(authForm, true);
  try {
    const body = Object.fromEntries(new FormData(authForm));
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: body.email, password: body.password }) });
    saveSession(data);
    notify("Signed in");
    await refresh();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setBusy(authForm, false);
  }
});

logoutButton.addEventListener("click", async () => {
  state.token = null;
  state.user = null;
  localStorage.removeItem("eventful-token");
  localStorage.removeItem("eventful-user");
  renderSession();
  notify("Signed out");
  await refresh();
});

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(eventForm, true);
  try {
    const body = Object.fromEntries(new FormData(eventForm));
    body.reminderOptions = [{ offsetMinutes: Number(body.reminderMinutes), channel: "email", label: `${body.reminderMinutes} minutes before` }];
    const data = await api("/api/events", { method: "POST", body: JSON.stringify(body) });
    state.events = [data.event, ...state.events];
    renderEvents();
    notify(`${data.event.title} published`);
    await loadAnalytics();
    await openShareSheet(data.event.id);
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setBusy(eventForm, false);
  }
});

eventsList.addEventListener("click", async (event) => {
  const attendId = event.target.dataset.attend;
  const shareId = event.target.dataset.share;
  if (attendId) {
    try {
      await handlePayment(attendId, event.target);
    } catch (error) {
      event.target.disabled = false;
      event.target.textContent = "Pay with Paystack";
      notify(error.message, "error");
    }
  }
  if (shareId) {
    try {
      await openShareSheet(shareId);
    } catch (error) {
      notify(error.message, "error");
    }
  }
});

shareClose.addEventListener("click", () => {
  shareSheet.hidden = true;
});

shareSheet.addEventListener("click", async (event) => {
  if (event.target === shareSheet) {
    shareSheet.hidden = true;
    return;
  }
  const copyUrl = event.target.dataset.copyShare;
  if (copyUrl) {
    await navigator.clipboard?.writeText(copyUrl);
    notify("Share link copied");
  }
  if (event.target.dataset.nativeShare !== undefined) {
    if (navigator.share) {
      await navigator.share({
        title: shareSheet.dataset.title,
        text: shareSheet.dataset.text,
        url: shareSheet.dataset.url
      });
      notify("Share sheet opened");
    } else {
      await navigator.clipboard?.writeText(shareSheet.dataset.url || "");
      notify("Native share is unavailable, link copied instead");
    }
  }
});

ticketsList.addEventListener("click", async (event) => {
  const ticketId = event.target.dataset.copyQr;
  if (!ticketId) return;
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket?.qrPayload) return;
  await navigator.clipboard?.writeText(ticket.qrPayload);
  notify("QR payload copied");
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(verifyForm, true);
  try {
    const body = Object.fromEntries(new FormData(verifyForm));
    const data = await api("/api/tickets/verify", { method: "POST", body: JSON.stringify(body) });
    verifyResult.textContent = data.valid ? "Ticket verified. Eventee can access this event." : data.message;
    verifyResult.dataset.supported = String(Boolean(data.valid));
    notify("Ticket verified");
    await loadAnalytics();
  } catch (error) {
    verifyResult.textContent = error.message;
    verifyResult.dataset.supported = "false";
    notify(error.message, "error");
  } finally {
    setBusy(verifyForm, false);
  }
});

eventSearch.addEventListener("input", () => {
  state.filter = eventSearch.value;
  renderEvents();
});

currencySelect.addEventListener("change", renderCurrencyNote);

const params = new URLSearchParams(window.location.search);
if (params.get("status") === "paid") notify("Payment confirmed. Your QR ticket is ready.");

renderSession();
renderAuthMode();
loadCurrencies()
  .then(loadConfig)
  .then(refresh)
  .catch((error) => notify(error.message, "error"));
