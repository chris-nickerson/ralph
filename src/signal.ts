export function parseSignal(output: string): string | null {
  const match = output.trimEnd().match(/<signal>(\w+)<\/signal>$/);
  return match ? match[1] : null;
}
