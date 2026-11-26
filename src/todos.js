import gsap from 'gsap';
import { calm, coarse } from './stage.js';
import { buzz, sfx } from './sound.js';
import { save, persist } from './store.js';

const $ = (id) => document.getElementById(id);
const MAX_ITEMS = 60;
const MAX_TEXT = 120;
const UNDO_MS = 5000;
const IDEAS = ['Birlikte kahvaltıya çıkmak', 'Film gecesi yapmak', 'Deniz kenarında yürümek', 'Yeni bir yere gitmek'];

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="todo-box" d="M4.6 5.3c4.6-.7 10.1-.8 14.9-.2.5 4.6.4 9.7-.1 14.5-4.8.5-10 .5-14.6 0-.6-4.7-.7-9.6-.2-14.3Z"/><path class="todo-tick" d="M7.2 12.4l3.6 4.2L21.2 3.9"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l1-4.2L15.6 5.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L9.2 18 5 19Z"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

const nodes = new Map();
let lastFocus = null;
let undo = null;
let undoTimer = null;
let allDone = false;

function clean(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t.text === 'string' && t.text.trim())
    .slice(0, MAX_ITEMS)
    .map((t) => ({ id: String(t.id ?? crypto.randomUUID()), text: t.text.trim().slice(0, MAX_TEXT), done: Boolean(t.done), at: Number(t.at) || Date.now() }));
}

function todos() {
  if (!Array.isArray(save.todos)) save.todos = [];
  return save.todos;
}

function commit() {
  save.todosAt = Date.now();
  persist();
}

function ordered() {
  const list = todos();
  return { open: list.filter((t) => !t.done), done: list.filter((t) => t.done) };
}

function nodeFor(todo) {
  let li = nodes.get(todo.id);
  if (li) return li;
  li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.id = todo.id;

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'todo-check';
  check.setAttribute('role', 'checkbox');
  check.innerHTML = ICON_CHECK;
  check.onclick = () => toggle(todo.id);

  const text = document.createElement('span');
  text.className = 'todo-text';
  text.onclick = () => toggle(todo.id);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'todo-act todo-edit-btn';
  edit.setAttribute('aria-label', 'Düzenle');
  edit.innerHTML = ICON_EDIT;
  edit.onclick = () => startEdit(todo.id);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'todo-act';
  del.setAttribute('aria-label', 'Sil');
  del.innerHTML = ICON_DELETE;
  del.onclick = () => remove(todo.id);

  li.append(check, text, edit, del);
  nodes.set(todo.id, li);
  return li;
}

function paint(li, todo) {
  li.classList.toggle('done', todo.done);
  const check = li.querySelector('.todo-check');
  check.setAttribute('aria-checked', String(todo.done));
  check.setAttribute('aria-label', todo.done ? `${todo.text}, yapıldı` : todo.text);
  const text = li.querySelector('.todo-text');
  if (text && text.textContent !== todo.text) text.textContent = todo.text;
}

function render({ animate = true, fresh = null } = {}) {
  const { open, done } = ordered();
  const total = open.length + done.length;
  const before = new Map();
  if (animate && !calm) nodes.forEach((li, id) => li.isConnected && before.set(id, li.getBoundingClientRect().top));

  const alive = new Set(todos().map((t) => t.id));
  nodes.forEach((li, id) => {
    if (!alive.has(id)) {
      li.remove();
      nodes.delete(id);
    }
  });

  const fill = (ul, list) => {
    list.forEach((todo, i) => {
      const li = nodeFor(todo);
      paint(li, todo);
      if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] ?? null);
    });
    while (ul.children.length > list.length) ul.lastElementChild.remove();
  };
  fill($('todoList'), open);
  fill($('todoDone'), done);

  $('todoDoneBlock').hidden = done.length === 0;
  $('todoDoneCount').textContent = done.length;
  $('todoEmpty').hidden = total > 0;
  $('todoClear').hidden = done.length === 0;
  $('todoTally').textContent = total === 0 ? 'Henüz madde yok' : done.length === total ? `${total} maddenin hepsi tamam` : `${total} maddeden ${done.length} tanesi tamam`;
  $('todoMeter').style.transform = `scaleX(${total ? done.length / total : 0})`;
  $('todoInput').disabled = total >= MAX_ITEMS;
  $('todoAdd').disabled = total >= MAX_ITEMS;
  $('todoInput').placeholder = total >= MAX_ITEMS ? 'Liste dolu, yapılanları temizle' : 'Birlikte ne yapalım?';
  badge(open.length);
  stamp(total > 0 && done.length === total);

  if (!animate || calm) return;
  nodes.forEach((li, id) => {
    if (id === fresh) {
      gsap.fromTo(li, { opacity: 0, y: -10, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(2)', clearProps: 'all' });
      return;
    }
    const top = before.get(id);
    if (top === undefined) return;
    const dy = top - li.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) gsap.fromTo(li, { y: dy }, { y: 0, duration: 0.38, ease: 'power3.out', clearProps: 'transform' });
  });
}

