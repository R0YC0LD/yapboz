import gsap from 'gsap';
import { PUZZLES } from './data.js';
import { puzzleState } from './store.js';
import { buzz, sfx, wakeSound } from './sound.js';
import { addTodo, initTodos, markTodo, refresh, removeTodo, sync, todoItems } from './todos.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 15000;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

let onPuzzle = () => {};
let covers = [];
let poll = null;
let busy = false;

export async function initHome(vault, hooks) {
  onPuzzle = hooks.onPuzzle;
  covers = hooks.covers;
  await initTodos(vault, (changed) => {
    if (changed && !$('todo').hidden) renderList();
    if (!$('menu').hidden) renderMenu();
    renderSync();
  });

  $('goPuzzle').onclick = () => {
    if (busy) return;
    wakeSound();
    buzz(10);
    sfx.lid();
    leaveMenu($('goPuzzle'), () => onPuzzle());
  };
  $('goTodo').onclick = () => {
    if (busy) return;
    wakeSound();
    buzz(10);
    sfx.pick();
    leaveMenu($('goTodo'), openTodo);
  };
  $('todoBack').onclick = closeTodo;
  $('todoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('todoInput');
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (!text) {
      input.focus();
      return;
    }
    input.value = '';
    const item = await addTodo(text);
    sfx.drop();
    buzz(8);
    const row = $('todoList').querySelector(`[data-id="${item.id}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    if (row && !calm) gsap.from(row, { opacity: 0, x: -14, duration: 0.32, ease: 'power3.out', clearProps: 'all' });
  });
  refresh();
}

function renderMenu() {
  if (covers.length) $('lidPhoto').style.backgroundImage = `url("${covers[Math.floor(Math.random() * covers.length)]}")`;
  const done = PUZZLES.filter((p) => puzzleState(p.id).finished > 0).length;
  const total = PUZZLES.length;
  $('lidMeta').textContent = done === total ? `${total} kutunun hepsi bitti` : done ? `${total} kutu, ${done} tanesi bitti` : `${total} kutu seni bekliyor`;

  const open = todoItems().filter((i) => !i.doneAt);
  const preview = $('padPreview');
  preview.replaceChildren();
  if (!todoItems().length) {
    preview.textContent = 'Sayfa henüz boş';
    return;
  }
  for (const item of open.slice(0, 3)) {
    const line = document.createElement('span');
    line.textContent = item.text;
    preview.append(line);
  }
  const rest = open.length - 3;
  const tail = document.createElement('span');
  tail.className = 'pad-tail';
  if (!open.length) tail.textContent = 'Hepsinin üstü çizildi';
  else if (rest > 0) tail.textContent = `ve ${rest} madde daha`;
  if (tail.textContent) preview.append(tail);
}

export function openMenu() {
  renderMenu();
  const menu = $('menu');
  menu.hidden = false;
  busy = false;
  if (calm) return;
  gsap.fromTo('#menuTitle', { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
  gsap.fromTo(
    '.menu-desk > *',
    { opacity: 0, y: 70, rotation: (i) => (i ? 7 : -7) },
    { opacity: 1, y: 0, rotation: 0, duration: 0.7, ease: 'back.out(1.3)', stagger: 0.09, clearProps: 'transform,opacity' },
  );
}

function leaveMenu(chosen, then) {
  busy = true;
  const other = chosen.id === 'goPuzzle' ? $('goTodo') : $('goPuzzle');
  const done = () => {
    $('menu').hidden = true;
    gsap.set(['#menuTitle', chosen, other], { clearProps: 'all' });
    then();
  };
  if (calm) return done();
  gsap
    .timeline({ onComplete: done })
    .to(other, { opacity: 0, y: 40, duration: 0.3, ease: 'power2.in' }, 0)
    .to('#menuTitle', { opacity: 0, duration: 0.25 }, 0)
    .to(chosen, { scale: 1.06, duration: 0.18, ease: 'power2.out' }, 0)
    .to(chosen, { opacity: 0, y: -24, scale: 0.94, duration: 0.3, ease: 'power2.in' }, 0.2);
}

function renderSync() {
  const note = $('todoSync');
  note.textContent = sync.online ? 'İkinizin ortak sayfası' : 'İnternet yok, yazdıkların telefonda bekliyor';
  note.classList.toggle('bad', !sync.online);
}

function renderCount() {
  const all = todoItems();
  const done = all.filter((i) => i.doneAt).length;
  $('todoCount').textContent = !all.length ? 'Henüz madde yok' : done ? `${all.length} madde, ${done} tanesinin üstü çizildi` : `${all.length} madde, hepsi bekliyor`;
  $('todoEmpty').hidden = all.length > 0;
}

function row(item) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.id = item.id;
  li.classList.toggle('done', Boolean(item.doneAt));

  const text = document.createElement('p');
  text.className = 'todo-text';
  const ink = document.createElement('span');
  ink.className = 'ink';
  ink.textContent = item.text;
  text.append(ink);

  const pen = document.createElement('button');
  pen.type = 'button';
  pen.className = 'pen';
  pen.innerHTML = '<svg aria-hidden="true"><use href="#pencil"/></svg>';
  pen.onclick = () => toggle(item, li, pen);

  const rub = document.createElement('button');
  rub.type = 'button';
  rub.className = 'rub';
  rub.innerHTML = '<svg aria-hidden="true"><use href="#eraser"/></svg><span>Sil?</span>';
  rub.onclick = () => erase(item, li, rub);

  setPenLabel(pen, item);
  rub.setAttribute('aria-label', `Sil: ${item.text}`);
  li.append(text, pen, rub);
  return li;
}

function setPenLabel(pen, item) {
  pen.setAttribute('aria-pressed', String(Boolean(item.doneAt)));
  pen.setAttribute('aria-label', `${item.doneAt ? 'Çizgiyi kaldır' : 'Üstünü çiz'}: ${item.text}`);
}

function toggle(item, li, pen) {
  const done = !item.doneAt;
  markTodo(item.id, done);
  li.classList.toggle('done', done);
  setPenLabel(pen, item);
  if (done) {
    sfx.scribble();
    buzz([6, 40, 6]);
  } else {
    sfx.rub();
    buzz(6);
  }
  if (!calm) gsap.fromTo(pen, { rotation: done ? -18 : 12 }, { rotation: 0, duration: 0.45, ease: 'back.out(3)' });
  renderCount();
}

function erase(item, li, rub) {
  if (!rub.classList.contains('armed')) {
    rub.classList.add('armed');
    buzz(6);
    setTimeout(() => rub.classList.remove('armed'), 3000);
    return;
  }
  sfx.rub();
  buzz(12);
  removeTodo(item.id);
  const gone = () => {
    li.remove();
    renderCount();
  };
  if (calm) return gone();
  gsap.to(li, { opacity: 0, x: 30, height: 0, paddingTop: 0, paddingBottom: 0, duration: 0.32, ease: 'power2.in', onComplete: gone });
}

function renderList() {
  $('todoList').replaceChildren(...todoItems().map(row));
  renderCount();
}

function openTodo() {
  renderList();
  renderSync();
  $('hud').hidden = true;
  $('todo').hidden = false;
  busy = false;
  refresh();
  poll = setInterval(refresh, POLL_MS);
  if (calm) return;
  gsap.fromTo('#todo .sheet', { yPercent: 100, rotation: 2 }, { yPercent: 0, rotation: 0, duration: 0.6, ease: 'power3.out', clearProps: 'transform' });
}

function closeTodo() {
  if (busy) return;
  busy = true;
  clearInterval(poll);
  $('todoInput').blur();
  const done = () => {
    $('todo').hidden = true;
    $('hud').hidden = false;
    openMenu();
  };
  if (calm) return done();
  gsap.to('#todo .sheet', { yPercent: 105, rotation: -2, duration: 0.42, ease: 'power2.in', onComplete: done, clearProps: 'transform' });
}
