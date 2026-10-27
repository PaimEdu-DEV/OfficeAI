import Phaser from "phaser";
import { blocked, Cell, COLS, ROWS, key } from "./grid";
import type { Prop } from "./art";
export interface Seat {
  cell: Cell;
  direction: number;
}
export function drawOffice(
  scene: Phaser.Scene,
  seats: Map<string, Seat>,
  ambient: { sprite: Phaser.GameObjects.Image; kind: string; offset: number }[],
) {
  const iso = (p: Cell) => ({ x: (p.x - p.y) * 32, y: (p.x + p.y) * 16 + 16 });
  const occupy = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) blocked.add(key({ x: xx, y: yy }));
  };
  const prop = (kind: Prop, x: number, y: number, solid = true) => {
    const seat =
      kind === "chair" || kind === "chairReverse" || kind === "gamer";
    if (solid || seat) blocked.add(key({ x, y }));
    const p = iso({ x, y });
    const image = scene.add
      .image(p.x, p.y, `prop-${kind}-0`)
      .setOrigin(0.5, 148 / 192)
      .setDepth(p.y + (kind === "chairReverse" ? 0.75 : 0.1));
    if (kind === "server" || kind === "coffee")
      ambient.push({ sprite: image, kind, offset: x + y });
    if (seat) {
      seats.set(key({ x, y }), {
        cell: { x, y },
        direction: kind === "chairReverse" ? 6 : 2,
      });
      image.setData("seat", key({ x, y }));
      image.setInteractive({
        pixelPerfect: true,
        alphaTolerance: 100,
        useHandCursor: true,
      });
    }
    return image;
  };
  // Floor sprites stay below the y-sorted wall, furniture and character layers.
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const p = iso({ x, y });
      let material = "cream";
      if (x < 8) material = y < 8 ? "wood" : y < 14 ? "lilac" : "wood";
      else if (x > 15) material = y < 8 ? "wood" : y < 14 ? "mint" : "wood";
      if (x > 1 && x < 7 && y > 2 && y < 7) material = "coral";
      if (x > 16 && x < 22 && y > 2 && y < 7) material = "blue";
      if (x > 8 && x < 15 && y < 8) material = "cream";
      scene.add
        .image(p.x, p.y - 16, `floor-${material}-${(x + y) % 3}`)
        .setOrigin(0.5, 0)
        .setDepth(-2000);
      // Thick foundation visible along the cutaway edges.
      if (y === ROWS - 1 || x === COLS - 1)
        scene.add
          .image(p.x, p.y, `wall-cream-${x === COLS - 1 ? "y" : "x"}-8`)
          .setOrigin(0.5, 148 / 192)
          .setDepth(-1900);
    }
  const wall = (x: number, y: number, axis: "x" | "y", height: number) => {
    const p = iso({ x, y }),
      color = x < 8 ? "coral" : x < 15 ? "mint" : "blue";
    scene.add
      .image(p.x, p.y, `wall-${color}-${axis}-${height}`)
      .setOrigin(0.5, 148 / 192)
      .setDepth(p.y + (axis === "x" ? 0.01 : 0));
  };
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (blocked.has(key({ x, y }))) {
        // Both rear boundaries are uninterrupted, including divider intersections.
        // Draw both perpendicular pieces at the common corner to close the L joint.
        if (y === 0) wall(x, y, "x", 76);
        if (x === 0) wall(x, y, "y", 76);
        if (x === 0 || y === 0) continue;
        const axis = x === 8 || x === 15 || x === COLS - 1 ? "y" : "x";
        wall(x, y, axis, x === COLS - 1 || y === ROWS - 1 ? 8 : 28);
      }
  prop("books", 2, 1);
  prop("window", 5, 0, false);
  prop("picture", 1, 2, false);
  prop("executive", 4, 4);
  occupy(3, 3, 3, 2);
  prop("chair", 4, 5, false);
  prop("plant", 1, 6);
  prop("lamp", 7, 2);
  prop("plant", 7, 7);
  prop("logo", 11, 0, false);
  prop("window", 13, 0, false);
  prop("sofa", 11, 2);
  occupy(10, 2, 3, 1);
  prop("reception", 11, 4);
  occupy(10, 4, 3, 1);
  prop("water", 14, 6);
  prop("plant", 9, 1);
  prop("coffeeTable", 12, 6);
  prop("devdesk", 19, 4);
  occupy(18, 3, 3, 2);
  prop("gamer", 19, 5, false);
  prop("server", 21, 1);
  prop("server", 22, 1);
  prop("server", 22, 4);
  prop("books", 17, 1);
  prop("window", 19, 0, false);
  prop("plant", 17, 6);
  prop("conference", 4, 11);
  occupy(3, 11, 3, 1);
  for (const x of [3, 4, 5]) {
    prop("chair", x, 10);
    prop("chairReverse", x, 12);
  }
  prop("tv", 4, 8, false);
  prop("whiteboard", 1, 9, false);
  prop("plant", 7, 13);
  prop("sofa", 18, 10);
  occupy(17, 10, 3, 1);
  prop("sofa", 21, 12);
  occupy(20, 12, 3, 1);
  prop("coffeeTable", 19, 11);
  prop("coffee", 22, 9);
  prop("arcade", 16, 12);
  prop("plant", 22, 13);
  prop("picture", 18, 8, false);
  prop("lamp", 13, 9);
  prop("lamp", 9, 13);
  prop("plant", 13, 17);
  prop("sofa", 11, 19);
  prop("coffeeTable", 11, 18);
  prop("boxes", 2, 16);
  prop("plant", 7, 20);
  prop("lamp", 1, 19);
  prop("boxes", 21, 16);
  prop("plant", 17, 20);
  prop("lamp", 22, 19);
  // Window light is a translucent raster decal, generated once.
  for (const cell of [
    { x: 5, y: 1 },
    { x: 19, y: 1 },
    { x: 13, y: 1 },
  ]) {
    const p = iso(cell);
    scene.add
      .image(p.x, p.y, "sunlight")
      .setOrigin(0.5, 148 / 192)
      .setDepth(-1800);
  }
}