function badge(count) {
  const el = $('todoBadge');
  el.hidden = count === 0;
  el.textContent = count > 9 ? '9+' : count;
  $('todoBtn').setAttribute('aria-label', count ? `Yapılacaklar listesi, ${count} madde bekliyor` : 'Yapılacaklar listesi');
}

function stamp(on) {
  const el = $('todoStamp');
  if (on === allDone) return;
  allDone = on;
  gsap.killTweensOf(el);
  if (on) {
    if ($('todo').hidden || calm) {
      gsap.set(el, { opacity: 0.9, scale: 1, rotation: 12 });
      return;
    }
    sfx.win();
    buzz([12, 40, 12]);
    gsap.fromTo(el, { opacity: 0, scale: 2.6, rotation: -6 }, { opacity: 0.9, scale: 1, rotation: 12, duration: 0.26, delay: 0.18, ease: 'power4.in' });
    gsap.fromTo('#todoSheet', { x: 0 }, { keyframes: { x: [-5, 4, -2, 0] }, duration: 0.32, delay: 0.42, ease: 'power1.out', clearProps: 'transform' });
  } else {
    gsap.to(el, { opacity: 0, scale: 0.8, duration: 0.18 });
  }
}

function add(raw) {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!text) {
    nudge($('todoForm'));
    return false;
  }
  const list = todos();
  const same = list.find((t) => !t.done && t.text.toLocaleLowerCase('tr-TR') === text.toLocaleLowerCase('tr-TR'));
  if (same) {
    nudge(nodes.get(same.id));
    return true;
  }
  if (list.length >= MAX_ITEMS) return false;
  const todo = { id: crypto.randomUUID(), text, done: false, at: Date.now() };
  list.unshift(todo);
  commit();
  render({ fresh: todo.id });
  sfx.drop();
  buzz(8);
  $('todoScroll').scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  return true;
}

function nudge(el) {
  if (!el || calm) return;
  gsap.fromTo(el, { x: 0 }, { keyframes: { x: [-8, 7, -4, 2, 0] }, duration: 0.36, ease: 'power1.out', clearProps: 'transform' });
}

function toggle(id) {
  const todo = todos().find((t) => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  todo.at = Date.now();
  commit();
  const li = nodes.get(id);
  if (todo.done) {
    sfx.snap();
    buzz(10);
    if (li && !calm) {
      li.classList.add('just');
      gsap.fromTo(li.querySelector('.todo-check'), { scale: 0.7 }, { scale: 1, duration: 0.42, ease: 'back.out(4)', clearProps: 'transform' });
    }
  } else {
    sfx.pick();
    li?.classList.remove('just');
  }
  if (calm || !li) {
    render({ animate: false });
    return;
  }
  // İşaret ve çizgi görünsün, sonra madde yerine kaysın.
  paint(li, todo);
  gsap.delayedCall(todo.done ? 0.42 : 0.12, () => render());
}

function remove(id) {
  const list = todos();
  const index = list.findIndex((t) => t.id === id);
  if (index < 0) return;
  const [todo] = list.splice(index, 1);
  commit();
  sfx.drop();
  offerUndo([{ todo, index }], 'Madde silindi');
  collapse([nodes.get(id)], () => render({ animate: false }));
}

function clearDone() {
  const list = todos();
  const gone = [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].done) gone.unshift({ todo: list.splice(i, 1)[0], index: i });
  if (!gone.length) return;
  commit();
  sfx.sweep();
  offerUndo(gone, gone.length === 1 ? 'Yapılan madde temizlendi' : `${gone.length} yapılan madde temizlendi`);
  collapse(gone.map((g) => nodes.get(g.todo.id)), () => render({ animate: false }));
}

function collapse(items, done) {
  const els = items.filter(Boolean);
  if (calm || !els.length) {
    done();
    return;
  }
  els.forEach((li) => (li.style.pointerEvents = 'none'));
  gsap
    .timeline({ onComplete: done })
    .to(els, { opacity: 0, x: 24, duration: 0.18, ease: 'power2.in', stagger: 0.03 })
    .to(els, { height: 0, paddingTop: 0, paddingBottom: 0, borderTopWidth: 0, minHeight: 0, duration: 0.22, ease: 'power2.inOut' });
  // Kaybolan satırın stilleri, geri alınırsa yeniden oluşsun diye düğüm atılır.
  els.forEach((li) => nodes.delete(li.dataset.id));
  gsap.delayedCall(0.5, () => els.forEach((li) => li.remove()));
}

