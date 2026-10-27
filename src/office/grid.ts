export type Cell = { x: number; y: number };
export const COLS = 24,
  ROWS = 22;
export const key = (p: Cell) => `${p.x},${p.y}`;
export const blocked = new Set<string>();
export function resetGrid() {
  blocked.clear();
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
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
resetGrid();
export const walkable = (p: Cell) =>
  p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS && !blocked.has(key(p));
export function canStep(from: Cell, to: Cell, allowDestination = false) {
  const dx = Math.abs(to.x - from.x),
    dy = Math.abs(to.y - from.y);
  return (
    dx <= 1 &&
    dy <= 1 &&
    dx + dy > 0 &&
    (allowDestination || walkable(to)) &&
    (!(dx && dy) ||
      (walkable({ x: from.x, y: to.y }) && walkable({ x: to.x, y: from.y })))
  );
}
export const neighbors = (p: Cell) =>
  [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ]
    .map((d) => ({ x: p.x + d.x, y: p.y + d.y }))
    .filter((next) => canStep(p, next));
export function pathfind(start: Cell, goal: Cell, allowGoal = false): Cell[] {
  if (!walkable(goal) && !allowGoal) return [];
  const open = [start],
    cost = new Map([[key(start), 0]]),
    previous = new Map<string, Cell>(),
    closed = new Set<string>();
  const heuristic = (p: Cell) => {
    const x = Math.abs(p.x - goal.x),
      y = Math.abs(p.y - goal.y);
    return Math.max(x, y) + (Math.SQRT2 - 1) * Math.min(x, y);
  };
  while (open.length) {
    open.sort(
      (a, b) =>
        cost.get(key(a))! + heuristic(a) - cost.get(key(b))! - heuristic(b),
    );
    const current = open.shift()!;
    if (closed.has(key(current))) continue;
    if (key(current) === key(goal)) {
      const result: Cell[] = [];
      let p = current;
      while (key(p) !== key(start)) {
        result.unshift(p);
        p = previous.get(key(p))!;
      }
      return result;
    }
    closed.add(key(current));
    for (const next of [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
    ]
      .map((d) => ({ x: current.x + d.x, y: current.y + d.y }))
      .filter((next) =>
        canStep(current, next, allowGoal && key(next) === key(goal)),
      )) {
      const n =
        cost.get(key(current))! +
        Math.hypot(next.x - current.x, next.y - current.y);
      if (n < (cost.get(key(next)) ?? Infinity)) {
        cost.set(key(next), n);
        previous.set(key(next), current);
        open.push(next);
      }
    }
  }
  return [];
}
