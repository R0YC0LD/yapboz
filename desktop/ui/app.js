const { url, key, secret } = window.KUPON_AYAR ?? {};
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const REFRESH_MS = 20000;
const known = new Set();
let firstLoad = true;

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.status === 204 ? null : res.json();
}

function setStatus(text, bad = false) {
  status.textContent = text;
  status.classList.toggle('bad', bad);
}

function row(coupon) {
  const li = document.createElement('li');
  li.className = 'coupon';
  if (!firstLoad && !known.has(coupon.id)) li.classList.add('new');

  const text = document.createElement('div');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = coupon.name;
  const when = document.createElement('span');
  when.className = 'when';
  const stamp = new Date(coupon.bought_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  when.textContent = coupon.cost ? `${stamp}, ${coupon.cost} öpücük` : stamp;
  text.append(name, when);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Tahsil edildi';
  button.onclick = () => collect(coupon, li, button);

  li.append(text, button);
  return li;
}

async function collect(coupon, li, button) {
  if (!button.classList.contains('armed')) {
    button.classList.add('armed');
    button.textContent = 'Emin misin?';
    setTimeout(() => {
      button.classList.remove('armed');
      button.textContent = 'Tahsil edildi';
    }, 3000);
    return;
  }
  button.disabled = true;
  try {
    await rpc('admin_collect', { p_secret: secret, p_id: coupon.id });
    li.classList.add('gone');
    known.delete(coupon.id);
    setTimeout(() => {
      li.remove();
      load();
    }, 200);
  } catch {
    button.disabled = false;
    setStatus('Silinemedi, bağlantıyı kontrol et', true);
  }
}

function busy() {
  return Boolean(list.querySelector('button.armed, button:disabled'));
}

async function load() {
  if (!url || !key || !secret) {
    setStatus('Kurulum tamamlanmadı', true);
    return;
  }
  if (busy()) return;
  try {
    const coupons = await rpc('admin_coupons', { p_secret: secret });
    const rows = coupons.map(row);
    coupons.forEach((c) => known.add(c.id));
    firstLoad = false;
    list.replaceChildren(...rows);
    empty.hidden = coupons.length > 0;
    setStatus(coupons.length ? `${coupons.length} kupon tahsilat bekliyor` : 'Her şey ödendi');
  } catch {
    setStatus('Bağlanılamadı, yeniden deneniyor', true);
  }
}

load();
setInterval(load, REFRESH_MS);
window.addEventListener('focus', load);
