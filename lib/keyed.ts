// Stable identities for editable lists.
//
// Array index is not a usable React key for a list you can reorder or delete
// from: React matches children by key, so swapping two blocks keeps the old DOM
// nodes and swaps their props underneath. The values redraw correctly (the
// inputs are controlled) but focus and caret position stay behind, so the caret
// jumps to a different field mid-edit. Attaching an id at creation time and
// letting it travel with the item fixes that.
//
// Ids live in a wrapper rather than on the item itself, so the shape posted to
// the server stays exactly the GuideBlock/GuideFaq the schema expects.

export type Keyed<T> = { key: string; value: T };

let counter = 0;
export const newKey = () => `k${++counter}`;

export const keyed = <T>(value: T): Keyed<T> => ({ key: newKey(), value });
export const keyAll = <T>(values: T[]): Keyed<T>[] => values.map(keyed);
export const unkey = <T>(items: Keyed<T>[]): T[] => items.map((i) => i.value);

export const replaceAt = <T>(items: Keyed<T>[], i: number, value: T): Keyed<T>[] =>
  items.map((it, j) => (j === i ? { ...it, value } : it));

export const removeAt = <T>(items: Keyed<T>[], i: number): Keyed<T>[] =>
  items.filter((_, j) => j !== i);

/** Swaps two entries, carrying their keys with them so identity is preserved. */
export const swap = <T>(items: Keyed<T>[], a: number, b: number): Keyed<T>[] => {
  if (a < 0 || b < 0 || a >= items.length || b >= items.length) return items;
  const next = [...items];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};
