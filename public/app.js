const DEVICE_KEY = "amsterdon-device-id";
const EMAIL_KEY = "amsterdon-payment-email";
const CURRENCY_KEY = "amsterdon-currency";

const state = {
  deviceId: "",
  session: null,
  paymentOrderId: ""
};

const messagesEl = document.querySelector("#messages");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const currentOrderEl = document.querySelector("#current-order");
const orderHistoryEl = document.querySelector("#order-history");
const paymentDialog = document.querySelector("#payment-dialog");
const paymentForm = document.querySelector("#payment-form");
const paymentSummary = document.querySelector("#payment-summary");
const paymentEmail = document.querySelector("#payment-email");
const cancelPayment = document.querySelector("#cancel-payment");
const paymentBanner = document.querySelector("#payment-banner");
const currencySelect = document.querySelector("#currency-select");

function getDeviceId() {
  const params = new URLSearchParams(window.location.search);
  const queryDeviceId = params.get("deviceId");

  if (queryDeviceId) {
    localStorage.setItem(DEVICE_KEY, queryDeviceId);
    return queryDeviceId;
  }

  const saved = localStorage.getItem(DEVICE_KEY);

  if (saved) {
    return saved;
  }

  const created = `device_${crypto.randomUUID().replaceAll("-", "")}`;
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

function selectedCurrency() {
  return state.session?.supportedCurrencies?.find((entry) => entry.code === state.session.currency);
}

function convertFromNgn(amount) {
  const currency = selectedCurrency();
  return Math.round(amount * (currency?.rateFromNgn || 1) * 100) / 100;
}

function formatMoney(amount) {
  const currency = selectedCurrency() || { code: "NGN", locale: "en-NG" };

  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    maximumFractionDigits: currency.code === "NGN" ? 0 : 2
  }).format(convertFromNgn(amount));
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function showPaymentBanner() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");

  if (!payment) {
    return;
  }

  paymentBanner.hidden = false;
  paymentBanner.className = `payment-banner ${payment === "success" ? "success" : "error"}`;
  paymentBanner.textContent =
    payment === "success"
      ? "Payment successful. Your chat has been updated."
      : "Payment was not completed. You can try again from your order history.";

  window.history.replaceState({}, "", window.location.pathname);
}

function createMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.sender}`;

  const text = document.createElement("p");
  text.textContent = message.text;

  const time = document.createElement("time");
  time.dateTime = message.createdAt;
  time.textContent = formatDate(message.createdAt);

  article.append(text, time);

  if (message.sender === "bot" && message.orderId && message.paymentStatus !== "paid") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pay-button";
    button.textContent = "Pay with Paystack";
    button.addEventListener("click", () => openPaymentDialog(message.orderId));
    article.append(button);
  }

  return article;
}

function renderMessages() {
  messagesEl.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const message of state.session.messages) {
    fragment.append(createMessage(message));
  }
  messagesEl.append(fragment);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderCurrencySelect() {
  currencySelect.replaceChildren();

  for (const currency of state.session.supportedCurrencies || []) {
    const option = document.createElement("option");
    option.value = currency.code;
    option.textContent = `${currency.country} (${currency.code})`;
    currencySelect.append(option);
  }

  currencySelect.value = state.session.currency;
  localStorage.setItem(CURRENCY_KEY, state.session.currency);
}

function emptyState(text) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = text;
  return div;
}

function renderCurrentOrder() {
  currentOrderEl.replaceChildren();
  const order = state.session.currentOrder;

  if (!order.length) {
    currentOrderEl.append(emptyState("No active order."));
    return;
  }

  for (const item of order) {
    const row = document.createElement("article");
    row.className = "order-row";
    row.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <b></b>
    `;
    row.querySelector("strong").textContent = item.name;
    row.querySelector("span").textContent = item.scheduledFor
      ? `${item.optionLabel} - scheduled ${formatDate(item.scheduledFor)}`
      : item.optionLabel;
    row.querySelector("b").textContent = formatMoney(item.price);
    currentOrderEl.append(row);
  }

  const total = document.createElement("div");
  total.className = "order-total";
  total.innerHTML = `<span>Total</span><strong>${formatMoney(state.session.totals.currentOrder)}</strong>`;
  currentOrderEl.append(total);
}

