require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "restaurant-sessions.json");
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const DEFAULT_CURRENCY = process.env.PAYSTACK_CURRENCY || "NGN";
const MPESA_TILL_NUMBER = process.env.MPESA_TILL_NUMBER || "5797579";
const AIRTEL_MONEY_NUMBER = process.env.AIRTEL_MONEY_NUMBER || "Set your Airtel merchant number";
const CRYPTO_WALLET_ADDRESS =
  process.env.CRYPTO_WALLET_ADDRESS || "Set your crypto wallet address in .env";

let dataLock = Promise.resolve();

const menu = [
  {
    id: "jollof",
    name: "Smoky Jollof Rice",
    description: "Party-style rice with fried plantain and slaw.",
    options: [
      { id: "chicken", label: "with grilled chicken", price: 4500 },
      { id: "beef", label: "with peppered beef", price: 5200 },
      { id: "veggie", label: "vegetarian bowl", price: 3800 }
    ]
  },
  {
    id: "suya",
    name: "Suya Wrap",
    description: "Spiced beef, onions, tomato, cabbage, and suya mayo.",
    options: [
      { id: "regular", label: "regular", price: 3200 },
      { id: "double", label: "double beef", price: 4500 },
      { id: "chicken", label: "chicken suya", price: 3600 }
    ]
  },
  {
    id: "egusi",
    name: "Egusi Soup Combo",
    description: "Egusi soup served with your swallow of choice.",
    options: [
      { id: "eba", label: "with eba", price: 4800 },
      { id: "pounded-yam", label: "with pounded yam", price: 5600 },
      { id: "semo", label: "with semo", price: 5000 }
    ]
  },
  {
    id: "fish",
    name: "Grilled Tilapia",
    description: "Whole tilapia with chips, pepper sauce, and salad.",
    options: [
      { id: "half", label: "half fish plate", price: 6500 },
      { id: "full", label: "full fish plate", price: 9800 }
    ]
  },
  {
    id: "zobo",
    name: "Zobo Cooler",
    description: "Chilled hibiscus drink with ginger and citrus.",
    options: [
      { id: "small", label: "350ml cup", price: 900 },
      { id: "large", label: "750ml bottle", price: 1600 }
    ]
  }
];

const supportedCurrencies = [
  { code: "NGN", country: "Nigeria", locale: "en-NG", rateFromNgn: 1 },
  { code: "GHS", country: "Ghana", locale: "en-GH", rateFromNgn: 0.0094 },
  { code: "KES", country: "Kenya", locale: "en-KE", rateFromNgn: 0.083 },
  { code: "ZAR", country: "South Africa", locale: "en-ZA", rateFromNgn: 0.011 },
  { code: "USD", country: "United States", locale: "en-US", rateFromNgn: 0.00065 },
  { code: "GBP", country: "United Kingdom", locale: "en-GB", rateFromNgn: 0.00051 },
  { code: "EUR", country: "European Union", locale: "de-DE", rateFromNgn: 0.0006 }
];

const paymentMethods = [
  { id: "paystack", label: "Paystack Card/Bank" },
  { id: "mpesa", label: "M-Pesa Till" },
  { id: "airtel", label: "Airtel Money" },
  { id: "crypto", label: "Crypto Wallet" }
];

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function withDataLock(task) {
  const next = dataLock.then(task, task);
  dataLock = next.catch(() => {});
  return next;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "{\n  \"sessions\": []\n}\n", "utf8");
  }
}

