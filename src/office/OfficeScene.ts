import Phaser from "phaser";
import type { AgentEvent, AgentInfo, AgentStatus } from "../shared/types";
import { buildTextures } from "./art";
import { GridMotion } from "./motion";
import {
  blocked,
  canStep,
  Cell,
  COLS,
  key,
  neighbors,
  pathfind,
  resetGrid,
  ROWS,
  walkable,
} from "./grid";
import { drawOffice, Seat } from "./layout";
import { labelTexture, Pixels } from "./pixels";
import { ChoreographyQueue, VisualJob } from "./choreography";
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
  movingTo?: Cell;
  direction: number;
  seated: boolean;
  showNameUntil: number;
  waveUntil: number;
  stepStart: number;
  motion: GridMotion;
  seatGoal?: string;
  arrival?: () => void;
};
type Bubble = {
  actor: Actor;
  image: Phaser.GameObjects.Image;
  texture: string;
  born: number;
};
const directions = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];
export class OfficeScene extends Phaser.Scene {
  controlsEnabled = true;
  private player!: Actor;
  private agents = new Map<string, Actor>();
  private seats = new Map<string, Seat>();
  private get route() {
    return this.player?.motion.path ?? [];
  }
  private manualActive = false;
  private zoomMotion?: {
    target: number;
    screen: { x: number; y: number };
    world: { x: number; y: number };
  };
  private destinationSeat?: string;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Image;
  private highlight!: Phaser.GameObjects.Image;
  private hovered?: Actor;
  private promptKey = "";
  private target?: Interaction;
  private pending: AgentInfo[] = [];
  private queue = new ChoreographyQueue();
  private processing = false;
  private visiting = new Set<string>();
  private bubbles: Bubble[] = [];
  private ambient: {
    sprite: Phaser.GameObjects.Image;
    kind: string;
    offset: number;
  }[] = [];
  private ambientTick = -1;
  private drag?: {
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    button: number;
    pick?: Phaser.GameObjects.GameObject;
    canPan: boolean;
  };
  private dragging = false;
  private sequence = 0;
  private alive = false;
  constructor(private interact: (event: Interaction) => void) {
    super("office");
  }
  private iso(p: Cell) {
    return { x: (p.x - p.y) * 32, y: (p.x + p.y) * 16 + 16 };
  }
  private cellAt(p: Phaser.Math.Vector2): Cell {
    return {
      x: Math.floor((p.x / 32 + p.y / 16) / 2),
      y: Math.floor((p.y / 16 - p.x / 32) / 2),
    };
  }
  create() {
    this.alive = true;
    resetGrid();
    buildTextures(this);
    drawOffice(this, this.seats, this.ambient);
    const camera = this.cameras.main;
    camera
      .setBackgroundColor("#79adbd")
      .setBounds(
        -ROWS * 32 - 192,
        -180,
        (COLS + ROWS) * 32 + 384,
        (COLS + ROWS) * 16 + 400,
      );
    camera.roundPixels = true;
    this.player = this.actor("user", { x: 6, y: 5 });
    this.agents.set("claude", this.actor("claude", { x: 4, y: 5 }));
    this.agents.set("codex", this.actor("codex", { x: 19, y: 5 }));
    const tile = new Pixels(64, 32);
    tile.poly(
      [
        [31, 0],
        [63, 16],
        [31, 31],
        [0, 16],
      ],
      "#fff6ab",
      "#f8ffef",
    );
    for (let i = 3; i < tile.data.length; i += 4)
      if (tile.data[i]) tile.data[i] = 100;
    this.textures.addCanvas("tile-hover", tile.canvas());
    this.highlight = this.add
      .image(0, 0, "tile-hover")
      .setOrigin(0.5, 0)
      .setDepth(-1700)
      .setVisible(false);
    this.prompt = this.add
      .image(0, 0, "name-user")
      .setDepth(100000)
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,E,UP,DOWN,LEFT,RIGHT,SPACE",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.disableGlobalCapture();
    this.input.mouse!.disableContextMenu();
    this.game.canvas.tabIndex = 0;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.game.canvas.focus({ preventScroll: true });
      const pick = this.input
        .hitTestPointer(p)
        .find(
          (o) =>
            o.getData("actor") || o.getData("seat") || o.getData("chatAgent"),
        );
      this.drag = {
        x: p.x,
        y: p.y,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        button: p.button,
        pick,
        canPan: p.button !== 0 || !pick,
      };
      this.dragging = false;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.drag) return;
      if (
        this.drag.canPan &&
        Phaser.Math.Distance.Between(p.x, p.y, this.drag.x, this.drag.y) > 6
      )
        this.dragging = true;
      if (this.dragging) {
        camera.stopFollow();
        camera.setScroll(
          this.drag.scrollX - (p.x - this.drag.x) / camera.zoom,
          this.drag.scrollY - (p.y - this.drag.y) / camera.zoom,
        );
      }
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const drag = this.drag;
      this.drag = undefined;
      if (
        !drag ||
        this.dragging ||
        drag.button !== 0 ||
        !this.controlsEnabled
      ) {
        this.dragging = false;
        return;
      }
      const object = drag.pick;
      if (object?.getData("chatAgent")) {
        this.interact({ kind: "chat", agentId: object.getData("chatAgent") });
        return;
      }
      if (object?.getData("actor")) {
        const id = object.getData("actor") as string;
        const a = id === "user" ? this.player : this.agents.get(id);
        if (a) {
          a.showNameUntil = this.time.now + 3500;
          if (id === "user") a.waveUntil = this.time.now + 1200;
          else this.interact({ kind: "chat", agentId: id });
        }
        return;
      }
      const seatKey = object?.getData("seat") as string | undefined;
      const cell = seatKey
        ? this.seats.get(seatKey)!.cell
        : this.cellAt(camera.getWorldPoint(p.x, p.y));
      this.walkTo(cell, !!seatKey);
    });
    this.input.on(
      "wheel",
      (p: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) =>
        this.setZoom(
          (this.zoomMotion?.target ?? camera.zoom) * Math.exp(-dy * 0.0015),
          p,
          true,
        ),
    );
    this.scale.on("resize", () => this.clampCamera());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.queue.clear();
      this.bubbles = [];
    });
    this.setZoom(2);
    this.focusPlayer();
    this.setAgents(this.pending);
  }
  private clampCamera() {
    this.cameras.main.setScroll(
      this.cameras.main.scrollX,
      this.cameras.main.scrollY,
    );
  }
  private actor(id: string, cell: Cell): Actor {
    const p = this.iso(cell),
      label = this.add
        .image(p.x, p.y - 60, `name-${id}`)
        .setOrigin(0.5, 1)
        .setDepth(90000)
        .setVisible(false);
    const sprite = this.add
      .sprite(p.x, p.y, `actor-${id}`, 33)
      .setOrigin(0.5, 56 / 64)
      .setDepth(p.y + 0.5)
      .setData("actor", id);
    sprite.setInteractive({
      pixelPerfect: true,
      alphaTolerance: 100,
      useHandCursor: true,
    });
    return {
      id,
      cell,
      home: { ...cell },
      sprite,
      shadow: this.add.image(p.x, p.y, "actor-shadow").setDepth(p.y - 0.1),
      label,
      indicator:
        id === "user"
          ? undefined
          : this.add
              .image(p.x + 14, p.y - 55, "status-offline")
              .setDepth(90000),
      status: "disconnected",
      moving: false,
      direction: 1,
      seated: id !== "user",
      showNameUntil: 0,
      waveUntil: 0,
      stepStart: 0,
      motion: new GridMotion(cell),
    };
  }
  setZoom(value: number, pointer?: { x: number; y: number }, smooth = false) {
    const c = this.cameras.main,
      target = Phaser.Math.Clamp(value, 0.5, 6),
      screen = { x: pointer?.x ?? c.width / 2, y: pointer?.y ?? c.height / 2 };
    const world = {
      x: c.scrollX + c.width / 2 + (screen.x - c.width / 2) / c.zoom,
      y: c.scrollY + c.height / 2 + (screen.y - c.height / 2) / c.zoom,
    };
    c.stopFollow();
    this.zoomMotion = undefined;
    if (smooth) this.zoomMotion = { target, screen, world };
    else this.applyZoom(target, screen, world);
  }
  private applyZoom(
    zoom: number,
    screen: { x: number; y: number },
    world: { x: number; y: number },
  ) {
    const c = this.cameras.main;
    c.setZoom(zoom);
    const x = world.x - (screen.x - c.width / 2) / zoom - c.width / 2,
      y = world.y - (screen.y - c.height / 2) / zoom - c.height / 2;
    // Align the camera translation to physical pixels, preserving a fractional scale.
    c.setScroll(Math.round(x * zoom) / zoom, Math.round(y * zoom) / zoom);
    c.roundPixels = true;
  }
  private advanceZoom(delta: number) {
    const motion = this.zoomMotion;
    if (!motion) return;
    const current = this.cameras.main.zoom,
      difference = motion.target - current;
    const zoom =
      Math.abs(difference) < 0.0005
        ? motion.target
        : current +
          difference * (1 - Math.exp((-Math.min(delta, 100) / 1000) * 14));
    this.applyZoom(zoom, motion.screen, motion.world);
    if (zoom === motion.target) this.zoomMotion = undefined;
  }
  focusRoom(index: number) {
    this.zoomMotion = undefined;
    const room = roomViews[index];
    if (!room || !this.player) return;
    const p = this.iso(room);
    this.cameras.main.stopFollow().centerOn(p.x, p.y - 12);
  }
  focusPlayer() {
    this.zoomMotion = undefined;
    if (this.player)
      this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1, 0, 22);
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
  handleEvent(event: AgentEvent) {
    if (event.kind === "status") this.setStatus(event.agentId, event.status);
    if (event.kind === "user_message" && this.player)
      this.showBubble(this.player, event.text);
    if (event.kind === "delegation" || event.kind === "final_reply")
      this.queue.enqueue(event, this.time.now);
  }
  private align(a: Actor) {
    a.sprite.setDepth(a.sprite.y + 0.5);
    a.shadow.setPosition(a.sprite.x, a.sprite.y).setDepth(a.sprite.y - 0.1);
    a.label.setPosition(Math.round(a.sprite.x), Math.round(a.sprite.y) - 60);
    a.indicator?.setPosition(
      a.sprite.x + (a.label.visible ? a.label.width / 2 + 8 : 14),
      a.sprite.y - 55,
    );
  }
  private occupied(cell: Cell, except: string) {
    return [this.player, ...this.agents.values()].some(
      (a) =>
        a.id !== except &&
        (key(a.cell) === key(cell) ||
          (a.movingTo && key(a.movingTo) === key(cell))),
    );
  }
  walkTo(cell: Cell, seat = false) {
    if (!this.player) return;
    const a = this.player,
      origin = a.motion.target ?? a.motion.cell;
    if (this.occupied(cell, "user")) return;
    const route = pathfind(origin, cell, seat);
    if (!route.length && key(origin) !== key(cell)) return;
    this.destinationSeat = seat ? key(cell) : undefined;
    a.seatGoal = this.destinationSeat;
    a.motion.replace(route);
    if (!a.motion.moving && seat) {
      a.seated = true;
      a.direction = this.seats.get(key(cell))?.direction ?? 1;
    }
    this.focusPlayer();
  }
  private readManualInput(time: number): Cell | undefined {
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
        active.isContentEditable ||
        !!active.closest(".floating-window"));
    if (typing || !this.controlsEnabled) {
      this.manualActive = false;
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE))
      this.player.waveUntil = time + 1200;
    const horizontal =
        Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
        Number(this.keys.A.isDown || this.keys.LEFT.isDown),
      vertical =
        Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
        Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (!horizontal && !vertical) {
      this.manualActive = false;
      return;
    }
    if (!this.manualActive) this.focusPlayer();
    this.manualActive = true;
    this.player.motion.replace([]);
    this.player.seatGoal = undefined;
    this.destinationSeat = undefined;
    return {
      x: Math.sign(horizontal + vertical),
      y: Math.sign(vertical - horizontal),
    };
  }
  private advanceActor(a: Actor, delta: number, manual?: Cell) {
    const wasMoving = a.moving;
    a.motion.advance(
      delta / 1000,
      (from, next) =>
        canStep(from, next, key(next) === a.seatGoal) &&
        !this.occupied(next, a.id),
      manual
        ? () => ({
            x: a.motion.cell.x + manual.x,
            y: a.motion.cell.y + manual.y,
          })
        : undefined,
    );
    a.cell = { ...a.motion.cell };
    a.movingTo = a.motion.target ? { ...a.motion.target } : undefined;
    a.moving = a.motion.moving;
    const direction = a.motion.direction;
    if (direction)
      a.direction = Math.max(
        0,
        directions.findIndex((d) => d.x === direction.x && d.y === direction.y),
      );
    if (a.moving) {
      a.seated = false;
      if (!wasMoving) a.stepStart = this.time.now;
    }
    const p = this.iso(a.motion.position);
    a.sprite.setPosition(p.x, p.y);
    this.align(a);
    if (!a.moving) {
      if (a.seatGoal === key(a.cell)) {
        a.seated = true;
        a.direction = this.seats.get(a.seatGoal)?.direction ?? a.direction;
      }
      const done = a.arrival;
      a.arrival = undefined;
      done?.();
    }
  }
  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const finish = () => {
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, finish);
        resolve();
      };
      this.time.delayedCall(ms, finish);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
    });
  }
  private walk(a: Actor, goal: Cell, seat = false): Promise<void> {
    if (!this.alive) return Promise.resolve();
    const route = pathfind(a.motion.target ?? a.motion.cell, goal, seat);
    if (!route.length && !a.motion.target) return Promise.resolve();
    a.seatGoal = seat ? key(goal) : undefined;
    a.motion.replace(route);
    return new Promise((resolve) => {
      a.arrival = resolve;
    });
  }
  private approach(a: Actor, target: Actor, reserved: Set<string>) {
    const choices = neighbors(target.cell)
      .filter((p) => !reserved.has(key(p)) && !this.occupied(p, a.id))
      .map((goal) => ({ goal, route: pathfind(a.cell, goal) }))
      .filter((p) => p.route.length || key(p.goal) === key(a.cell))
      .sort((x, y) => x.route.length - y.route.length);
    const best = choices[0];
    if (best) {
      reserved.add(key(best.goal));
      return best.goal;
    }
  }
  async agentVisit(from: string, to: string, text: string): Promise<void> {
    await this.perform({
      id: `visit:${this.sequence++}`,
      target: to,
      deliveries: [{ agent: from, text }],
      readyAt: 0,
    });
  }
  enqueueBridge(from: string, to: string, text: string) {
    this.queue.bridge(from, to, text, this.time.now);
  }
  private async perform(job: VisualJob) {
    if (!this.alive) return;
    const target =
      job.target === "user" ? this.player : this.agents.get(job.target);
    if (!target) return;
    const reserved = new Set<string>();
    const deliveries = job.deliveries
      .map((d) => ({ delivery: d, actor: this.agents.get(d.agent) }))
      .filter(
        (d): d is { delivery: typeof d.delivery; actor: Actor } =>
          !!d.actor && d.actor !== target && !this.visiting.has(d.actor.id),
      );
    try {
      for (const d of deliveries) this.visiting.add(d.actor.id);
      await Promise.all(
        deliveries.map(async (d) => {
          const goal = this.approach(d.actor, target, reserved);
          if (goal) await this.walk(d.actor, goal);
        }),
      );
      if (!this.alive) return;
      // The user may have continued walking during a visit. Approach the latest tile once.
      if (job.target === "user")
        await Promise.all(
          deliveries.map(async (d) => {
            if (
              Math.hypot(
                d.actor.cell.x - target.cell.x,
                d.actor.cell.y - target.cell.y,
              ) > 2
            ) {
              const goal = this.approach(d.actor, target, reserved);
              if (goal) await this.walk(d.actor, goal);
            }
          }),
        );
      for (const d of deliveries) {
        d.actor.waveUntil = this.time.now + 900;
        this.showBubble(
          d.actor,
          d.delivery.text,
          d.delivery.more,
          d.delivery.failed,
        );
      }
      await this.wait(2600);
      await Promise.all(
        deliveries.map(async (d) => {
          await this.walk(d.actor, d.actor.home, true);
          d.actor.seated = true;
        }),
      );
    } finally {
      for (const d of deliveries) this.visiting.delete(d.actor.id);
    }
  }
  private showBubble(actor: Actor, text: string, more = false, failed = false) {
    if (!this.alive) return;
    const shortened = text.length > 180 ? text.slice(0, 177) + "..." : text;
    const pixels = labelTexture(shortened + (more ? "\n[VER MAIS]" : ""), true);
    if (failed)
      for (let i = 0; i < pixels.data.length; i += 4)
        if (pixels.data[i] > 245 && pixels.data[i + 1] > 240) {
          pixels.data[i] = 255;
          pixels.data[i + 1] = 209;
          pixels.data[i + 2] = 201;
        }
    const texture = `speech-${this.sequence++}`;
    this.textures.addCanvas(texture, pixels.canvas());
    const image = this.add
      .image(actor.sprite.x, actor.sprite.y - 70, texture)
      .setOrigin(0.5, 1)
      .setDepth(100001);
    if (more)
      image
        .setData("chatAgent", actor.id)
        .setInteractive({ useHandCursor: true });
    this.bubbles.push({ actor, image, texture, born: this.time.now });
    while (this.bubbles.length > 16) this.removeBubble(this.bubbles[0]);
  }
  private removeBubble(b: Bubble) {
    b.image.destroy();
    this.textures.remove(b.texture);
    this.bubbles = this.bubbles.filter((item) => item !== b);
  }
  private updateActor(a: Actor, time: number) {
    const hovered = this.hovered === a,
      name = hovered || time < a.showNameUntil;
    a.label.setVisible(name);
    const blink =
      Math.floor((time + (a.id === "codex" ? 1700 : 0)) % 4500) > 4350;
    if (a.moving)
      a.sprite.setFrame(
        a.direction * 4 + (Math.floor((time - a.stepStart) / 125) % 4),
      );
    else if (time < a.waveUntil)
      a.sprite.setFrame(60 + (Math.floor(time / 150) % 4));
    else if (a.seated)
      a.sprite.setFrame(
        [
          "coding",
          "running_command",
          "installing",
          "testing",
          "analyzing_error",
        ].includes(a.status)
          ? 56 + (Math.floor(time / 180) % 4)
          : (blink ? 64 : 48) + a.direction,
      );
    else a.sprite.setFrame((blink ? 40 : 32) + a.direction);
    if (a.indicator) {
      const status =
        a.status === "disconnected"
          ? "offline"
          : ["error", "analyzing_error"].includes(a.status)
            ? "error"
            : a.status === "awaiting_approval"
              ? "approval"
              : ["talking", "in_meeting", "awaiting_agent"].includes(a.status)
                ? "talk"
                : a.status === "idle"
                  ? "idle"
                  : "busy";
      a.indicator
        .setTexture(`status-${status}`)
        .setAlpha(
          ["busy", "approval"].includes(status)
            ? Math.floor(time / 500) % 2
              ? 0.65
              : 1
            : 1,
        );
    }
    this.align(a);
  }
  update(time: number, delta: number) {
    if (!this.player || !this.alive) return;
    const tick = Math.floor(time / 360);
    if (tick !== this.ambientTick) {
      this.ambientTick = tick;
      this.ambient.forEach((a) =>
        a.sprite.setTexture(`prop-${a.kind}-${(tick + a.offset) % 3}`),
      );
    }
    this.advanceZoom(delta);
    const manual = this.readManualInput(time);
    this.advanceActor(this.player, delta, manual);
    this.agents.forEach((a) => this.advanceActor(a, delta));
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const cell = this.cellAt(world);
    const hover = this.iso(cell);
    const onCanvas =
      pointer.x >= 0 &&
      pointer.y >= 0 &&
      pointer.x < this.scale.width &&
      pointer.y < this.scale.height;
    this.highlight
      .setVisible(onCanvas && this.controlsEnabled && walkable(cell))
      .setPosition(hover.x, hover.y - 16);
    this.hovered = [this.player, ...this.agents.values()].find(
      (a) =>
        Math.abs(world.x - a.sprite.x) < 18 &&
        world.y < a.sprite.y &&
        world.y > a.sprite.y - 55,
    );
    this.updateActor(this.player, time);
    this.agents.forEach((a) => this.updateActor(a, time));
    const stacked = new Map<string, number>();
    for (const b of [...this.bubbles].reverse()) {
      const age = time - b.born;
      if (age > 9500) {
        this.removeBubble(b);
        continue;
      }
      const offset = stacked.get(b.actor.id) ?? 0;
      b.image
        .setPosition(
          Math.round(b.actor.sprite.x),
          Math.round(b.actor.sprite.y - 70 - offset - age / 1200),
        )
        .setAlpha(age > 7500 ? (9500 - age) / 2000 : 1);
      stacked.set(b.actor.id, offset + b.image.height + 5);
    }
    if (!this.processing) {
      const job = this.queue.take(
        time,
        (id) =>
          !["idle", "error", "disconnected"].includes(
            this.agents.get(id)?.status ?? "disconnected",
          ),
      );
      if (job) {
        this.processing = true;
        void this.perform(job)
          .catch(console.error)
          .finally(() => {
            this.processing = false;
          });
      }
    }
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
        active.isContentEditable ||
        !!active.closest(".floating-window"));
    if (!this.controlsEnabled) {
      this.prompt.setVisible(false);
      return;
    }
    this.target = undefined;
    const distance = (p: Cell) =>
      Math.max(
        Math.abs(this.player.cell.x - p.x),
        Math.abs(this.player.cell.y - p.y),
      );
    this.agents.forEach((a, id) => {
      if (distance(a.cell) <= 1) this.target = { kind: "chat", agentId: id };
    });
    if (!this.target && distance({ x: 4, y: 11 }) <= 2)
      this.target = { kind: "meeting" };
    if (!this.target)
      for (const [id, station] of [
        ["claude", { x: 4, y: 4 }],
        ["codex", { x: 19, y: 4 }],
      ] as const)
        if (distance(station) <= 1)
          this.target = { kind: "workstation", agentId: id };
    const text =
      this.target && !typing
        ? `[E] ${this.target.kind === "chat" ? "CONVERSAR" : this.target.kind === "meeting" ? "INICIAR REUNIAO" : "ABRIR ESTACAO"}`
        : "";
    if (text !== this.promptKey) {
      if (text) {
        const name = `prompt-${this.sequence++}`;
        this.textures.addCanvas(name, labelTexture(text).canvas());
        const old = this.prompt.texture.key;
        this.prompt.setTexture(name);
        if (old.startsWith("prompt-")) this.textures.remove(old);
      }
      this.promptKey = text;
    }
    this.prompt
      .setVisible(!!text)
      .setPosition(
        Math.round(this.player.sprite.x),
        Math.round(this.player.sprite.y) + 12,
      );
    if (!typing && Phaser.Input.Keyboard.JustDown(this.keys.E) && this.target)
      this.interact(this.target);
  }
}
