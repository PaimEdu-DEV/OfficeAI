import Phaser from "phaser";
import type { AgentInfo, AgentStatus } from "../shared/types";
import { blocked, Cell, COLS, key, pathfind, ROWS, walkable } from "./grid";

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
type Actor = {
  cell: Cell;
  home: Cell;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  indicator: Phaser.GameObjects.Text;
  status: AgentStatus;
  moving: boolean;
};
export class OfficeScene extends Phaser.Scene {
  private player!: Actor;
  private agents = new Map<string, Actor>();
  private route: Cell[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Text;
  private target?: Interaction;
  private pending: AgentInfo[] = [];
  private visits = new Set<string>();
  constructor(private interact: (event: Interaction) => void) {
    super("office");
  }
  private iso(p: Cell) {
    return { x: 620 + (p.x - p.y) * 25, y: 85 + (p.x + p.y) * 12 };
  }
  create() {
    this.cameras.main.setBackgroundColor("#101922");
    const g = this.add.graphics();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const p = this.iso({ x, y });
        const color =
          x < 8
            ? y < 8
              ? 0x34454e
              : y < 14
                ? 0x364653
                : 0x35433f
            : x < 15
              ? 0x283842
              : y < 8
                ? 0x333e52
                : y < 14
                  ? 0x3c4050
                  : 0x343c47;
        g.fillStyle(color + ((x + y) % 2 ? 0x020202 : 0));
        g.fillPoints(
          [
            { x: p.x, y: p.y },
            { x: p.x + 25, y: p.y + 12 },
            { x: p.x, y: p.y + 24 },
            { x: p.x - 25, y: p.y + 12 },
          ],
          true,
        );
        g.lineStyle(1, 0x8198a1, 0.1);
        g.strokePoints(
          [
            { x: p.x, y: p.y },
            { x: p.x + 25, y: p.y + 12 },
            { x: p.x, y: p.y + 24 },
            { x: p.x - 25, y: p.y + 12 },
          ],
          true,
        );
        if (blocked.has(key({ x, y }))) {
          const glass = x === 8 || (y === 8 && x < 9);
          const wall = this.add.graphics().setDepth(p.y + 22);
          wall.fillStyle(glass ? 0x7dd9dd : 0x526576, glass ? 0.22 : 0.85);
          wall.fillPoints(
            [
              { x: p.x - 23, y: p.y + 10 },
              { x: p.x, y: p.y + 22 },
              { x: p.x + 23, y: p.y + 10 },
              { x: p.x + 23, y: p.y - 16 },
              { x: p.x, y: p.y - 4 },
              { x: p.x - 23, y: p.y - 16 },
            ],
            true,
          );
          wall.lineStyle(1, glass ? 0x9ce7e7 : 0x738899, 0.5);
          wall.lineBetween(p.x - 23, p.y - 16, p.x, p.y - 4);
          wall.lineBetween(p.x, p.y - 4, p.x + 23, p.y - 16);
        }
      }
    const rooms: [number, number, string][] = [
      [3, 1, "DIRETOR / CLAUDE"],
      [11, 1, "RECEPÇÃO"],
      [19, 1, "DEV / CODEX"],
      [3, 9, "REUNIÕES"],
      [11, 9, "CORREDOR"],
      [19, 9, "ÁREA COMUM"],
      [3, 16, "EXPANSÃO 01"],
      [19, 16, "EXPANSÃO 02"],
    ];
    rooms.forEach(([x, y, name]) => {
      const p = this.iso({ x, y });
      this.add
        .text(p.x, p.y, name, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#9fb2c3",
          backgroundColor: "#172631",
        })
        .setOrigin(0.5)
        .setDepth(1000);
    });
    this.desk(4, 4, true);
    this.desk(19, 4, true);
    this.desk(11, 4, false);
    for (let x = 3; x <= 5; x++) this.desk(x, 11, false);
    this.desk(19, 11, false);
    // Conference display and chairs are drawn from original geometric pixel shapes.
    const screen = this.iso({ x: 2, y: 10 });
    this.add
      .rectangle(screen.x, screen.y - 26, 42, 25, 0x152334)
      .setDepth(screen.y + 24);
    this.add
      .rectangle(screen.x, screen.y - 26, 35, 18, 0x74b7ba)
      .setDepth(screen.y + 25);
    for (const cell of [
      { x: 3, y: 10 },
      { x: 5, y: 10 },
      { x: 3, y: 12 },
      { x: 5, y: 12 },
    ]) {
      blocked.add(key(cell));
      const p = this.iso(cell);
      this.add.rectangle(p.x, p.y + 6, 18, 12, 0x25374c).setDepth(p.y + 24);
      this.add.rectangle(p.x, p.y - 2, 18, 12, 0x62748a).setDepth(p.y + 25);
    }
    for (const cell of [
      { x: 2, y: 6 },
      { x: 21, y: 6 },
      { x: 17, y: 12 },
      { x: 13, y: 19 },
    ]) {
      blocked.add(key(cell));
      const p = this.iso(cell);
      this.add.rectangle(p.x, p.y + 6, 13, 14, 0x9b7961).setDepth(p.y + 20);
      this.add.rectangle(p.x, p.y - 7, 22, 20, 0x569b7c).setDepth(p.y + 21);
    }
    this.makeTexture("user", 0x8fbaed);
    this.makeTexture("claude", 0xd99b7e);
    this.makeTexture("codex", 0x82d7c0);
    this.player = this.actor("user", { x: 11, y: 6 }, "Você");
    this.agents.set("claude", this.actor("claude", { x: 5, y: 5 }, "Claude"));
    this.agents.set("codex", this.actor("codex", { x: 20, y: 5 }, "Codex"));
    this.prompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e0fff4",
        backgroundColor: "#132b31",
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(2000);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,E,UP,DOWN,LEFT,RIGHT",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.disableGlobalCapture();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const dx = pointer.worldX - 620,
        dy = pointer.worldY - 85 - 12;
      const cell = {
        x: Math.round((dx / 25 + dy / 12) / 2),
        y: Math.round((dy / 12 - dx / 25) / 2),
      };
      this.route = pathfind(this.player.cell, cell);
    });
    this.scale.on("resize", this.fit, this);
    this.fit();
    this.setAgents(this.pending);
  }
  private fit() {
    const camera = this.cameras.main;
    camera.setZoom(Math.min(this.scale.width / 1240, this.scale.height / 700));
    camera.centerOn(620, 350);
  }
  private makeTexture(name: string, shirt: number) {
    const g = this.make.graphics({ x: 0, y: 0 });
    for (let frame = 0; frame < 4; frame++) {
      const x = frame * 24,
        step = frame % 2 ? 2 : 0;
      g.fillStyle(0x0b1420, 0.35);
      g.fillEllipse(x + 12, 33, 20, 7);
      g.fillStyle(0x182536);
      g.fillRect(x + 6, 24, 5, 8 - step);
      g.fillRect(x + 14, 24, 5, 6 + step);
      g.fillStyle(shirt);
      g.fillRect(x + 5, 13, 15, 13);
      g.fillRect(x + 2, 15 + step, 4, 9);
      g.fillRect(x + 20, 15 - step, 3, 9);
      g.fillStyle(0xeac5a5);
      g.fillRect(x + 6, 3, 13, 12);
      g.fillStyle(0x34313c);
      g.fillRect(x + 5, 1, 15, 5);
      g.fillRect(x + 15, 8, 2, 2);
    }
    g.generateTexture(name, 96, 40);
    g.destroy();
    const texture = this.textures.get(name);
    for (let i = 0; i < 4; i++) texture.add(i, 0, i * 24, 0, 24, 40);
    this.anims.create({
      key: `${name}-walk`,
      frames: [0, 1, 2, 3].map((frame) => ({ key: name, frame })),
      frameRate: 9,
      repeat: -1,
    });
  }
  private actor(texture: string, cell: Cell, name: string): Actor {
    const p = this.iso(cell);
    return {
      cell,
      home: { ...cell },
      sprite: this.add
        .sprite(p.x, p.y + 15, texture, 0)
        .setOrigin(0.5, 0.85)
        .setScale(1.3)
        .setDepth(p.y + 24),
      label: this.add
        .text(p.x, p.y - 38, name, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#e1e9ef",
        })
        .setOrigin(0.5)
        .setDepth(1500),
      indicator: this.add
        .text(p.x, p.y - 54, "○ Desconectado", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#8393a3",
        })
        .setOrigin(0.5)
        .setDepth(1500),
      status: "disconnected",
      moving: false,
    };
  }
  private desk(x: number, y: number, monitors: boolean) {
    blocked.add(key({ x, y }));
    const p = this.iso({ x, y }),
      g = this.add.graphics().setDepth(p.y + 23);
    g.fillStyle(0x172331);
    g.fillRect(p.x - 22, p.y - 4, 5, 27);
    g.fillRect(p.x + 17, p.y - 4, 5, 27);
    g.fillStyle(0xa08368);
    g.fillPoints(
      [
        { x: p.x - 32, y: p.y - 8 },
        { x: p.x, y: p.y - 23 },
        { x: p.x + 32, y: p.y - 8 },
        { x: p.x, y: p.y + 8 },
      ],
      true,
    );
    if (monitors)
      for (let i = -1; i <= 1; i++) {
        g.fillStyle(0x111d2b);
        g.fillRect(p.x + i * 16 - 7, p.y - 36, 15, 20);
        g.fillStyle(0x74c8c4);
        g.fillRect(p.x + i * 16 - 5, p.y - 34, 11, 14);
        g.fillStyle(0x385e72);
        g.fillRect(p.x + i * 16 - 3, p.y - 31, 7, 2);
      }
    else {
      g.fillStyle(0x26394c);
      g.fillRect(p.x - 13, p.y - 21, 26, 12);
    }
  }
  setAgents(agents: AgentInfo[]) {
    this.pending = agents;
    this.agents.forEach((actor, id) => {
      actor.status = agents.find((a) => a.id === id)?.status ?? "disconnected";
    });
  }
  setStatus(id: string, status: AgentStatus) {
    this.pending = this.pending.map((a) =>
      a.id === id ? { ...a, status } : a,
    );
    const actor = this.agents.get(id);
    if (actor) actor.status = status;
  }
  private step(actor: Actor, next: Cell): Promise<void> {
    if (!walkable(next)) return Promise.resolve();
    actor.moving = true;
    actor.cell = next;
    actor.sprite.play(`${actor.sprite.texture.key}-walk`, true);
    const p = this.iso(next);
    return new Promise((resolve) =>
      this.tweens.add({
        targets: actor.sprite,
        x: p.x,
        y: p.y + 15,
        duration: 155,
        onUpdate: () => {
          actor.sprite.setDepth(actor.sprite.y + 9);
          actor.label.setPosition(actor.sprite.x, actor.sprite.y - 53);
          actor.indicator.setPosition(actor.sprite.x, actor.sprite.y - 69);
        },
        onComplete: () => {
          actor.moving = false;
          actor.sprite.stop().setFrame(0);
          resolve();
        },
      }),
    );
  }
  /** Visualizes only real bridge messages supplied by the host. Does not change agent status. */
  async agentVisit(from: string, to: string, text: string): Promise<void> {
    const a = this.agents.get(from),
      b = this.agents.get(to);
    if (!a || !b || this.visits.has(from)) return;
    this.visits.add(from);
    try {
      for (const cell of pathfind(a.cell, b.cell).slice(0, -1))
        await this.step(a, cell);
      const bubble = this.add
        .text(a.sprite.x, a.sprite.y - 90, text, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#15232f",
          backgroundColor: "#e2f0e9",
          padding: { x: 12, y: 10 },
          wordWrap: { width: 240 },
        })
        .setOrigin(0.5, 1)
        .setDepth(2200);
      await new Promise<void>((resolve) =>
        this.time.delayedCall(3500, resolve),
      );
      bubble.destroy();
      for (const cell of pathfind(a.cell, a.home)) await this.step(a, cell);
    } finally {
      this.visits.delete(from);
    }
  }
  update(time: number) {
    if (!this.player) return;
    const typing =
      document.activeElement instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement.tagName,
      ) ||
        document.activeElement.isContentEditable);
    if (typing) {
      this.route = [];
      this.prompt.setText("");
      return;
    }
    if (!this.player.moving) {
      let delta: Cell | undefined;
      if (this.keys.W.isDown || this.keys.UP.isDown) delta = { x: 0, y: -1 };
      else if (this.keys.S.isDown || this.keys.DOWN.isDown)
        delta = { x: 0, y: 1 };
      else if (this.keys.A.isDown || this.keys.LEFT.isDown)
        delta = { x: -1, y: 0 };
      else if (this.keys.D.isDown || this.keys.RIGHT.isDown)
        delta = { x: 1, y: 0 };
      if (delta) {
        this.route = [];
        void this.step(this.player, {
          x: this.player.cell.x + delta.x,
          y: this.player.cell.y + delta.y,
        });
      } else if (this.route.length)
        void this.step(this.player, this.route.shift()!);
    }
    this.target = undefined;
    const distance = (p: Cell) =>
      Math.abs(this.player.cell.x - p.x) + Math.abs(this.player.cell.y - p.y);
    this.agents.forEach((a, id) => {
      const active = !["idle", "disconnected"].includes(a.status);
      a.indicator
        .setText(
          `${a.status === "disconnected" ? "○" : active ? "◆" : "●"} ${statusLabels[a.status]}`,
        )
        .setColor(
          a.status === "error"
            ? "#ff8e95"
            : a.status === "awaiting_approval"
              ? "#ffd280"
              : a.status === "disconnected"
                ? "#8393a3"
                : "#91e4c8",
        );
      a.indicator.setAlpha(active ? 0.72 + Math.sin(time / 260) * 0.28 : 1);
      if (!a.moving) {
        a.sprite.setAngle(
          a.status === "error" || a.status === "analyzing_error"
            ? Math.sin(time / 70) * 3
            : 0,
        );
        a.sprite.setFrame(
          active
            ? Math.floor(time / (a.status === "coding" ? 130 : 350)) % 4
            : 0,
        );
      }
      if (distance(a.cell) <= 2) this.target = { kind: "chat", agentId: id };
    });
    if (!this.target && distance({ x: 4, y: 11 }) <= 2)
      this.target = { kind: "meeting" };
    if (!this.target)
      for (const [id, cell] of [
        ["claude", { x: 4, y: 4 }],
        ["codex", { x: 19, y: 4 }],
      ] as const)
        if (distance(cell) <= 2)
          this.target = { kind: "workstation", agentId: id };
    this.prompt
      .setPosition(this.player.sprite.x, this.player.sprite.y + 40)
      .setText(
        this.target
          ? `[E] ${this.target.kind === "chat" ? "Conversar" : this.target.kind === "meeting" ? "Iniciar reunião" : "Abrir estação de trabalho"}`
          : "",
      );
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) && this.target)
      this.interact(this.target);
  }
}