function offerUndo(entries, message) {
  clearTimeout(undoTimer);
  undo = entries;
  $('todoUndoText').textContent = message;
  const bar = $('todoUndo');
  const wasHidden = bar.hidden;
  bar.hidden = false;
  if (wasHidden && !calm) gsap.fromTo(bar, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'back.out(2)' });
  undoTimer = setTimeout(hideUndo, UNDO_MS);
}

function hideUndo() {
  clearTimeout(undoTimer);
  undo = null;
  const bar = $('todoUndo');
  if (bar.hidden) return;
  if (calm) {
    bar.hidden = true;
    return;
  }
  gsap.to(bar, { y: 12, opacity: 0, duration: 0.18, onComplete: () => (bar.hidden = true) });
}

function restore() {
  if (!undo) return;
  const list = todos();
  for (const { todo, index } of undo) {
    if (list.length >= MAX_ITEMS) break;
    if (!list.some((t) => t.id === todo.id)) list.splice(Math.min(index, list.length), 0, todo);
  }
  const ids = undo.map((u) => u.todo.id);
  commit();
  hideUndo();
  sfx.pick();
  render({ animate: false });
  if (!calm) ids.forEach((id) => nodes.get(id) && gsap.fromTo(nodes.get(id), { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.28, ease: 'power3.out', clearProps: 'all' }));
}

function startEdit(id) {
  const todo = todos().find((t) => t.id === id);
  const li = nodes.get(id);
  if (!todo || !li || li.querySelector('.todo-field')) return;
  const span = li.querySelector('.todo-text');
  const field = document.createElement('input');
  field.className = 'todo-field';
  field.type = 'text';
  field.maxLength = MAX_TEXT;
  field.value = todo.text;
  field.enterKeyHint = 'done';
  field.setAttribute('aria-label', 'Maddeyi düzenle');
  li.classList.add('editing');
  span.replaceWith(field);
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);

  let finished = false;
  const finish = (keep) => {
    if (finished) return;
    finished = true;
    const text = field.value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (keep && text && text !== todo.text) {
      todo.text = text;
      commit();
      sfx.snap();
    }
    li.classList.remove('editing');
    field.replaceWith(span);
    paint(li, todo);
    li.querySelector('.todo-edit-btn').focus({ preventScroll: true });
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  });
  field.addEventListener('blur', () => finish(true));
}

function suggestions() {
  $('todoIdeas').replaceChildren(
    ...IDEAS.map((idea) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = idea;
      button.onclick = () => add(idea);
      return button;
    }),
  );
}

export function openTodos() {
  const box = $('todo');
  if (!box.hidden) return;
  lastFocus = document.activeElement;
  render({ animate: false });
  box.hidden = false;
  $('todoBtn').setAttribute('aria-expanded', 'true');
  if (!calm) {
    gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo('#todoSheet', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
  }
  if (coarse) $('todoSheet').focus({ preventScroll: true });
  else $('todoInput').focus({ preventScroll: true });
}

export function closeTodos() {
  const box = $('todo');
  if (box.hidden) return;
  document.activeElement?.blur();
  hideUndo();
  $('todoBtn').setAttribute('aria-expanded', 'false');
  const done = () => {
    box.hidden = true;
    gsap.set([box, '#todoSheet'], { clearProps: 'opacity,transform' });
    (lastFocus?.isConnected ? lastFocus : $('todoBtn')).focus?.({ preventScroll: true });
  };
  if (calm) done();
  else gsap.to(box, { opacity: 0, duration: 0.16, onComplete: done });
}

export function refreshTodos() {
  save.todos = clean(save.todos);
  render({ animate: false });
}

export function initTodos() {
  save.todos = clean(save.todos);
  suggestions();
  render({ animate: false });

  $('todoBtn').onclick = openTodos;
  $('todoClose').onclick = closeTodos;
  $('todoClear').onclick = clearDone;
  $('todoUndoBtn').onclick = restore;
  $('todoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('todoInput');
    if (add(input.value)) input.value = '';
    if (!coarse) input.focus();
  });

  const box = $('todo');
  box.addEventListener('pointerdown', (e) => {
    if (e.target === box) closeTodos();
  });
  // Yazarken ok tuşları arkadaki kutuları kaydırmasın, Escape yalnızca bu paneli kapatsın.
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeTodos();
    if (e.key === 'Tab') trap(e);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) closeTodos();
  });
}

function trap(e) {
  const focusable = [...$('todoSheet').querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === $('todoSheet'))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
