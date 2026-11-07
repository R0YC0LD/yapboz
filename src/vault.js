export const ITERATIONS = 210000;

export function canonicalDate(input) {
  const text = input.trim();
  const m = text.match(/^(\d{1,2})\s*[./\-\s]\s*(\d{1,2})\s*[./\-\s]\s*(\d{4})$/) || text.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [low, high] = [Number(m[1]), Number(m[2])].sort((a, b) => a - b);
  return `${low}.${high}.${m[3]}`;
}

export async function deriveKey(canonical, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(canonical), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const root = `${import.meta.env?.BASE_URL ?? './'}vault/`;

async function open(key, name) {
  const res = await fetch(root + name);
  if (!res.ok) throw new Error(`${name} indirilemedi`);
  const sealed = new Uint8Array(await res.arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, key, sealed.slice(12));
}

export async function unlock(password) {
  const canonical = canonicalDate(password);
  if (!canonical) return null;
  const info = await (await fetch(`${root}index.json`)).json();
  const salt = Uint8Array.from(info.salt.match(/../g), (h) => parseInt(h, 16));
  const key = await deriveKey(canonical, salt);
  try {
    await open(key, 'check.bin');
  } catch (err) {
    if (err.name === 'OperationError') return null;
    throw err;
  }
  return { read: (name) => open(key, name) };
}
