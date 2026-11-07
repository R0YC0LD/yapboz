import gsap from 'gsap';
import { kissScatter, rainOver, screenShake } from './fx.js';
import { sfx } from './sound.js';
import { save, persist } from './store.js';
import { PUZZLES } from './data.js';

const $ = (id) => document.getElementById(id);
const TOTAL = PUZZLES.reduce((sum, p) => sum + p.cols * p.rows, 0);

const ITEMS = [
  { id: 'hug', name: 'Sarılma', cost: 1, line: 'Geçerli olduğu yer: Onur neredeyse orası.' },
  { id: 'bighug', name: 'Kocaman sarılma', cost: 5, line: 'Kemikler hafif çatırdayabilir.' },
  { id: 'kiss', name: 'Öpücük', cost: 10, line: 'Gerçek olanı, yanakta değil.' },
  { id: 'bigkiss', name: 'Büyük öpücük', cost: 20, line: 'Uzun sürer, kısa kesmek yasak.' },
  { id: 'bomb', name: 'Öpücük bombası', cost: 40, line: 'Patlama alanı: bütün yüz.' },
  { id: 'surprise', name: 'Sürpriz', cost: TOTAL, line: 'Bunu Onur’a göster. Gerisini o biliyor.' },
];

let armed = null;
let armTimer = null;

function row(item) {
  const missing = item.cost - save.kisses;
  const li = document.createElement('li');
  li.className = item.id === 'surprise' ? 'shop-row surprise' : 'shop-row';

  const name = document.createElement('div');
  name.className = 'shop-name';
  name.innerHTML = '<strong></strong><span></span>';
  name.firstChild.textContent = item.name;
  name.lastChild.textContent = item.id === 'surprise' ? `Yedi kutunun bütün öpücükleri: ${TOTAL}` : `${item.cost} öpücük`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.disabled = missing > 0;
  button.textContent = missing > 0 ? `${missing} eksik` : armed === item.id ? 'Emin misin?' : 'Al';
  button.onclick = () => buy(item);

  li.append(name, button);
  return li;
}

function render() {
  $('shopBalance').textContent = save.kisses;
  $('shopList').replaceChildren(...ITEMS.map(row));
  const coupons = $('couponList');
  coupons.replaceChildren(
    ...save.coupons.map((c) => {
      const li = document.createElement('li');
      li.textContent = `${c.name}, ${c.date}`;
      return li;
    }),
  );
  $('couponBlock').hidden = save.coupons.length === 0;
}

function buy(item) {
  if (save.kisses < item.cost) return;
  if (item.cost >= 10 && armed !== item.id) {
    armed = item.id;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      armed = null;
      render();
    }, 2600);
    render();
    return;
  }
  armed = null;
  save.kisses -= item.cost;
  save.coupons.unshift({ id: item.id, name: item.name, date: new Date().toLocaleDateString('tr-TR') });
  persist();
  onChange();
  render();
  showCoupon(item);
}

function showCoupon(item) {
  $('couponName').textContent = item.name;
  $('couponLine').textContent = item.line;
  const box = $('coupon');
  box.hidden = false;
  sfx.kiss();
  gsap.fromTo('#couponCard', { scale: 2, rotation: -14, opacity: 0 }, { scale: 1, rotation: -2, opacity: 1, duration: 0.26, ease: 'power4.in', onComplete: () => sfx.snap() });
  gsap.fromTo('#couponCard .stamp', { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, delay: 0.32, ease: 'power3.in', clearProps: 'transform' });

  if (item.id === 'bomb') {
    screenShake(0.9);
    kissScatter(44, { x: 0, y: 0, w: innerWidth, h: innerHeight });
    rainOver(120);
    sfx.win();
  } else if (item.id === 'surprise') {
    screenShake(0.6);
    kissScatter(60, { x: 0, y: 0, w: innerWidth, h: innerHeight });
    rainOver(240);
    sfx.win();
  } else if (item.cost >= 10) {
    kissScatter(item.cost, { x: 0, y: 0, w: innerWidth, h: innerHeight });
  }
}

let onChange = () => {};

export function initShop(changed) {
  onChange = changed;
  $('shopClose').onclick = closeShop;
  $('couponOk').onclick = () => ($('coupon').hidden = true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('coupon').hidden) $('coupon').hidden = true;
      else closeShop();
    }
  });
}

export function openShop() {
  render();
  $('shop').hidden = false;
  gsap.fromTo('#shopSheet', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: 'back.out(1.6)' });
}

function closeShop() {
  $('shop').hidden = true;
}
