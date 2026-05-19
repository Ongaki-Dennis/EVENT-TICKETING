# Restaurant ChatBot

A restaurant ordering chatbot built with `Express`, a browser chat UI, a JSON data store, Paystack test checkout, and manual mobile/crypto payment prompts.

## Features

- Chat-style ordering interface
- Device-based sessions with `localStorage`
- Number-driven bot flow:
  - `1` places an order
  - `99` checks out the current order
  - `98` shows placed order history
  - `97` shows the current order
  - `0` cancels the current order
- Menu items with multiple options
- Input validation on the client and server
- Current order and order history persistence
- Paystack test payment initialization and callback verification
- M-Pesa Till payment prompt using Till Number `5797579`
- Airtel Money and Crypto Wallet payment prompts
- Currency selector for Nigeria, Ghana, Kenya, South Africa, the United States, the United Kingdom, and the EU
- Optional scheduling by typing `schedule YYYY-MM-DD HH:mm` before checkout

## Requirements

- Node.js 18+
- A Paystack test secret key for payment testing

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
PORT=3000
DATA_DIR=./data
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
PAYSTACK_CURRENCY=NGN
MPESA_TILL_NUMBER=5797579
AIRTEL_MONEY_NUMBER=your-airtel-merchant-number
CRYPTO_WALLET_ADDRESS=your-wallet-address
```

`PAYSTACK_SECRET_KEY` must be a test key when testing locally. Without it, the chatbot still works, but payment initialization returns a configuration error. `PAYSTACK_CURRENCY` controls the default currency shown to new users; customers can switch currencies inside the app.

## Run Locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Test the Chat Flow

1. Open the app in a browser.
2. Send `1` to see the restaurant menu.
3. Choose a meal number.
4. Choose one of the meal options.
5. Send `97` to inspect the current order.
6. Send `99` to place the order.
7. Click `Pay order` and choose Paystack, M-Pesa Till, Airtel Money, or Crypto Wallet.
8. Paystack redirects to checkout. M-Pesa, Airtel, and Crypto add payment instructions to the chat and leave the order as pending for restaurant verification.

## Deployment

The included `render.yaml` is ready for Render. Add `PAYSTACK_SECRET_KEY` in your hosting platform environment variables before testing checkout in production.
