export type Cell = { x: number; y: number };
export const COLS = 24,
  ROWS = 22;
export const key = (p: Cell) => `${p.x},${p.y}`;
export const blocked = new Set<string>();
// Doorways connect every room to the central circulation space.
for (let y = 0; y < ROWS; y++)
  for (let x = 0; x < COLS; x++) {
    if (
      x === 0 ||
      y === 0 ||
      x === COLS - 1 ||
      y === ROWS - 1 ||
      ((x === 8 || x === 15) && ![5, 10, 17].includes(y)) ||
      ((y === 8 || y === 14) && ![4, 11, 19].includes(x))
    )
      blocked.add(key({ x, y }));
  }
export const walkable = (p: Cell) =>
  p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS && !blocked.has(key(p));
export function pathfind(start: Cell, goal: Cell): Cell[] {
  if (!walkable(goal)) return [];
  const open = [start],
    cost = new Map([[key(start), 0]]),
    previous = new Map<string, Cell>();
  const h = (p: Cell) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  while (open.length) {
    open.sort((a, b) => cost.get(key(a))! + h(a) - (cost.get(key(b))! + h(b)));
    const current = open.shift()!;
    if (key(current) === key(goal)) {
      const result: Cell[] = [];
      let p = current;
      while (key(p) !== key(start)) {
        result.unshift(p);
        p = previous.get(key(p))!;
      }
      return result;
    }
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const next = { x: current.x + d.x, y: current.y + d.y },
        n = cost.get(key(current))! + 1;
      if (walkable(next) && n < (cost.get(key(next)) ?? Infinity)) {
        cost.set(key(next), n);
        previous.set(key(next), current);
        open.push(next);
      }
    }
  }
  return [];
}
