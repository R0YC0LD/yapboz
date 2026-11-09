import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, webcrypto } from 'node:crypto';
import { canonicalDate, deriveKey, ITERATIONS } from '../src/vault.js';

const pass = process.env.VAULT_PASS;
if (!canonicalDate(pass ?? '')) throw new Error('VAULT_PASS tarih biçiminde olmalı');

const sources = [
  ['p1.bin', 'WhatsApp Image 2026-11-07 at 21.36.53 (3).jpeg'],
  ['p2.bin', 'WhatsApp Image 2026-11-07 at 21.36.53 (1).jpeg'],
  ['p3.bin', 'WhatsApp Image 2026-11-07 at 21.36.54 (2).jpeg'],
  ['p4.bin', 'WhatsApp Image 2026-11-07 at 21.36.53 (2).jpeg'],
  ['p5.bin', 'WhatsApp Image 2026-11-07 at 21.36.53.jpeg'],
  ['p6.bin', 'WhatsApp Image 2026-11-07 at 21.36.54 (1).jpeg'],
  ['p7.bin', 'WhatsApp Image 2026-11-07 at 21.36.54.jpeg'],
  ['p8.bin', 'yeni-1.jpg'],
  ['p9.bin', 'yeni-2.jpg'],
  ['p10.bin', 'kutu-esrarengiz-kasaba.jpg'],
  ['p11.bin', 'kutu-my-little-pony.jpg'],
  ['p12.bin', 'kutu-adventure-time.jpg'],
  ['p13.bin', 'kutu-simpsons.jpg'],
  ['p14.bin', 'kutu-rick-and-morty.jpg'],
  ['intro.bin', 'WhatsApp Video 2026-11-07 at 21.36.53.mp4'],
];

const salt = randomBytes(16);
const key = await deriveKey(canonicalDate(pass), salt);

async function seal(bytes) {
  const iv = randomBytes(12);
  const body = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return Buffer.concat([iv, Buffer.from(body)]);
}

await writeFile('public/vault/check.bin', await seal(Buffer.from('tamam')));
for (const [out, src] of sources) {
  await writeFile(`public/vault/${out}`, await seal(await readFile(src)));
}
await writeFile('public/vault/index.json', JSON.stringify({ salt: salt.toString('hex'), iterations: ITERATIONS }));
console.log('sealed', sources.length + 1);
