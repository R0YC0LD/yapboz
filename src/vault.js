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

const downloads = new Map();

// Dosyalar şifreli, parola girilmeden indirmek bir şey açığa çıkarmaz ve bekleme süresini kısaltır.
export function prefetch(name) {
  if (!downloads.has(name)) {
    const request = fetch(root + name).then((res) => {
      if (!res.ok) throw new Error(`${name} indirilemedi`);
      return res.arrayBuffer();
    });
    request.catch(() => downloads.delete(name));
    downloads.set(name, request);
  }
  return downloads.get(name);
}

async function open(key, name) {
  const sealed = new Uint8Array(await prefetch(name));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, key, sealed.slice(12));
  if (name !== 'check.bin') downloads.delete(name);
  return plain;
}

export async function unlock(password) {
  const canonical = canonicalDate(password);
  if (!canonical) return null;
  const info = JSON.parse(new TextDecoder().decode(await prefetch('index.json')));
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
