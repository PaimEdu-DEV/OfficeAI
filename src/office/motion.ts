import type { Cell } from "./grid";
/** One continuous integrator. Unused frame time crosses waypoint boundaries. */
export class GridMotion {
  position: Cell;
  cell: Cell;
  target?: Cell;
  path: Cell[] = [];
  speed = 3.2;
  private segmentFrom: Cell;
  constructor(cell: Cell) {
    this.position = { ...cell };
    this.cell = { ...cell };
    this.segmentFrom = { ...cell };
  }
  get moving() {
    return !!this.target || this.path.length > 0;
  }
  get direction() {
    return this.target
      ? {
          x: Math.sign(this.target.x - this.segmentFrom.x),
          y: Math.sign(this.target.y - this.segmentFrom.y),
        }
      : undefined;
  }
  /** Finish the current valid segment, then follow the most recent click. */
  replace(path: Cell[]) {
    this.path = path.map((p) => ({ ...p }));
  }
  advance(
    seconds: number,
    allowed: (from: Cell, to: Cell) => boolean,
    nextManual?: () => Cell | undefined,
  ) {
    let budget = Math.max(0, Math.min(seconds, 0.1)) * this.speed;
    const acquire = () => {
      if (this.target) return true;
      const next = this.path[0] ?? nextManual?.();
      if (!next || !allowed(this.cell, next)) return false;
      if (this.path.length) this.path.shift();
      this.segmentFrom = { ...this.cell };
      this.target = { ...next };
      return true;
    };
    while (budget > 1e-9 && acquire()) {
      const dx = this.target!.x - this.position.x,
        dy = this.target!.y - this.position.y,
        distance = Math.hypot(dx, dy);
      if (distance <= budget + 1e-9) {
        this.position = { ...this.target! };
        this.cell = { ...this.target! };
        this.target = undefined;
        budget -= distance;
      } else {
        this.position.x += (dx / distance) * budget;
        this.position.y += (dy / distance) * budget;
        budget = 0;
      }
    }
    // Prime the next segment even when the frame ends exactly on a tile center.
    acquire();
  }
}
