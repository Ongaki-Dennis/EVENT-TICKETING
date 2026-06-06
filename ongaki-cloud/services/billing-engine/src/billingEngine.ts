import { freeTier, PriceBook, UsageDimension, usdPriceBook } from "./pricing";

export interface UsageRecord {
  tenantId: string;
  projectId?: string;
  billingCycleId: string;
  dimension: UsageDimension;
  quantity: number;
  recordedAt: string;
}

export interface InvoiceLine {
  dimension: UsageDimension;
  quantity: number;
  freeQuantity: number;
  billableQuantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceCalculation {
  tenantId: string;
  billingCycleId: string;
  currency: "USD";
  subtotal: number;
  tax: number;
  total: number;
  lines: InvoiceLine[];
}

export function aggregateUsage(records: UsageRecord[]): Record<UsageDimension, number> {
  return records.reduce((acc, record) => {
    acc[record.dimension] = (acc[record.dimension] ?? 0) + record.quantity;
    return acc;
  }, {} as Record<UsageDimension, number>);
}

export function calculateInvoice(
  tenantId: string,
  billingCycleId: string,
  records: UsageRecord[],
  priceBook: PriceBook = usdPriceBook,
  taxRate = 0
): InvoiceCalculation {
  const usage = aggregateUsage(records);
  const dimensions = Object.keys(priceBook) as UsageDimension[];

  const lines = dimensions.map((dimension) => {
    const quantity = roundUsage(usage[dimension] ?? 0);
    const freeQuantity = freeTier[dimension] ?? 0;
    const billableQuantity = Math.max(quantity - freeQuantity, 0);
    const unitPrice = priceBook[dimension];
    const amount = roundMoney(billableQuantity * unitPrice);

    return {
      dimension,
      quantity,
      freeQuantity,
      billableQuantity,
      unitPrice,
      amount
    };
  });

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const tax = roundMoney(subtotal * taxRate);

  return {
    tenantId,
    billingCycleId,
    currency: "USD",
    subtotal,
    tax,
    total: roundMoney(subtotal + tax),
    lines
  };
}

export function shouldSuspendForBalance(invoiceTotal: number, walletBalance: number, creditLimit = 0): boolean {
  return walletBalance + creditLimit < invoiceTotal;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

function roundUsage(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000000) / 1000000000;
}

const exampleRecords: UsageRecord[] = [
  {
    tenantId: "7d199459-2a65-4bf0-9bb5-9f5d65c2df5a",
    billingCycleId: "2026-05",
    dimension: "cpu_seconds",
    quantity: 240000,
    recordedAt: "2026-05-20T00:00:00.000Z"
  },
  {
    tenantId: "7d199459-2a65-4bf0-9bb5-9f5d65c2df5a",
    billingCycleId: "2026-05",
    dimension: "bandwidth_gb",
    quantity: 180,
    recordedAt: "2026-05-20T00:00:00.000Z"
  }
];

export const exampleInvoice = calculateInvoice(
  "7d199459-2a65-4bf0-9bb5-9f5d65c2df5a",
  "2026-05",
  exampleRecords,
  usdPriceBook,
  0.16
);