function renderHistory() {
  orderHistoryEl.replaceChildren();
  const orders = state.session.placedOrders;

  if (!orders.length) {
    orderHistoryEl.append(emptyState("Placed orders will appear here."));
    return;
  }

  for (const order of orders.slice().reverse()) {
    const card = document.createElement("article");
    card.className = "history-card";

    const items = order.items
      .map((item) => `<li>${item.name} ${item.optionLabel}</li>`)
      .join("");
    card.innerHTML = `
      <div class="history-top">
        <strong></strong>
        <span class="payment-status"></span>
      </div>
      <ul>${items}</ul>
      <div class="history-bottom">
        <b></b>
      </div>
    `;
    card.querySelector("strong").textContent = order.code;
    card.querySelector(".payment-status").textContent = order.paymentStatus;
    card.querySelector("b").textContent = formatMoney(order.total);

    if (order.paymentStatus !== "paid") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pay-button compact";
      button.textContent = "Pay";
      button.addEventListener("click", () => openPaymentDialog(order.id));
      card.querySelector(".history-bottom").append(button);
    }

    orderHistoryEl.append(card);
  }
}

function render() {
  if (!state.session) {
    return;
  }

  renderMessages();
  renderCurrencySelect();
  renderCurrentOrder();
  renderHistory();
}

async function loadChat() {
  const data = await request(`/api/chat/${encodeURIComponent(state.deviceId)}`);
  state.session = data.session;

  const savedCurrency = localStorage.getItem(CURRENCY_KEY);
  if (
    savedCurrency &&
    savedCurrency !== state.session.currency &&
    state.session.supportedCurrencies.some((entry) => entry.code === savedCurrency)
  ) {
    await updateCurrency(savedCurrency);
    return;
  }

  render();
}

async function sendMessage(event) {
  event.preventDefault();
  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  messageInput.disabled = true;

  try {
    const data = await request(`/api/chat/${encodeURIComponent(state.deviceId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    state.session = data.session;
    chatForm.reset();
    render();
  } catch (error) {
    addTemporaryBotError(error.message);
  } finally {
    messageInput.disabled = false;
    messageInput.focus();
  }
}

function addTemporaryBotError(message) {
  const article = document.createElement("article");
  article.className = "message bot error";
  article.textContent = message;
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function openPaymentDialog(orderId) {
  const order = state.session.placedOrders.find((entry) => entry.id === orderId);

  if (!order) {
    return;
  }

  state.paymentOrderId = orderId;
  paymentSummary.textContent = `${order.code} - ${formatMoney(order.total)}`;
  paymentEmail.value = localStorage.getItem(EMAIL_KEY) || "";
  paymentDialog.showModal();
}

async function initializePayment(event) {
  event.preventDefault();

  try {
    localStorage.setItem(EMAIL_KEY, paymentEmail.value.trim());
    const data = await request("/api/payments/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: state.deviceId,
        orderId: state.paymentOrderId,
        email: paymentEmail.value,
        currency: state.session.currency
      })
    });
    window.location.href = data.authorizationUrl;
  } catch (error) {
    paymentSummary.textContent = error.message;
  }
}

async function updateCurrency(currency) {
  const data = await request(`/api/chat/${encodeURIComponent(state.deviceId)}/currency`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency })
  });
  state.session = data.session;
  render();
}

chatForm.addEventListener("submit", sendMessage);
paymentForm.addEventListener("submit", initializePayment);
cancelPayment.addEventListener("click", () => paymentDialog.close());
currencySelect.addEventListener("change", () => {
  updateCurrency(currencySelect.value).catch((error) => addTemporaryBotError(error.message));
});

state.deviceId = getDeviceId();
showPaymentBanner();
loadChat().catch((error) => addTemporaryBotError(error.message));
