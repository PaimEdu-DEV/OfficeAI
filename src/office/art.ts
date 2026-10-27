import Phaser from "phaser";
import {
  Pixels,
  Palette,
  WOOD,
  DARKWOOD,
  CREAM,
  INK,
  MINT,
  CORAL,
  BLUE,
  OUTLINE,
  write,
  labelTexture,
} from "./pixels";
export type Prop =
  | "executive"
  | "devdesk"
  | "chair"
  | "gamer"
  | "books"
  | "plant"
  | "server"
  | "sofa"
  | "coffeeTable"
  | "coffee"
  | "arcade"
  | "reception"
  | "water"
  | "conference"
  | "tv"
  | "whiteboard"
  | "window"
  | "picture"
  | "lamp"
  | "logo"
  | "boxes";
const point = (x: number, y: number, z: number) => [
  96 + x - y,
  148 + (x + y) / 2 - z,
];
function screen(p: Pixels, x: number, y: number, z: number, w = 18, h = 17) {
  p.box(x, y, w, 3, z, h, INK);
  const face = (a: number, b: number) => point(a, y + 4, b);
  p.poly(
    [
      face(x + 2, z + 2),
      face(x + w - 2, z + 2),
      face(x + w - 2, z + h - 2),
      face(x + 2, z + h - 2),
    ],
    "#18364b",
  );
  for (let row = 0; row < 4; row++) {
    const a = face(x + 3 + (row % 2) * 2, z + h - 5 - row * 3),
      b = face(x + w - 4, z + h - 5 - row * 3);
    p.line(
      a[0],
      a[1],
      b[0],
      b[1],
      ["#8cf4d0", "#f5c979", "#91bff5", "#e697c0"][row],
    );
  }
  p.box(x + w / 2 - 2, y + 1, 4, 6, z - 5, 5, INK);
}
function chair(p: Pixels, color: Palette, gamer = false) {
  p.box(-10, -8, 20, 18, 12, 5, color);
  p.box(-10, -10, 20, 4, 16, gamer ? 29 : 22, color);
  p.box(-9, -6, 3, 17, 18, 4, INK);
  p.box(7, -6, 3, 17, 18, 4, INK);
  p.box(-3, -2, 5, 5, 1, 11, INK);
  p.box(-12, -1, 25, 3, 1, 3, INK);
  p.box(-2, -10, 3, 23, 1, 3, INK);
  if (gamer) {
    p.box(-7, -9, 3, 3, 20, 20, CREAM);
    p.box(5, -9, 3, 3, 20, 20, CREAM);
  }
}
export function propPixels(kind: Prop, frame = 0): Pixels {
  const p = new Pixels(192, 192);
  p.ellipse(96, 153, 35, 12, "#404156", 18);
  p.ellipse(96, 153, 29, 9, "#404156", 20);
  const box = (
    x: number,
    y: number,
    w: number,
    d: number,
    z: number,
    h: number,
    c: Palette,
  ) => p.box(x, y, w, d, z, h, c);
  if (kind === "executive" || kind === "devdesk") {
    const pal = kind === "executive" ? DARKWOOD : CREAM;
    box(-30, -15, 8, 29, 0, 25, pal);
    box(22, -15, 8, 29, 0, 25, pal);
    box(-32, -18, 64, 36, 25, 4, pal);
    for (let i = 0; i < 3; i++) screen(p, -26 + i * 18, -12, 34, 16, 18);
    box(-11, 2, 23, 8, 29, 1, INK);
    for (let i = 0; i < 9; i++) {
      const a = point(-9 + i * 2, 3, 31),
        b = point(-9 + i * 2, 8, 31);
      p.line(a[0], a[1], b[0], b[1], "#a9bbca");
    }
    box(19, 1, 6, 7, 29, 1, BLUE);
    box(-26, 5, 8, 8, 29, 6, CORAL);
    for (let z = 5; z < 22; z += 8) {
      const a = point(-29, 15, z),
        b = point(-23, 15, z);
      p.line(a[0], a[1], b[0], b[1], "#f0c88a");
    }
    if (kind === "devdesk") {
      const a = point(20, -11, 1),
        b = point(26, 5, 1),
        c = point(13, 16, 1);
      p.line(a[0], a[1], b[0], b[1], "#3c4653");
      p.line(b[0], b[1], c[0], c[1], "#3c4653");
    }
  } else if (kind === "chair" || kind === "gamer")
    chair(
      p,
      kind === "chair"
        ? { top: "#a57462", left: "#714b45", right: "#533b3a" }
        : MINT,
      kind === "gamer",
    );
  else if (kind === "books") {
    box(-25, -8, 50, 17, 0, 65, DARKWOOD);
    for (let shelf = 0; shelf < 3; shelf++) {
      box(-22, -3, 44, 14, 4 + shelf * 19, 2, WOOD);
      for (let b = 0; b < 8; b++) {
        const color = [CORAL, BLUE, MINT, CREAM][(b + shelf) % 4];
        box(-21 + b * 5, -1, 4, 10, 7 + shelf * 19, 10 + (b % 3) * 2, color);
      }
    }
    box(-27, -9, 54, 20, 65, 3, WOOD);
  } else if (kind === "plant") {
    box(-10, -10, 20, 20, 0, 15, CORAL);
    box(-12, -12, 24, 24, 15, 3, CREAM);
    box(-9, -9, 18, 18, 18, 1, DARKWOOD);
    const leaves = [
      [0, -29, 9, 15],
      [-11, -21, 11, 6],
      [10, -25, 12, 7],
      [-9, -36, 7, 12],
      [8, -40, 7, 10],
    ];
    p.line(96, 132, 97, 104, "#436f45");
    leaves.forEach(([x, y, w, h], i) => {
      p.ellipse(96 + x, 132 + y, w, h, OUTLINE);
      p.ellipse(96 + x, 131 + y, w - 1, h - 1, i % 2 ? "#68b96f" : "#93d776");
      p.line(96 + x, 132 + y, 97, 114, "#3b8d59");
    });
  } else if (kind === "server") {
    box(-13, -10, 26, 20, 0, 65, INK);
    for (let i = 0; i < 5; i++) {
      box(-10, 9, 20, 2, 7 + i * 11, 8, {
        top: "#7b8e9d",
        left: "#384e63",
        right: "#26394d",
      });
      const a = point(-7, 12, 11 + i * 11);
      p.rect(a[0], a[1], 2, 2, (i + frame) % 3 ? "#83f9b7" : "#ffca70");
      const b = point(1, 12, 11 + i * 11);
      p.line(b[0], b[1], b[0] + 5, b[1] + 2, "#152c40");
    }
  } else if (kind === "sofa") {
    box(-28, -12, 56, 26, 0, 7, DARKWOOD);
    box(-29, -15, 58, 6, 7, 25, BLUE);
    box(-30, -12, 8, 29, 7, 20, BLUE);
    box(22, -12, 8, 29, 7, 20, BLUE);
    box(-21, -8, 21, 22, 7, 8, {
      top: "#acdff2",
      left: "#78b6d5",
      right: "#5899b8",
    });
    box(1, -8, 21, 22, 7, 8, {
      top: "#acdff2",
      left: "#78b6d5",
      right: "#5899b8",
    });
    box(-16, -6, 10, 6, 17, 9, CORAL);
  } else if (kind === "coffeeTable") {
    box(-21, -10, 5, 20, 0, 13, DARKWOOD);
    box(16, -10, 5, 20, 0, 13, DARKWOOD);
    box(-24, -13, 48, 26, 13, 3, WOOD);
    box(-8, -5, 17, 11, 16, 1, CORAL);
    box(11, 1, 5, 6, 16, 5, CREAM);
  } else if (kind === "coffee") {
    box(-18, -13, 36, 26, 0, 28, WOOD);
    box(-20, -15, 40, 30, 28, 3, CREAM);
    box(-13, -10, 23, 18, 31, 25, INK);
    box(-11, 8, 19, 3, 40, 13, INK);
    box(-7, 9, 11, 5, 33, 2, CREAM);
    box(-3, 9, 5, 5, 35, 6, CREAM);
    box(-12, -10, 21, 17, 56, 3, CORAL);
    const a = point(-2, 14, 44);
    p.line(a[0], a[1], a[0] + 3, a[1] - 4, "#e1f2e6");
    p.line(a[0] + 3, a[1] - 5, a[0] + (frame % 3), a[1] - 9, "#f7fff4");
  } else if (kind === "arcade") {
    box(-16, -12, 32, 25, 0, 35, CORAL);
    box(-16, -12, 32, 18, 35, 27, INK);
    box(-18, -14, 36, 22, 62, 9, CORAL);
    screen(p, -12, 5, 40, 24, 19);
    box(-17, 6, 34, 13, 32, 4, BLUE);
    const a = point(3, 12, 38);
    p.rect(a[0], a[1], 3, 3, "#ffcf65");
    const b = point(-6, 12, 38);
    p.line(b[0], b[1], b[0], b[1] - 5);
    p.rect(b[0] - 1, b[1] - 6, 3, 3, "#eb7775");
  } else if (kind === "reception") {
    box(-35, -16, 70, 32, 0, 32, MINT);
    box(-38, -19, 76, 38, 32, 5, WOOD);
    screen(p, -11, -10, 42, 23, 17);
    box(23, 7, 7, 8, 37, 4, CORAL);
  } else if (kind === "water") {
    box(-11, -10, 22, 20, 0, 35, CREAM);
    box(-9, -8, 18, 16, 35, 21, BLUE);
    box(-7, -6, 14, 12, 56, 3, {
      top: "#d6f8ff",
      left: "#a5d5e5",
      right: "#80b7cb",
    });
    box(-7, 10, 14, 2, 16, 11, INK);
    const a = point(-4, 13, 28);
    p.pixel(a[0], a[1], "#e47065");
    p.pixel(a[0] + 7, a[1] + 3, "#6aa7e9");
  } else if (kind === "conference") {
    box(-38, -14, 7, 28, 0, 24, DARKWOOD);
    box(31, -14, 7, 28, 0, 24, DARKWOOD);
    box(-44, -20, 88, 40, 24, 5, WOOD);
    for (const x of [-25, 0, 25]) {
      box(x - 6, -4, 12, 8, 29, 1, CREAM);
      box(x + 2, 8, 4, 4, 29, 4, BLUE);
    }
  } else if (kind === "tv") screen(p, -31, -8, 41, 62, 35);
  else if (kind === "whiteboard") {
    box(-29, -7, 58, 5, 28, 39, INK);
    box(-27, -1, 54, 1, 30, 35, CREAM);
    for (let i = 0; i < 4; i++) {
      const a = point(-22, -0, 58 - i * 6),
        b = point(15 - (i % 2) * 9, 0, 58 - i * 6);
      p.line(
        a[0],
        a[1],
        b[0],
        b[1],
        ["#df887d", "#6baa9b", "#749abc", "#ccac58"][i],
      );
    }
    box(-30, -2, 60, 9, 27, 2, INK);
  } else if (kind === "window") {
    box(-27, -9, 54, 5, 27, 48, CREAM);
    const v = (x: number, z: number) => point(x, -3, z);
    p.poly([v(-23, 31), v(23, 31), v(23, 71), v(-23, 71)], "#bceaf2", OUTLINE);
    p.poly([v(-21, 33), v(-10, 33), v(19, 69), v(7, 69)], "#e8fcf9");
    const a = v(0, 31),
      b = v(0, 71);
    p.line(a[0], a[1], b[0], b[1], "#fffaf0");
    const c = v(-23, 51),
      d = v(23, 51);
    p.line(c[0], c[1], d[0], d[1], "#fffaf0");
    box(-31, -6, 6, 6, 27, 50, CORAL);
    box(25, -6, 6, 6, 27, 50, CORAL);
    box(-30, -5, 60, 12, 25, 3, CREAM);
  } else if (kind === "picture") {
    box(-17, -6, 34, 4, 36, 28, DARKWOOD);
    box(-14, -1, 28, 1, 39, 22, CREAM);
    const a = point(0, 1, 51);
    p.ellipse(a[0], a[1], 8, 8, "#f2c365");
    p.poly(
      [
        [a[0] - 13, a[1] + 9],
        [a[0] + 3, a[1] - 2],
        [a[0] + 15, a[1] + 9],
      ],
      "#76bdb0",
    );
  } else if (kind === "lamp") {
    box(-8, -8, 16, 16, 0, 3, INK);
    box(-1, -1, 3, 3, 3, 56, INK);
    box(-13, -13, 26, 26, 56, 12, {
      top: "#fff8d4",
      left: "#f5dc9c",
      right: "#d7b66a",
    });
    p.ellipse(96, 153, 27, 9, "#ffe5a1", 25);
  } else if (kind === "logo") {
    box(-36, -6, 72, 4, 39, 21, BLUE);
    const a = point(-28, 0, 52);
    write(p, "AI OFFICE", a[0], a[1], "#fffef1");
  } else if (kind === "boxes") {
    box(-19, -12, 25, 24, 0, 20, WOOD);
    box(4, -12, 20, 20, 0, 14, CREAM);
    box(-14, -9, 20, 20, 20, 17, WOOD);
  }
  return p;
}
export function tilePixels(material: string, variation: number) {
  const p = new Pixels(64, 32);
  const colors: Record<string, string[]> = {
    wood: ["#edce97", "#e6c18a", "#f4d7a5"],
    cream: ["#f5edce", "#e1d8b9", "#fff4d7"],
    mint: ["#9bdac4", "#a4e1ce", "#8bceb9"],
    coral: ["#e5aa98", "#edb7a4", "#dda28f"],
    blue: ["#a5cbe7", "#b2d4ed", "#96bedc"],
    lilac: ["#c5b7df", "#d2c4e7", "#b6a5d3"],
  };
  const c = colors[material] ?? colors.wood;
  p.poly(
    [
      [31, 0],
      [63, 16],
      [31, 31],
      [0, 16],
    ],
    c[variation % 3],
    "#a39380",
  );
  p.line(1, 16, 31, 1, "#fff4d8");
  if (material === "wood") {
    for (let t = 8; t < 32; t += 8) {
      p.line(t, 16 - t / 2, t + 30, 31 - t / 2, "#d7ae77");
      p.line(t + 1, 17 - t / 2, t + 29, 31 - t / 2, "#f9dda9");
    }
    p.line(16, 24, 31, 16, "#bd9869");
  } else if (material === "cream") {
    p.line(16, 8, 47, 24, "#cfcaaf");
    p.line(16, 24, 47, 8, "#cfcaaf");
  } else {
    for (let y = 2; y < 32; y += 3)
      for (let x = 1; x < 63; x += 3)
        if (p.data[(y * 64 + x) * 4 + 3] && (x + y + variation) % 5 === 0)
          p.pixel(x, y, "#ffffff", 32);
  }
  return p;
}
export function wallPixels(axis: "x" | "y", color: Palette, height: number) {
  const p = new Pixels(192, 192);
  const x = -16,
    y = -16,
    w = axis === "x" ? 32 : 5,
    d = axis === "x" ? 5 : 32;
  p.box(x, y, w, d, 0, height, color);
  p.box(x - 1, y - 1, w + 2, d + 2, 0, 5, CREAM);
  p.box(x - 1, y - 1, w + 2, d + 2, height, 3, CREAM);
  if (height > 40) {
    for (let h = 14; h < height - 3; h += 14) {
      const a = point(x + w, y + d, h),
        b = point(axis === "x" ? x : x + w, axis === "x" ? y + d : y, h);
      p.line(a[0], a[1], b[0], b[1], color.top);
    }
  }
  return p;
}
export function characterPixels(shirt: Palette, hair: string) {
  const p = new Pixels(40 * 20, 64);
  for (let direction = 0; direction < 5; direction++)
    for (let f = 0; f < 4; f++) {
      const x = (direction * 4 + f) * 40,
        step = direction < 4 ? [0, 2, 0, -2][f] : 0,
        bob = direction < 4 ? f % 2 : 0,
        seated = direction === 4,
        back = direction === 2 || direction === 3;
      p.rect(x + 12, 44, 6, seated ? 6 : 12 + step, OUTLINE);
      p.rect(x + 23, 44, 6, seated ? 6 : 12 - step, OUTLINE);
      p.rect(x + 13, 45, 4, seated ? 4 : 9 + step, "#45556f");
      p.rect(x + 24, 45, 4, seated ? 4 : 9 - step, "#45556f");
      p.rect(x + 11, 54 + step, 9, 4, OUTLINE);
      p.rect(x + 23, 54 - step, 9, 4, OUTLINE);
      if (seated) {
        p.rect(x + 10, 47, 10, 5, "#45556f");
        p.rect(x + 24, 47, 10, 5, "#45556f");
      }
      p.rect(x + 10, 27 + bob, 20, 20, OUTLINE);
      p.rect(x + 11, 28 + bob, 18, 17, shirt.left);
      p.rect(x + 12, 28 + bob, 8, 15, shirt.top);
      p.rect(x + 27, 29 + bob, 2, 16, shirt.right);
      p.rect(x + 16, 27 + bob, 8, 3, "#f2c6a1");
      p.rect(x + 18, 30 + bob, 3, 13, shirt.right);
      p.pixel(x + 19, 35 + bob, "#fff1da");
      const arm = seated ? 3 + (f % 2) * 2 : step;
      p.rect(x + 7, 29 + bob, 5, 13 + arm, OUTLINE);
      p.rect(x + 8, 30 + bob, 3, 9, shirt.top);
      p.rect(x + 8, 39 + arm + bob, 4, 4, "#edbc98");
      p.rect(x + 29, 29 + bob, 5, 13 - arm, OUTLINE);
      p.rect(x + 30, 30 + bob, 3, 8, shirt.right);
      p.rect(x + 29, 39 - arm + bob, 4, 4, "#e3ab88");
      if (seated) {
        p.rect(x + 5, 37 + (f % 2), 8, 4, "#f1c4a0");
        p.rect(x + 29, 36 + ((f + 1) % 2), 8, 4, "#f1c4a0");
      }
      p.rect(x + 10, 5 + bob, 21, 20, OUTLINE);
      p.rect(x + 9, 9 + bob, 23, 12, OUTLINE);
      p.rect(x + 11, 7 + bob, 18, 16, "#f4d0ad");
      p.rect(x + 27, 9 + bob, 3, 13, "#dfad89");
      p.rect(x + 13, 23 + bob, 15, 3, "#c78c70");
      p.rect(x + 11, 4 + bob, 19, 7, hair);
      p.rect(x + 9, 8 + bob, 5, 8, hair);
      p.rect(x + 27, 7 + bob, 4, 7, hair);
      p.rect(x + 13, 3 + bob, 13, 3, hair);
      p.rect(x + 13, 5 + bob, 10, 2, "#73605b");
      p.rect(x + 12, 10 + bob, 4, 3, hair);
      if (back) {
        p.rect(x + 11, 9 + bob, 18, 13, hair);
        p.rect(x + 13, 20 + bob, 13, 3, hair);
        p.rect(x + 13, 11 + bob, 2, 7, "#73605b");
      } else {
        const face = direction === 0 ? 2 : -2;
        p.rect(x + 16 + face, 14 + bob, 2, 3, OUTLINE);
        p.rect(x + 24 + face, 14 + bob, 2, 3, OUTLINE);
        p.pixel(x + 16 + face, 14 + bob, "#fffaf0");
        p.pixel(x + 24 + face, 14 + bob, "#fffaf0");
        p.rect(x + 21 + face, 18 + bob, 2, 2, "#cf9476");
        p.rect(x + 20 + face, 22 + bob, 4, 1, "#a86757");
        p.pixel(x + 13 + face, 19 + bob, "#e9aa91");
      }
    }
  return p;
}
export function buildTextures(scene: Phaser.Scene) {
  const add = (name: string, p: Pixels) => {
    if (!scene.textures.exists(name))
      scene.textures.addCanvas(name, p.canvas());
  };
  for (const m of ["wood", "cream", "mint", "coral", "blue", "lilac"])
    for (let i = 0; i < 3; i++) add(`floor-${m}-${i}`, tilePixels(m, i));
  for (const [color, pal] of [
    ["mint", MINT],
    ["coral", CORAL],
    ["blue", BLUE],
    ["cream", CREAM],
  ] as const)
    for (const axis of ["x", "y"] as const)
      for (const h of [8, 28, 76])
        add(`wall-${color}-${axis}-${h}`, wallPixels(axis, pal, h));
  const props: Prop[] = [
    "executive",
    "devdesk",
    "chair",
    "gamer",
    "books",
    "plant",
    "server",
    "sofa",
    "coffeeTable",
    "coffee",
    "arcade",
    "reception",
    "water",
    "conference",
    "tv",
    "whiteboard",
    "window",
    "picture",
    "lamp",
    "logo",
    "boxes",
  ];
  for (const prop of props)
    for (let f = 0; f < (prop === "server" || prop === "coffee" ? 3 : 1); f++)
      add(`prop-${prop}-${f}`, propPixels(prop, f));
  for (const [name, pal, hair] of [
    ["user", BLUE, "#594335"],
    ["claude", CORAL, "#69493c"],
    ["codex", MINT, "#3d3942"],
  ] as const) {
    add(`actor-${name}`, characterPixels(pal, hair));
    const texture = scene.textures.get(`actor-${name}`);
    for (let frame = 0; frame < 20; frame++)
      texture.add(frame, 0, frame * 40, 0, 40, 64);
  }
  const shadow = new Pixels(48, 20);
  shadow.ellipse(24, 10, 22, 8, "#333449", 18);
  shadow.ellipse(24, 10, 16, 5, "#333449", 26);
  add("actor-shadow", shadow);
  const sunlight = new Pixels(192, 192);
  sunlight.poly(
    [
      [52, 94],
      [94, 114],
      [151, 162],
      [104, 178],
    ],
    "#fff8bf",
  );
  for (let i = 3; i < sunlight.data.length; i += 4)
    sunlight.data[i] = sunlight.data[i] ? 42 : 0;
  add("sunlight", sunlight);
  for (const [state, color, symbol] of [
    ["idle", "#71c993", "+"],
    ["busy", "#6bb8ec", "..."],
    ["approval", "#f5c36d", "!"],
    ["error", "#ed887f", "!"],
    ["offline", "#b0a9a2", "-"],
    ["talk", "#bba1e0", "..."],
  ] as const) {
    const p = new Pixels(13, 13);
    p.rect(1, 1, 11, 11, OUTLINE);
    p.rect(2, 2, 9, 9, color);
    write(p, symbol, symbol === "..." ? 2 : 5, 3);
    add(`status-${state}`, p);
  }
  add("name-user", labelTexture("VOCE"));
  add("name-claude", labelTexture("CLAUDE"));
  add("name-codex", labelTexture("CODEX"));
}
