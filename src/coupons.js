import { SUPABASE_KEY, SUPABASE_URL } from './backend.js';
import { save, persist } from './store.js';

const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
      await rpc('add_coupon', { p_id: coupon.uid, p_item: coupon.id });
      coupon.synced = true;
      persist();
    }
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

if (enabled) window.addEventListener('online', syncCoupons);
