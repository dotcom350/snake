export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or storage disabled: preferences just won't persist.
    }
  },
};

export function sessionId(): string {
  const existing = storage.get('sid');
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  // crypto.randomUUID() only exists on HTTPS/localhost; getRandomValues works everywhere.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  storage.set('sid', id);
  return id;
}