async function readStore() {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf8");

  try {
    const parsed = JSON.parse(content);
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(store) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function sanitizeText(value, maxLength = 180) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function getCurrency(code) {
  return (
    supportedCurrencies.find((currency) => currency.code === code) ||
    supportedCurrencies.find((currency) => currency.code === DEFAULT_CURRENCY) ||
    supportedCurrencies[0]
  );
}

function validateCurrency(value) {
  const code = sanitizeText(value, 3).toUpperCase();
  const currency = supportedCurrencies.find((entry) => entry.code === code);

  if (!currency) {
    const error = new Error("Select a supported currency.");
    error.statusCode = 400;
    throw error;
  }

  return currency.code;
}

function validatePaymentMethod(value) {
  const method = sanitizeText(value, 24).toLowerCase();

  if (!paymentMethods.some((entry) => entry.id === method)) {
    const error = new Error("Select a supported payment method.");
    error.statusCode = 400;
    throw error;
  }

  return method;
}

function validatePhone(value, label = "phone number") {
  const phone = sanitizeText(value, 24);

  if (!/^\+?[0-9]{9,15}$/.test(phone)) {
    const error = new Error(`Enter a valid ${label}.`);
    error.statusCode = 400;
    throw error;
  }

  return phone;
}

function convertFromNgn(amount, currencyCode) {
  const currency = getCurrency(currencyCode);
  return Math.round(amount * currency.rateFromNgn * 100) / 100;
}

function money(amount, currencyCode = DEFAULT_CURRENCY) {
  const currency = getCurrency(currencyCode);

  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    maximumFractionDigits: currency.code === "NGN" ? 0 : 2
  }).format(convertFromNgn(amount, currency.code));
}

function makeBotMessage(text, meta = {}) {
  return {
    id: crypto.randomUUID(),
    sender: "bot",
    text,
    createdAt: new Date().toISOString(),
    ...meta
  };
}

function makeUserMessage(text) {
  return {
    id: crypto.randomUUID(),
    sender: "user",
    text,
    createdAt: new Date().toISOString()
  };
}

function mainMenuText(prefix = "Welcome to AMSTERDON RESTAURANT. What would you like to do?") {
  return [
    prefix,
    "",
    "Select 1 to Place an order",
    "Select 99 to checkout order",
    "Select 98 to see order history",
    "Select 97 to see current order",
    "Select 0 to cancel order"
  ].join("\n");
}

function menuText(currencyCode) {
  const lines = ["Select a meal by number:"];
  menu.forEach((item, index) => {
    const lowestPrice = Math.min(...item.options.map((option) => option.price));
    lines.push(`${index + 1}. ${item.name} - from ${money(lowestPrice, currencyCode)}`);
    lines.push(`   ${item.description}`);
  });
  lines.push("");
  lines.push("Select 0 to cancel order");
  return lines.join("\n");
}

function optionText(item, currencyCode) {
  const lines = [`Choose an option for ${item.name}:`];
  item.options.forEach((option, index) => {
    lines.push(`${index + 1}. ${option.label} - ${money(option.price, currencyCode)}`);
  });
  lines.push("");
  lines.push("Select 0 to cancel order");
  return lines.join("\n");
}

function summarizeItems(items, currencyCode = DEFAULT_CURRENCY) {
  if (!items.length) {
    return "Your current order is empty.";
  }

  const lines = items.map((item, index) => {
    const schedule = item.scheduledFor ? ` scheduled for ${formatDateTime(item.scheduledFor)}` : "";
    return `${index + 1}. ${item.name} ${item.optionLabel} - ${money(item.price, currencyCode)}${schedule}`;
  });
  lines.push(`Total: ${money(totalFor(items), currencyCode)}`);
  return lines.join("\n");
}

function totalFor(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function createSession(deviceId) {
  const now = new Date().toISOString();
  return {
    deviceId,
    createdAt: now,
    updatedAt: now,
    currency: getCurrency(DEFAULT_CURRENCY).code,
    state: { mode: "menu", selectedMenuIndex: null },
    currentOrder: [],
    placedOrders: [],
    messages: [makeBotMessage(mainMenuText())]
  };
}

function getOrCreateSession(store, deviceId) {
  let session = store.sessions.find((entry) => entry.deviceId === deviceId);

  if (!session) {
    session = createSession(deviceId);
    store.sessions.push(session);
  } else if (!session.currency) {
    session.currency = getCurrency(DEFAULT_CURRENCY).code;
  }

  return session;
}

function validateDeviceId(value) {
  const deviceId = sanitizeText(value, 80);

  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(deviceId)) {
    const error = new Error("A valid device id is required.");
    error.statusCode = 400;
    throw error;
  }

  return deviceId;
}

