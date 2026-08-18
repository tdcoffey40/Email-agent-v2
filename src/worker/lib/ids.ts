const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short, sortable-ish, collision-resistant id with a type prefix. */
export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${out}`;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
