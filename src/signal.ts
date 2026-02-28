export type Signal = "NEEDS_REVISION" | "APPROVED" | "PLAN_READY";

const VALID_SIGNALS: ReadonlySet<string> = new Set<string>([
  "NEEDS_REVISION",
  "APPROVED",
  "PLAN_READY",
]);

export function parseSignal(output: string): Signal | null {
  const match = output.trimEnd().match(/<signal>(\w+)<\/signal>$/);
  if (!match) return null;
  return VALID_SIGNALS.has(match[1]) ? (match[1] as Signal) : null;
}