function resetToMenu(session) {
  session.state = { mode: "menu", selectedMenuIndex: null };
}

function cancelOrder(session) {
  if (!session.currentOrder.length) {
    session.messages.push(makeBotMessage(mainMenuText("No active order to cancel.")));
    resetToMenu(session);
    return;
  }

  session.currentOrder = [];
  session.messages.push(makeBotMessage(mainMenuText("Your current order has been cancelled.")));
  resetToMenu(session);
}

function showCurrentOrder(session) {
  const body = session.currentOrder.length
    ? `Current order:\n${summarizeItems(session.currentOrder, session.currency)}`
    : "No current order yet.";
  session.messages.push(makeBotMessage(mainMenuText(body)));
  resetToMenu(session);
}

function showOrderHistory(session) {
  if (!session.placedOrders.length) {
    session.messages.push(makeBotMessage(mainMenuText("You have no placed orders yet.")));
    resetToMenu(session);
    return;
  }

  const lines = ["Your placed orders:"];
  session.placedOrders
    .slice()
    .reverse()
    .forEach((order) => {
      lines.push(
        `Order ${order.code}: ${money(order.total, session.currency)} - ${order.paymentStatus} - ${formatDateTime(order.createdAt)}`
      );
      order.items.forEach((item) => {
        lines.push(`  - ${item.name} ${item.optionLabel}`);
      });
    });
  lines.push("");
  session.messages.push(makeBotMessage(mainMenuText(lines.join("\n"))));
  resetToMenu(session);
}

