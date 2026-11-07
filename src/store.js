const KEY = 'yapboz-kayit-2';
export const SAVE_VERSION = 2;

function load() {
  try {
    localStorage.removeItem('yapboz-kayit-1');
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { v: SAVE_VERSION, kisses: 0, earned: 0, puzzles: {}, coupons: [], ...stored };
  } catch {
    return { v: SAVE_VERSION, kisses: 0, earned: 0, puzzles: {}, coupons: [] };
  }
}

export const save = load();

let afterPersist = () => {};

export function onPersist(fn) {
  afterPersist = fn;
}

export function persist() {
  afterPersist();
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Gizli sekmede kayıt tutulamaz, oyun yine de çalışır.
  }
}

export function puzzleState(id) {
  return (save.puzzles[id] ??= { placed: [], finished: 0 });
}

// Parça numarası ızgaraya bağlı. Izgara değişince yarım kalan kutu sıfırlanır, öpücükler durur.
export function alignGrids(puzzles) {
  for (const p of puzzles) {
    const state = puzzleState(p.id);
    const grid = `${p.cols}x${p.rows}`;
    if (state.grid !== grid) {
      state.grid = grid;
      state.placed = [];
    }
  }
  persist();
}
