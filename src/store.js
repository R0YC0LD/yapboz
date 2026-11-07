const KEY = 'yapboz-kayit-1';

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { kisses: 0, earned: stored.kisses ?? 0, puzzles: {}, coupons: [], ...stored };
  } catch {
    return { kisses: 0, earned: 0, puzzles: {}, coupons: [] };
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
