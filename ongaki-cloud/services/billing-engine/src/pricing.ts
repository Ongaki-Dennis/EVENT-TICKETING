export type UsageDimension =
  | "cpu_seconds"
  | "memory_gb_seconds"
  | "bandwidth_gb"
  | "storage_gb_month"
  | "api_requests"
  | "function_calls"
  | "db_reads"
  | "db_writes"
  | "cdn_gb"
  | "ssl_certificates";

export type PriceBook = Record<UsageDimension, number>;

export const usdPriceBook: PriceBook = {
  cpu_seconds: 0.000011,
  memory_gb_seconds: 0.000003,
  bandwidth_gb: 0.085,
  storage_gb_month: 0.023,
  api_requests: 0.0000008,
  function_calls: 0.0000002,
  db_reads: 0.00000012,
  db_writes: 0.00000025,
  cdn_gb: 0.045,
  ssl_certificates: 0
};

export const freeTier: PriceBook = {
  cpu_seconds: 180000,
  memory_gb_seconds: 360000,
  bandwidth_gb: 100,
  storage_gb_month: 5,
  api_requests: 1000000,
  function_calls: 1000000,
  db_reads: 5000000,
  db_writes: 1000000,
  cdn_gb: 100,
  ssl_certificates: 10
};

