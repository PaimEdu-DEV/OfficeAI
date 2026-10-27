// Every visible surface is rasterized into ImageData. No Canvas paths or Phaser Graphics.
export const OUTLINE = "#34333e";
export type Palette = { top: string; left: string; right: string };
export class Pixels {
  data: Uint8ClampedArray;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  pixel(x: number, y: number, hex: string, alpha = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const value = parseInt(hex.replace("#", ""), 16),
      i = (y * this.width + x) * 4;
    if (alpha < 255 && this.data[i + 3]) {
      const source = alpha / 255,
        destination = this.data[i + 3] / 255;
      const total = source + destination * (1 - source);
      for (let channel = 0; channel < 3; channel++) {
        const color = (value >> ((2 - channel) * 8)) & 255;
        this.data[i + channel] =
          (color * source +
            this.data[i + channel] * destination * (1 - source)) /
          total;
      }
      this.data[i + 3] = total * 255;
      return;
    }
    this.data[i] = value >> 16;
    this.data[i + 1] = (value >> 8) & 255;
    this.data[i + 2] = value & 255;
    this.data[i + 3] = alpha;
  }
  rect(x: number, y: number, w: number, h: number, color: string, alpha = 255) {
    for (let py = Math.ceil(y); py < y + h; py++)
      for (let px = Math.ceil(x); px < x + w; px++)
        this.pixel(px, py, color, alpha);
  }
  line(x0: number, y0: number, x1: number, y1: number, color = OUTLINE) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1,
      dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.pixel(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e = 2 * error;
      if (e >= dy) {
        error += dy;
        x0 += sx;
      }
      if (e <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }
  poly(points: number[][], color: string, outline?: string) {
    const minY = Math.ceil(Math.min(...points.map((p) => p[1]))),
      maxY = Math.floor(Math.max(...points.map((p) => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const crossings: number[] = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i],
          b = points[j];
        if (a[1] > y !== b[1] > y)
          crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        for (let x = Math.ceil(crossings[i]); x <= crossings[i + 1]; x++)
          this.pixel(x, y, color);
    }
    if (outline)
      points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        this.line(p[0], p[1], q[0], q[1], outline);
      });
  }
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string,
    alpha = 255,
  ) {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1)
          this.pixel(cx + x, cy + y, color, alpha);
  }
  box(
    x: number,
    y: number,
    w: number,
    d: number,
    z: number,
    h: number,
    p: Palette,
  ) {
    const point = (a: number, b: number, c: number) => [
      96 + a - b,
      148 + (a + b) / 2 - c,
    ];
    const a = point(x, y, z + h),
      b = point(x + w, y, z + h),
      c = point(x + w, y + d, z + h),
      e = point(x, y + d, z + h),
      f = point(x, y + d, z),
      g = point(x + w, y + d, z),
      k = point(x + w, y, z);
    this.poly([e, c, g, f], p.left, OUTLINE);
    this.poly([b, c, g, k], p.right, OUTLINE);
    this.poly([a, b, c, e], p.top, OUTLINE);
  }
  canvas() {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    canvas
      .getContext("2d")!
      .putImageData(new ImageData(this.data, this.width, this.height), 0, 0);
    return canvas;
  }
}
const glyphs: Record<string, string> = {
  A: "01110/10001/10001/11111/10001/10001/10001",
  B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01111/10000/10000/10000/10000/10000/01111",
  D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111",
  F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01111/10000/10000/10111/10001/10001/01111",
  H: "10001/10001/10001/11111/10001/10001/10001",
  I: "111/010/010/010/010/010/111",
  J: "00111/00010/00010/00010/10010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001",
  L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001",
  N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110",
  P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101",
  R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110",
  T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110",
  V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/10101/01010",
  X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100",
  Z: "11111/00001/00010/00100/01000/10000/11111",
  "0": "01110/10001/10011/10101/11001/10001/01110",
  "1": "010/110/010/010/010/010/111",
  "2": "01110/10001/00001/00010/00100/01000/11111",
  "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "10010/10010/10010/11111/00010/00010/00010",
  "5": "11111/10000/10000/11110/00001/00001/11110",
  "6": "01110/10000/10000/11110/10001/10001/01110",
  "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110",
  "9": "01110/10001/10001/01111/00001/00001/01110",
  "?": "01110/10001/00001/00010/00100/00000/00100",
  "!": "1/1/1/1/1/0/1",
  ".": "0/0/0/0/0/1/1",
  ":": "0/1/1/0/1/1/0",
  "-": "000/000/000/111/000/000/000",
  "/": "00001/00001/00010/00100/01000/10000/10000",
  "+": "000/010/010/111/010/010/000",
  "[": "111/100/100/100/100/100/111",
  "]": "111/001/001/001/001/001/111",
  " ": "000/000/000/000/000/000/000",
};
export const cleanText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
export function write(
  p: Pixels,
  text: string,
  x: number,
  y: number,
  color = "#353546",
) {
  let cursor = x;
  for (const char of cleanText(text)) {
    const rows = (glyphs[char] ?? glyphs["?"]).split("/");
    rows.forEach((row, dy) =>
      [...row].forEach((v, dx) => {
        if (v === "1") p.pixel(cursor + dx, y + dy, color);
      }),
    );
    cursor += rows[0].length + 1;
  }
  return cursor - x;
}
export const textWidth = (text: string) =>
  [...cleanText(text)].reduce(
    (w, c) => w + (glyphs[c] ?? glyphs["?"]).split("/")[0].length + 1,
    0,
  );
export function labelTexture(text: string, bubble = false) {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const words = line.split(" ");
    let row = "";
    for (const word of words) {
      if (row.length + word.length > 34) {
        lines.push(row);
        row = "";
      }
      row += (row ? " " : "") + word;
    }
    lines.push(row);
  }
  const width = Math.max(24, ...lines.map(textWidth)) + 12,
    height = lines.length * 10 + 9;
  const p = new Pixels(width, height + (bubble ? 6 : 0));
  p.rect(1, 1, width - 2, height - 2, "#fffdf4");
  p.line(1, 0, width - 2, 0);
  p.line(1, height - 1, width - 2, height - 1);
  p.line(0, 1, 0, height - 2);
  p.line(width - 1, 1, width - 1, height - 2);
  lines.forEach((line, i) => write(p, line, 6, 5 + i * 10));
  if (bubble) {
    p.poly(
      [
        [width / 2 - 4, height - 1],
        [width / 2 + 4, height - 1],
        [width / 2 - 3, height + 5],
      ],
      "#fffdf4",
      OUTLINE,
    );
    p.line(width / 2 - 3, height - 1, width / 2 + 3, height - 1, "#fffdf4");
  }
  return p;
}
export const WOOD: Palette = {
    top: "#eabf81",
    left: "#b78455",
    right: "#936242",
  },
  DARKWOOD: Palette = { top: "#bd8356", left: "#855436", right: "#63402f" },
  CREAM: Palette = { top: "#fff3d3", left: "#d2c3a4", right: "#a99d8a" },
  INK: Palette = { top: "#5b6576", left: "#394454", right: "#252f41" },
  MINT: Palette = { top: "#8ce1ca", left: "#55ae9f", right: "#398b84" },
  CORAL: Palette = { top: "#f5ad8e", left: "#d47e68", right: "#ac5e56" },
  BLUE: Palette = { top: "#9ccded", left: "#669bbb", right: "#47798e" };