function checkoutOrder(session) {
  if (!session.currentOrder.length) {
    session.messages.push(makeBotMessage(mainMenuText("No order to place.")));
    resetToMenu(session);
    return;
  }

  const order = {
    id: crypto.randomUUID(),
    code: `AM-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    items: session.currentOrder,
    total: totalFor(session.currentOrder),
    currency: session.currency,
    status: "placed",
    paymentStatus: "unpaid",
    paystackReference: null,
    createdAt: new Date().toISOString()
  };

  session.placedOrders.push(order);
  session.currentOrder = [];
  resetToMenu(session);
  session.messages.push(
    makeBotMessage(
      [
        "Order placed.",
        `Order ${order.code}`,
        summarizeItems(order.items, session.currency),
        "",
        "Use the Pay button below to choose Paystack, M-Pesa Till, Airtel Money, or Crypto Wallet.",
        "Select 1 to Place a new order"
      ].join("\n"),
      { orderId: order.id, paymentStatus: order.paymentStatus }
    )
  );
}

function scheduleCurrentOrder(session, text) {
  if (!session.currentOrder.length) {
    session.messages.push(makeBotMessage(mainMenuText("Add an item before scheduling an order.")));
    resetToMenu(session);
    return true;
  }

  const rawDate = text.replace(/^schedule\s+/i, "");
  const parsedDate = new Date(rawDate);

  if (!rawDate || Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
    session.messages.push(
      makeBotMessage(
        [
          "Please enter a future date and time like:",
          "schedule 2026-05-18 18:30",
          "",
          "Or select 99 to checkout now."
        ].join("\n")
      )
    );
    return true;
  }

  session.currentOrder = session.currentOrder.map((item) => ({
    ...item,
    scheduledFor: parsedDate.toISOString()
  }));
  session.messages.push(
    makeBotMessage(
      mainMenuText(`Order scheduled for ${formatDateTime(parsedDate.toISOString())}.\n${summarizeItems(session.currentOrder, session.currency)}`)
    )
  );
  resetToMenu(session);
  return true;
}

function handleMenuMode(session, text) {
  if (text === "1") {
    session.state = { mode: "select_item", selectedMenuIndex: null };
    session.messages.push(makeBotMessage(menuText(session.currency)));
    return;
  }

  if (text === "99") {
    checkoutOrder(session);
    return;
  }

  if (text === "98") {
    showOrderHistory(session);
    return;
  }

  if (text === "97") {
    showCurrentOrder(session);
    return;
  }

  if (text === "0") {
    cancelOrder(session);
    return;
  }

  if (/^schedule\s+/i.test(text) && scheduleCurrentOrder(session, text)) {
    return;
  }

  session.messages.push(makeBotMessage(mainMenuText("Please select a valid option.")));
}

function handleSelectItemMode(session, text) {
  if (text === "0") {
    cancelOrder(session);
    return;
  }

  const selectedIndex = Number(text) - 1;

  if (!Number.isInteger(selectedIndex) || !menu[selectedIndex]) {
    session.messages.push(makeBotMessage(`Please choose a meal from 1 to ${menu.length}.\n\n${menuText(session.currency)}`));
    return;
  }

  session.state = { mode: "select_option", selectedMenuIndex: selectedIndex };
  session.messages.push(makeBotMessage(optionText(menu[selectedIndex], session.currency)));
}

function handleSelectOptionMode(session, text) {
  if (text === "0") {
    cancelOrder(session);
    return;
  }

  const item = menu[session.state.selectedMenuIndex];

  if (!item) {
    session.state = { mode: "select_item", selectedMenuIndex: null };
    session.messages.push(makeBotMessage(menuText(session.currency)));
    return;
  }

  const optionIndex = Number(text) - 1;
  const option = item.options[optionIndex];

  if (!Number.isInteger(optionIndex) || !option) {
    session.messages.push(makeBotMessage(`Please choose an option from 1 to ${item.options.length}.\n\n${optionText(item, session.currency)}`));
    return;
  }

  session.currentOrder.push({
    id: crypto.randomUUID(),
    menuItemId: item.id,
    optionId: option.id,
    name: item.name,
    optionLabel: option.label,
    price: option.price,
    scheduledFor: null
  });
  resetToMenu(session);
  session.messages.push(
    makeBotMessage(
      mainMenuText(
        [
          `${item.name} ${option.label} added to your order.`,
          "",
          summarizeItems(session.currentOrder, session.currency),
          "",
          "You can type schedule YYYY-MM-DD HH:mm to schedule this order."
        ].join("\n")
      )
    )
  );
}

function processMessage(session, input) {
  const text = sanitizeText(input, 120).toLowerCase();

  if (!text) {
    session.messages.push(makeBotMessage("Please send a number from the menu."));
    return;
  }

  session.messages.push(makeUserMessage(sanitizeText(input, 120)));

  if (text === "98") {
    showOrderHistory(session);
    return;
  }

  if (text === "97") {
    showCurrentOrder(session);
    return;
  }

  if (text === "99") {
    checkoutOrder(session);
    return;
  }

  if (text === "0") {
    cancelOrder(session);
    return;
  }

  if (/^schedule\s+/i.test(text) && scheduleCurrentOrder(session, sanitizeText(input, 120))) {
    return;
  }

  if (session.state.mode === "select_item") {
    handleSelectItemMode(session, text);
    return;
  }

  if (session.state.mode === "select_option") {
    handleSelectOptionMode(session, text);
    return;
  }

  handleMenuMode(session, text);
}

function buildSessionView(session) {
  const currency = getCurrency(session.currency);

  return {
    deviceId: session.deviceId,
    currency: currency.code,
    supportedCurrencies,
    paymentMethods,
    messages: session.messages.slice(-80),
    currentOrder: session.currentOrder,
    placedOrders: session.placedOrders,
    menu,
    totals: {
      currentOrder: totalFor(session.currentOrder),
      currentOrderConverted: convertFromNgn(totalFor(session.currentOrder), currency.code)
    }
  };
}

async function paystackRequest(pathname, payload) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const error = new Error("Paystack test secret key is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.status) {
    const error = new Error(data.message || "Paystack request failed.");
    error.statusCode = response.status || 502;
    throw error;
  }

  return data;
}

async function verifyPaystackReference(reference) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const error = new Error("Paystack test secret key is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.status) {
    const error = new Error(data.message || "Could not verify Paystack payment.");
    error.statusCode = response.status || 502;
    throw error;
  }

  return data.data;
}

function findOrder(store, deviceId, orderId) {
  const session = getOrCreateSession(store, deviceId);
  const order = session.placedOrders.find((entry) => entry.id === orderId);

  if (!order) {
    const error = new Error("Order not found.");
    error.statusCode = 404;
    throw error;
  }

  return { session, order };
}

function manualPaymentInstructions({ order, method, currency, phone }) {
  const amount = money(order.total, currency);

  if (method === "mpesa") {
    return [
      `M-Pesa payment prompt for order ${order.code}.`,
      `Amount: ${amount}`,
      `Till Number: ${MPESA_TILL_NUMBER}`,
      phone ? `Customer phone: ${phone}` : null,
      "",
      "On your phone, open M-Pesa, choose Lipa na M-Pesa, choose Buy Goods and Services, enter the Till Number, enter the amount, then complete with your PIN.",
      "After paying, keep the M-Pesa confirmation message for restaurant verification."
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (method === "airtel") {
    return [
      `Airtel Money payment prompt for order ${order.code}.`,
      `Amount: ${amount}`,
      `Merchant number: ${AIRTEL_MONEY_NUMBER}`,
      phone ? `Customer phone: ${phone}` : null,
      "",
      "Use Airtel Money to send the amount to the merchant number, then keep your confirmation message for restaurant verification."
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Crypto wallet payment prompt for order ${order.code}.`,
    `Amount: ${amount}`,
    `Wallet address: ${CRYPTO_WALLET_ADDRESS}`,
    "",
    "Send the equivalent crypto amount to the wallet address and keep your transaction hash for restaurant verification."
  ].join("\n");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "restaurant-chatbot", menuItems: menu.length });
});

