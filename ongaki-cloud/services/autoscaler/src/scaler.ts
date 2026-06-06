export interface ScalingMetrics {
  cpuPercent: number;
  memoryPercent: number;
  requestRatePerSecond: number;
  p95LatencyMs: number;
  queueDepth: number;
  idleMinutes: number;
  currentReplicas: number;
  minReplicas: number;
  maxReplicas: number;
}

export interface ScalingPolicy {
  cpuScaleUpPercent: number;
  memoryScaleUpPercent: number;
  cpuScaleDownPercent: number;
  requestRateThreshold: number;
  p95LatencyThresholdMs: number;
  queueDepthThreshold: number;
  idleScaleDownMinutes: number;
  scaleUpStep: number;
  scaleDownStep: number;
}

export interface ScalingDecision {
  desiredReplicas: number;
  reason: string;
  coldStartAllowed: boolean;
}

export const defaultPolicy: ScalingPolicy = {
  cpuScaleUpPercent: 75,
  memoryScaleUpPercent: 80,
  cpuScaleDownPercent: 30,
  requestRateThreshold: 100,
  p95LatencyThresholdMs: 750,
  queueDepthThreshold: 1000,
  idleScaleDownMinutes: 15,
  scaleUpStep: 2,
  scaleDownStep: 1
};

export function decideReplicas(metrics: ScalingMetrics, policy: ScalingPolicy = defaultPolicy): ScalingDecision {
  const shouldScaleUp =
    metrics.cpuPercent > policy.cpuScaleUpPercent ||
    metrics.memoryPercent > policy.memoryScaleUpPercent ||
    metrics.requestRatePerSecond > policy.requestRateThreshold ||
    metrics.p95LatencyMs > policy.p95LatencyThresholdMs ||
    metrics.queueDepth > policy.queueDepthThreshold;

  if (shouldScaleUp) {
    return {
      desiredReplicas: clamp(metrics.currentReplicas + policy.scaleUpStep, metrics.minReplicas, metrics.maxReplicas),
      reason: "high_load",
      coldStartAllowed: true
    };
  }

  const shouldScaleDown =
    metrics.cpuPercent < policy.cpuScaleDownPercent &&
    metrics.requestRatePerSecond < policy.requestRateThreshold * 0.25 &&
    metrics.queueDepth === 0 &&
    metrics.idleMinutes > policy.idleScaleDownMinutes;

  if (shouldScaleDown) {
    return {
      desiredReplicas: clamp(metrics.currentReplicas - policy.scaleDownStep, metrics.minReplicas, metrics.maxReplicas),
      reason: "sustained_idle",
      coldStartAllowed: metrics.minReplicas === 0
    };
  }

  return {
    desiredReplicas: clamp(metrics.currentReplicas, metrics.minReplicas, metrics.maxReplicas),
    reason: "stable",
    coldStartAllowed: metrics.minReplicas === 0
  };
}

export function dynamicMaxReplicas(tenantCpuQuotaMillis: number, serviceCpuRequestMillis: number): number {
  if (tenantCpuQuotaMillis <= 0 || serviceCpuRequestMillis <= 0) {
    throw new Error("CPU quota and service request must be greater than zero");
  }

  return Math.max(1, Math.floor(tenantCpuQuotaMillis / serviceCpuRequestMillis));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

