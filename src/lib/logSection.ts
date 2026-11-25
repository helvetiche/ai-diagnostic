let pending: string | null = null;

export function setPendingLogSection(section: string | null): void {
  pending = section;
}

export function consumePendingLogSection(): string | null {
  const value = pending;
  pending = null;
  return value;
}
