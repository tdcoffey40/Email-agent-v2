type ClassValue = string | false | null | undefined;

/** Join conditional class names. Small enough not to warrant a dependency. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
