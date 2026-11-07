import { SUPABASE_KEY, SUPABASE_URL } from './backend.js';
import { onPersist, save, persist } from './store.js';

const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function rpc(name, body, options) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...options,
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export function newCoupon(item) {
  return {
    uid: crypto.randomUUID(),
    id: item.id,
    name: item.name,
    date: new Date().toLocaleDateString('tr-TR'),
    synced: false,
  };
}

// Çevrimdışı ya da uyumakta olan veritabanında kupon kaybolmasın diye satın alma önce yerele yazılır.
export async function syncCoupons() {
  if (!enabled) return false;
  let changed = false;
  try {
    for (const coupon of save.coupons) {
      coupon.uid ??= crypto.randomUUID();
      if (coupon.synced) continue;
      try {
        await rpc('add_coupon', { p_id: coupon.uid, p_item: coupon.id });
        coupon.synced = true;
      } catch (err) {
        console.warn(err);
      }
    }
    persist();
    const sent = save.coupons.filter((c) => c.synced).map((c) => c.uid);
    if (sent.length) {
      const open = new Set(await rpc('open_coupons', { p_ids: sent }));
      const kept = save.coupons.filter((c) => !c.synced || open.has(c.uid));
      changed = kept.length !== save.coupons.length;
      save.coupons = kept;
      persist();
    }
  } catch (err) {
    console.warn(err);
  }
  return changed;
}

export async function surpriseOpen() {
  if (!enabled) return false;
  try {
    return await rpc('surprise_open', {});
  } catch {
    return null;
  }
}

let backupTimer;

function backupNow(options) {
  clearTimeout(backupTimer);
  backupTimer = null;
  return rpc('save_progress', { p_data: save }, options).catch((err) => console.warn(err));
}

function backupSoon() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(backupNow, 3000);
}

// Tarayıcı verisi silinirse ya da cihaz değişirse öpücükler ve kutular buluttan geri gelir.
export async function restoreProgress() {
  if (!enabled) return;
  try {
    const remote = await rpc('load_progress', {}, { signal: AbortSignal.timeout(4000) });
    if (remote && (remote.earned ?? 0) > save.earned) {
      const pending = save.coupons.filter((c) => !c.synced);
      const known = new Set(pending.map((c) => c.uid));
      Object.assign(save, remote, { coupons: [...pending, ...(remote.coupons ?? []).filter((c) => !known.has(c.uid))] });
    }
  } catch (err) {
    console.warn(err);
  }
  onPersist(backupSoon);
  persist();
}

if (enabled) {
  window.addEventListener('online', syncCoupons);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && backupTimer) backupNow({ keepalive: true });
  });
}
