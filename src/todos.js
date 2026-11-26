import { SUPABASE_KEY, SUPABASE_URL } from './backend.js';

const KEY = 'yapboz-liste-1';
const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY) && !import.meta.env.VITE_OFFLINE;

let vault = null;
let items = [];
let queue = [];
let listener = () => {};
let syncing = null;
export const sync = { online: true, at: 0 };

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ items: items.map(({ text, ...kept }) => kept), queue }));
  } catch {
    // Gizli sekmede liste yalnızca bu oturumda kalır.
  }
}

async function readable(list) {
  const out = [];
  for (const item of list) {
    try {
      out.push({ ...item, text: await vault.unseal(item.sealed) });
    } catch {
      // Başka bir parolayla yazılmış ya da bozuk madde gösterilmez.
    }
  }
  return out;
}

export async function initTodos(unlocked, onChange) {
  vault = unlocked;
  listener = onChange;
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    queue = cached.queue ?? [];
    items = await readable(cached.items ?? []);
  } catch {
    items = [];
    queue = [];
  }
  if (enabled) {
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
  }
}

export const todoItems = () => items;

export async function addTodo(text) {
  const item = { id: crypto.randomUUID(), sealed: await vault.seal(text), text, doneAt: null, createdAt: new Date().toISOString() };
  items.push(item);
  queue.push({ op: 'add', id: item.id });
  store();
  listener(true);
  refresh();
  return item;
}

export function markTodo(id, done) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.doneAt = done ? new Date().toISOString() : null;
  queue.push({ op: 'mark', id, done });
  store();
  refresh();
}

export function removeTodo(id) {
  items = items.filter((i) => i.id !== id);
  queue.push({ op: 'remove', id });
  store();
  refresh();
}

async function flush() {
  while (queue.length) {
    const step = queue[0];
    if (step.op === 'add') {
      const item = items.find((i) => i.id === step.id);
      if (item) await rpc('todo_add', { p_id: item.id, p_sealed: item.sealed, p_created: item.createdAt });
    } else if (step.op === 'mark') {
      await rpc('todo_mark', { p_id: step.id, p_done: step.done });
    } else {
      await rpc('todo_remove', { p_id: step.id });
    }
    queue.shift();
    store();
  }
}

// Önce bekleyen değişiklikler gönderilir, sonra iki telefonun ortak listesi sunucudan alınır.
export function refresh() {
  if (!enabled || !vault) return Promise.resolve();
  syncing ??= (async () => {
    try {
      await flush();
      const remote = await rpc('todo_list', {});
      const known = new Map(items.map((i) => [i.id, i]));
      const fresh = await readable(
        remote.filter((r) => !known.has(r.id) || known.get(r.id).sealed !== r.sealed).map((r) => ({ id: r.id, sealed: r.sealed })),
      );
      const texts = new Map(fresh.map((i) => [i.id, i.text]));
      const next = [];
      for (const r of remote) {
        const text = texts.get(r.id) ?? known.get(r.id)?.text;
        if (text == null) continue;
        next.push({ id: r.id, sealed: r.sealed, text, doneAt: r.done_at, createdAt: r.created_at });
      }
      const changed =
        next.length !== items.length || next.some((n, i) => n.id !== items[i].id || Boolean(n.doneAt) !== Boolean(items[i].doneAt));
      if (!queue.length) {
        items = next;
        store();
      }
      sync.online = true;
      sync.at = Date.now();
      listener(changed);
    } catch (err) {
      console.warn(err);
      sync.online = false;
      listener(false);
    } finally {
      syncing = null;
    }
    if (queue.length && sync.online) refresh();
  })();
  return syncing;
}
