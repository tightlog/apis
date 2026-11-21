export function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

export function isUniqueViolation(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('UNIQUE');
}
