import Phaser from "phaser";
import type { AgentInfo, AgentStatus } from "../shared/types";
import { blocked, Cell, COLS, key, pathfind, ROWS, walkable } from "./grid";
import { buildTextures, Prop } from "./art";
import { labelTexture } from "./pixels";
export type Interaction = {
  kind: "chat" | "workstation" | "meeting";
  agentId?: string;
};
export const statusLabels: Record<AgentStatus, string> = {
  idle: "Disponível",
  thinking: "Pensando",
  coding: "Programando",
  running_command: "Executando",
  installing: "Instalando",
  testing: "Testando",
  analyzing_error: "Analisando erro",
  talking: "Conversando",
  in_meeting: "Em reunião",
  awaiting_approval: "Aguardando aprovação",
  awaiting_agent: "Aguardando agente",
  error: "Erro",
  disconnected: "Desconectado",
};
export const roomViews = [
  { name: "Diretor", x: 4, y: 4 },
  { name: "Recepção", x: 11, y: 4 },
  { name: "Dev", x: 19, y: 4 },
  { name: "Reuniões", x: 4, y: 11 },
  { name: "Área comum", x: 19, y: 11 },
  { name: "Corredor", x: 11, y: 11 },
  { name: "Sala 01", x: 4, y: 18 },
  { name: "Sala 02", x: 19, y: 18 },
];
type Actor = {
  id: string;
  cell: Cell;
  home: Cell;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Image;
  indicator?: Phaser.GameObjects.Image;
  status: AgentStatus;
  moving: boolean;
  direction: number;
};
export class OfficeScene extends Phaser.Scene {
  controlsEnabled = true;
  private player!: Actor;
  private agents = new Map<string, Actor>();
  private route: Cell[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Image;
  private promptKey = "";
  private target?: Interaction;
  private pending: AgentInfo[] = [];
  private visits = new Set<string>();
  private ambient: {
    sprite: Phaser.GameObjects.Image;
    kind: string;
    offset: number;
  }[] = [];
  private ambientTick = -1;
  private drag?: { x: number; y: number; scrollX: number; scrollY: number };
  private dragging = false;
  private following = false;
  private sequence = 0;
  constructor(private interact: (event: Interaction) => void) {
    super("office");
  }
  private iso(p: Cell) {
    return { x: (p.x - p.y) * 32, y: (p.x + p.y) * 16 + 16 };
  }
  create() {
    this.cameras.main.setBackgroundColor("#17384e");
    this.cameras.main.roundPixels = true;
    buildTextures(this);
    this.drawBuilding();
    this.player = this.actor("user", { x: 6, y: 5 });
    this.agents.set("claude", this.actor("claude", { x: 4, y: 5 }));
    this.agents.set("codex", this.actor("codex", { x: 19, y: 5 }));
    this.prompt = this.add
      .image(0, 0, "name-user")
      .setVisible(false)
      .setDepth(100000)
      .setOrigin(0.5, 0);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,E,UP,DOWN,LEFT,RIGHT",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.disableGlobalCapture();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.drag = {
        x: p.x,
        y: p.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      };
      this.dragging = false;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.drag) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, this.drag.x, this.drag.y) > 5)
        this.dragging = true;
      if (this.dragging) {
        this.following = false;
        this.cameras.main.setScroll(
          this.drag.scrollX - (p.x - this.drag.x) / this.cameras.main.zoom,
          this.drag.scrollY - (p.y - this.drag.y) / this.cameras.main.zoom,
        );
      }
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.dragging && this.controlsEnabled) {
        const pos = this.cameras.main.getWorldPoint(p.x, p.y);
        const cell = {
          x: Math.floor((pos.x / 32 + pos.y / 16) / 2),
          y: Math.floor((pos.y / 16 - pos.x / 32) / 2),
        };
        this.route = pathfind(this.player.cell, cell);
        if (this.route.length) this.following = true;
      }
      this.drag = undefined;
      this.dragging = false;
    });
    this.input.on(
      "wheel",
      (_p: unknown, _o: unknown, _dx: number, dy: number) =>
        this.setZoom(dy < 0 ? 3 : 2),
    );
    this.scale.on("resize", () => {
      const c = this.cameras.main;
      c.centerOn(c.midPoint.x, c.midPoint.y);
    });
    this.setZoom(2);
    this.focusRoom(0);
    this.setAgents(this.pending);
  }
  private drawBuilding() {
    // Floor sprites stay below the y-sorted wall, furniture and character layers.
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const p = this.iso({ x, y });
        let material = "cream";
        if (x < 8) material = y < 8 ? "wood" : y < 14 ? "lilac" : "wood";
        else if (x > 15) material = y < 8 ? "wood" : y < 14 ? "mint" : "wood";
        if (x > 1 && x < 7 && y > 2 && y < 7) material = "coral";
        if (x > 16 && x < 22 && y > 2 && y < 7) material = "blue";
        if (x > 8 && x < 15 && y < 8) material = "cream";
        this.add
          .image(p.x, p.y - 16, `floor-${material}-${(x + y) % 3}`)
          .setOrigin(0.5, 0)
          .setDepth(-2000);
        // Thick foundation visible along the cutaway edges.
        if (y === ROWS - 1 || x === COLS - 1)
          this.add
            .image(p.x, p.y, "wall-cream-x-8")
            .setOrigin(0.5, 148 / 192)
            .setDepth(-1900);
      }
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (blocked.has(key({ x, y }))) {
          const p = this.iso({ x, y }),
            axis = x === 0 || x === 8 || x === 15 || x === COLS - 1 ? "y" : "x";
          const color = x < 8 ? "coral" : x < 15 ? "mint" : "blue";
          const height =
            x === 0 || y === 0 ? 76 : x === COLS - 1 || y === ROWS - 1 ? 8 : 28;
          this.add
            .image(p.x, p.y, `wall-${color}-${axis}-${height}`)
            .setOrigin(0.5, 148 / 192)
            .setDepth(p.y);
        }
    this.prop("books", 2, 1);
    this.prop("window", 5, 0, false);
    this.prop("picture", 1, 2, false);
    this.prop("executive", 4, 4);
    this.occupy(3, 3, 3, 2);
    this.prop("chair", 4, 5, false);
    this.prop("plant", 1, 6);
    this.prop("lamp", 7, 2);
    this.prop("plant", 7, 7);
    this.prop("logo", 11, 0, false);
    this.prop("window", 13, 0, false);
    this.prop("sofa", 11, 2);
    this.occupy(10, 2, 3, 1);
    this.prop("reception", 11, 4);
    this.occupy(10, 4, 3, 1);
    this.prop("water", 14, 6);
    this.prop("plant", 9, 1);
    this.prop("coffeeTable", 12, 6);
    this.prop("devdesk", 19, 4);
    this.occupy(18, 3, 3, 2);
    this.prop("gamer", 19, 5, false);
    this.prop("server", 21, 1);
    this.prop("server", 22, 1);
    this.prop("server", 22, 4);
    this.prop("books", 17, 1);
    this.prop("window", 19, 0, false);
    this.prop("plant", 17, 6);
    this.prop("conference", 4, 11);
    this.occupy(3, 11, 3, 1);
    for (const x of [2, 4, 6])
      for (const y of [10, 12]) this.prop("chair", x, y);
    this.prop("tv", 4, 8, false);
    this.prop("whiteboard", 1, 9, false);
    this.prop("plant", 7, 13);
    this.prop("sofa", 18, 10);
    this.occupy(17, 10, 3, 1);
    this.prop("sofa", 21, 12);
    this.occupy(20, 12, 3, 1);
    this.prop("coffeeTable", 19, 11);
    this.prop("coffee", 22, 9);
    this.prop("arcade", 16, 12);
    this.prop("plant", 22, 13);
    this.prop("picture", 18, 8, false);
    this.prop("lamp", 13, 9);
    this.prop("lamp", 9, 13);
    this.prop("plant", 13, 17);
    this.prop("sofa", 11, 19);
    this.prop("coffeeTable", 11, 18);
    this.prop("boxes", 2, 16);
    this.prop("plant", 7, 20);
    this.prop("lamp", 1, 19);
    this.prop("boxes", 21, 16);
    this.prop("plant", 17, 20);
    this.prop("lamp", 22, 19);
    // Window light is a translucent raster decal, generated once.
    for (const cell of [
      { x: 5, y: 1 },
      { x: 19, y: 1 },
      { x: 13, y: 1 },
    ]) {
      const p = this.iso(cell);
      this.add
        .image(p.x, p.y, "sunlight")
        .setOrigin(0.5, 148 / 192)
        .setDepth(-1800);
    }
  }
  private occupy(x: number, y: number, w: number, h: number) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) blocked.add(key({ x: xx, y: yy }));
  }
  private prop(kind: Prop, x: number, y: number, solid = true) {
    if (solid) blocked.add(key({ x, y }));
    const p = this.iso({ x, y });
    const image = this.add
      .image(p.x, p.y, `prop-${kind}-0`)
      .setOrigin(0.5, 148 / 192)
      .setDepth(p.y + 0.1);
    if (kind === "server" || kind === "coffee")
      this.ambient.push({ sprite: image, kind, offset: x + y });
    return image;
  }
  private actor(id: string, cell: Cell): Actor {
    const p = this.iso(cell);
    const label = this.add
      .image(p.x, p.y - 67, `name-${id}`)
      .setOrigin(0.5, 1)
      .setDepth(90000);
    const a: Actor = {
      id,
      cell,
      home: { ...cell },
      sprite: this.add
        .sprite(p.x, p.y, `actor-${id}`, 0)
        .setOrigin(0.5, 59 / 64)
        .setDepth(p.y + 0.5),
      shadow: this.add.image(p.x, p.y, "actor-shadow").setDepth(p.y - 0.1),
      label,
      status: "disconnected",
      moving: false,
      direction: 0,
    };
    if (id !== "user")
      a.indicator = this.add
        .image(p.x + label.width / 2 + 8, p.y - 75, "status-offline")
        .setDepth(90000);
    return a;
  }
  setZoom(zoom: number) {
    if (!this.cameras?.main) return;
    this.cameras.main.setZoom(zoom >= 3 ? 3 : 2);
    this.cameras.main.roundPixels = true;
  }
  focusRoom(index: number) {
    const room = roomViews[index];
    if (!room || !this.player) return;
    const p = this.iso(room);
    this.following = false;
    this.cameras.main.centerOn(p.x, p.y - 12);
  }
  focusPlayer() {
    if (!this.player) return;
    const p = this.iso(this.player.cell);
    this.cameras.main.centerOn(p.x, p.y - 24);
    this.following = true;
  }
  setAgents(agents: AgentInfo[]) {
    this.pending = agents;
    this.agents.forEach(
      (a, id) =>
        (a.status =
          agents.find((info) => info.id === id)?.status ?? "disconnected"),
    );
  }
  setStatus(id: string, status: AgentStatus) {
    this.pending = this.pending.map((a) =>
      a.id === id ? { ...a, status } : a,
    );
    const a = this.agents.get(id);
    if (a) a.status = status;
  }
  private align(a: Actor) {
    a.sprite.setDepth(a.sprite.y + 0.5);
    a.shadow.setPosition(a.sprite.x, a.sprite.y).setDepth(a.sprite.y - 0.1);
    a.label.setPosition(Math.round(a.sprite.x), Math.round(a.sprite.y) - 67);
    a.indicator?.setPosition(
      Math.round(a.sprite.x + a.label.width / 2 + 8),
      Math.round(a.sprite.y) - 75,
    );
  }
  private step(a: Actor, next: Cell): Promise<void> {
    if (!walkable(next)) return Promise.resolve();
    const dx = next.x - a.cell.x,
      dy = next.y - a.cell.y;
    a.direction = dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
    a.moving = true;
    a.cell = next;
    const p = this.iso(next);
    return new Promise((resolve) =>
      this.tweens.add({
        targets: a.sprite,
        x: p.x,
        y: p.y,
        duration: 210,
        onUpdate: () => this.align(a),
        onComplete: () => {
          a.moving = false;
          a.sprite.setFrame(a.direction * 4);
          this.align(a);
          resolve();
        },
      }),
    );
  }
  async agentVisit(from: string, to: string, text: string): Promise<void> {
    const a = this.agents.get(from),
      b = this.agents.get(to);
    if (!a || !b || this.visits.has(from)) return;
    this.visits.add(from);
    try {
      const adjacent = [
        { x: b.cell.x + 1, y: b.cell.y },
        { x: b.cell.x - 1, y: b.cell.y },
        { x: b.cell.x, y: b.cell.y + 1 },
        { x: b.cell.x, y: b.cell.y - 1 },
      ]
        .map((goal) => ({ goal, route: pathfind(a.cell, goal) }))
        .filter((p) => p.route.length)
        .sort((x, y) => x.route.length - y.route.length)[0];
      if (!adjacent) return;
      for (const cell of adjacent.route) await this.step(a, cell);
      const texture = `speech-${this.sequence++}`;
      this.textures.addCanvas(texture, labelTexture(text, true).canvas());
      const bubble = this.add
        .image(a.sprite.x, a.sprite.y - 92, texture)
        .setOrigin(0.5, 1)
        .setDepth(100001);
      await new Promise<void>((resolve) =>
        this.time.delayedCall(3500, resolve),
      );
      bubble.destroy();
      this.textures.remove(texture);
      for (const cell of pathfind(a.cell, a.home)) await this.step(a, cell);
    } finally {
      this.visits.delete(from);
    }
  }
  private updateActor(a: Actor, time: number) {
    if (a.moving)
      a.sprite.setFrame(a.direction * 4 + (Math.floor(time / 100) % 4));
    else if (a.id !== "user" && key(a.cell) === key(a.home))
      a.sprite.setFrame(
        16 +
          ([
            "coding",
            "running_command",
            "installing",
            "testing",
            "analyzing_error",
          ].includes(a.status)
            ? Math.floor(time / 180) % 4
            : 0),
      );
    else a.sprite.setFrame(a.direction * 4);
    if (a.indicator) {
      const status =
        a.status === "disconnected"
          ? "offline"
          : a.status === "error" || a.status === "analyzing_error"
            ? "error"
            : a.status === "awaiting_approval"
              ? "approval"
              : ["talking", "in_meeting", "awaiting_agent"].includes(a.status)
                ? "talk"
                : a.status === "idle"
                  ? "idle"
                  : "busy";
      a.indicator.setTexture(`status-${status}`);
      a.indicator.setAlpha(
        status === "busy" || status === "approval"
          ? Math.floor(time / 500) % 2
            ? 0.65
            : 1
          : 1,
      );
    }
  }
  update(time: number) {
    if (!this.player) return;
    const tick = Math.floor(time / 360);
    if (tick !== this.ambientTick) {
      this.ambientTick = tick;
      this.ambient.forEach((a) =>
        a.sprite.setTexture(`prop-${a.kind}-${(tick + a.offset) % 3}`),
      );
    }
    this.updateActor(this.player, time);
    this.agents.forEach((a) => this.updateActor(a, time));
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
        active.isContentEditable);
    if (typing || !this.controlsEnabled) {
      this.route = [];
      this.prompt.setVisible(false);
      return;
    }
    if (!this.player.moving) {
      let d: Cell | undefined;
      if (this.keys.W.isDown || this.keys.UP.isDown) d = { x: 0, y: -1 };
      else if (this.keys.S.isDown || this.keys.DOWN.isDown) d = { x: 0, y: 1 };
      else if (this.keys.A.isDown || this.keys.LEFT.isDown) d = { x: -1, y: 0 };
      else if (this.keys.D.isDown || this.keys.RIGHT.isDown) d = { x: 1, y: 0 };
      if (d) {
        this.route = [];
        this.following = true;
        void this.step(this.player, {
          x: this.player.cell.x + d.x,
          y: this.player.cell.y + d.y,
        });
      } else if (this.route.length)
        void this.step(this.player, this.route.shift()!);
    }
    if (this.following && !this.dragging) {
      const c = this.cameras.main;
      const marginX = (c.width / c.zoom) * 0.25,
        marginY = (c.height / c.zoom) * 0.25;
      if (
        Math.abs(this.player.sprite.x - c.midPoint.x) > marginX ||
        Math.abs(this.player.sprite.y - c.midPoint.y) > marginY
      )
        c.centerOn(this.player.sprite.x, this.player.sprite.y - 24);
    }
    this.target = undefined;
    const distance = (p: Cell) =>
      Math.abs(this.player.cell.x - p.x) + Math.abs(this.player.cell.y - p.y);
    this.agents.forEach((a, id) => {
      if (distance(a.cell) <= 2) this.target = { kind: "chat", agentId: id };
    });
    if (!this.target && distance({ x: 4, y: 11 }) <= 3)
      this.target = { kind: "meeting" };
    if (!this.target)
      for (const [id, cell] of [
        ["claude", { x: 4, y: 4 }],
        ["codex", { x: 19, y: 4 }],
      ] as const)
        if (distance(cell) <= 2)
          this.target = { kind: "workstation", agentId: id };
    const text = this.target
      ? `[E] ${this.target.kind === "chat" ? "CONVERSAR" : this.target.kind === "meeting" ? "INICIAR REUNIAO" : "ABRIR ESTACAO"}`
      : "";
    if (text !== this.promptKey) {
      if (this.textures.exists("interaction-prompt"))
        this.textures.remove("interaction-prompt");
      if (text) {
        this.textures.addCanvas(
          "interaction-prompt",
          labelTexture(text).canvas(),
        );
        this.prompt.setTexture("interaction-prompt");
      }
      this.promptKey = text;
    }
    this.prompt
      .setVisible(!!text)
      .setPosition(
        Math.round(this.player.sprite.x),
        Math.round(this.player.sprite.y) + 14,
      );
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) && this.target)
      this.interact(this.target);
  }
}
