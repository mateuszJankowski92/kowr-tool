/** Keep domain calculations pure and deterministic in this package. */
export function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}