app.get("/api/chat/:deviceId", async (req, res) => {
  try {
    const deviceId = validateDeviceId(req.params.deviceId);
    const session = await withDataLock(async () => {
      const store = await readStore();
      const entry = getOrCreateSession(store, deviceId);
      await writeStore(store);
      return entry;
    });

    res.json({ session: buildSessionView(session) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not load chat." });
  }
});

app.patch("/api/chat/:deviceId/currency", async (req, res) => {
  try {
    const deviceId = validateDeviceId(req.params.deviceId);
    const currency = validateCurrency(req.body?.currency);
    const session = await withDataLock(async () => {
      const store = await readStore();
      const entry = getOrCreateSession(store, deviceId);
      entry.currency = currency;
      entry.updatedAt = new Date().toISOString();
      entry.messages.push(makeBotMessage(mainMenuText(`Currency changed to ${currency}.`)));
      await writeStore(store);
      return entry;
    });

    res.json({ session: buildSessionView(session) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not update currency." });
  }
});

app.post("/api/chat/:deviceId/messages", async (req, res) => {
  try {
    const deviceId = validateDeviceId(req.params.deviceId);
    const message = sanitizeText(req.body?.message, 120);
    const session = await withDataLock(async () => {
      const store = await readStore();
      const entry = getOrCreateSession(store, deviceId);
      processMessage(entry, message);
      entry.updatedAt = new Date().toISOString();
      await writeStore(store);
      return entry;
    });

    res.json({ session: buildSessionView(session) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Message failed." });
  }
});

app.post("/api/payments/initialize", async (req, res) => {
  try {
    const deviceId = validateDeviceId(req.body?.deviceId);
    const orderId = sanitizeText(req.body?.orderId, 80);
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const requestedCurrency = validateCurrency(req.body?.currency || DEFAULT_CURRENCY);
    const paymentMethod = validatePaymentMethod(req.body?.paymentMethod || "paystack");
    const phone = sanitizeText(req.body?.phone, 24);

    if (paymentMethod === "paystack" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ message: "Enter a valid email address for payment." });
      return;
    }

    if ((paymentMethod === "mpesa" || paymentMethod === "airtel") && phone) {
      validatePhone(phone, `${paymentMethod === "mpesa" ? "M-Pesa" : "Airtel"} phone number`);
    }

    const { order, session } = await withDataLock(async () => {
      const store = await readStore();
      return findOrder(store, deviceId, orderId);
    });

    if (order.paymentStatus === "paid") {
      res.status(409).json({ message: "This order has already been paid." });
      return;
    }

    const callbackUrl = `${req.protocol}://${req.get("host")}/payment/callback`;
    const reference = `AM_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const currency = requestedCurrency || session.currency;
    const convertedTotal = convertFromNgn(order.total, currency);

    if (paymentMethod !== "paystack") {
      let updatedSession;
      const instructions = manualPaymentInstructions({
        order,
        method: paymentMethod,
        currency,
        phone
      });

      await withDataLock(async () => {
        const store = await readStore();
        const found = findOrder(store, deviceId, orderId);
        found.order.paymentStatus = "pending";
        found.order.paymentMethod = paymentMethod;
        found.order.paymentCurrency = currency;
        found.order.paymentAmount = convertedTotal;
        found.order.paymentPhone = phone || null;
        found.session.messages.push(
          makeBotMessage(instructions, {
            orderId: found.order.id,
            paymentStatus: found.order.paymentStatus
          })
        );
        found.session.updatedAt = new Date().toISOString();
        updatedSession = found.session;
        await writeStore(store);
      });

      res.json({
        paymentMethod,
        instructions,
        session: buildSessionView(updatedSession)
      });
      return;
    }

    const data = await paystackRequest("/transaction/initialize", {
      email,
      amount: Math.round(convertedTotal * 100),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        deviceId,
        orderId,
        orderCode: order.code,
        currency
      }
    });

    await withDataLock(async () => {
      const store = await readStore();
      const found = findOrder(store, deviceId, orderId);
      found.order.paystackReference = reference;
      found.order.paymentStatus = "pending";
      found.order.paymentCurrency = currency;
      found.order.paymentAmount = convertedTotal;
      found.session.updatedAt = new Date().toISOString();
      await writeStore(store);
    });

    res.json({
      authorizationUrl: data.data.authorization_url,
      reference
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Payment setup failed." });
  }
});

app.get("/payment/callback", async (req, res) => {
  const reference = sanitizeText(req.query.reference, 120);

  if (!reference) {
    res.redirect("/?payment=failed");
    return;
  }

  try {
    const payment = await verifyPaystackReference(reference);
    const deviceId = validateDeviceId(payment.metadata?.deviceId);
    const orderId = sanitizeText(payment.metadata?.orderId, 80);
    let paid = false;

    await withDataLock(async () => {
      const store = await readStore();
      const { session, order } = findOrder(store, deviceId, orderId);
      paid = payment.status === "success";
      order.paymentStatus = paid ? "paid" : "failed";
      order.paystackReference = reference;
      session.messages.push(
        makeBotMessage(
          paid
            ? `Payment successful for order ${order.code}. Thank you for ordering from AMSTERDON RESTAURANT.`
            : `Payment was not completed for order ${order.code}. You can try paying again from order history.`,
          { orderId: order.id, paymentStatus: order.paymentStatus }
        )
      );
      session.updatedAt = new Date().toISOString();
      await writeStore(store);
    });

    res.redirect(`/?deviceId=${encodeURIComponent(deviceId)}&payment=${paid ? "success" : "failed"}`);
  } catch {
    res.redirect("/?payment=failed");
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unexpected server error.", error);
  res.status(500).json({ message: "Something unexpected happened." });
});

async function startServer() {
  await ensureDataFile();

  app.listen(PORT, () => {
    console.log(`Restaurant chatbot running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start restaurant chatbot.", error);
  process.exit(1);
});
