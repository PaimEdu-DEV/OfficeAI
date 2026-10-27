import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { OfficeScene, Interaction, roomViews } from "./OfficeScene";
import type { AgentInfo, AgentEvent, BridgeMessage } from "../shared/types";

export default function Office({
  agents,
  onInteract,
  controlsEnabled = true,
}: {
  agents: AgentInfo[];
  onInteract: (event: Interaction) => void;
  controlsEnabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<OfficeScene>();
  const callback = useRef(onInteract);
  callback.current = onInteract;
  useEffect(() => {
    if (scene.current) scene.current.controlsEnabled = controlsEnabled;
  }, [controlsEnabled]);
  useEffect(() => {
    const office = new OfficeScene((event) => callback.current(event));
    scene.current = office;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      fps: { target: 30, forceSetTimeOut: true },
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: host.current!.clientWidth,
        height: host.current!.clientHeight,
      },
      scene: office,
      audio: { noAudio: true },
    });
    const resize = new ResizeObserver(() => {
      if (host.current)
        game.scale.resize(host.current.clientWidth, host.current.clientHeight);
    });
    resize.observe(host.current!);
    const api = window.aiOffice;
    const off = api
      ? [
          api.on("agent-event", (event: AgentEvent) => {
            if (event.kind === "status")
              office.setStatus(event.agentId, event.status);
          }),
          api.on("bridge-message", (message: BridgeMessage) => {
            void office.agentVisit(message.from, message.to, message.text);
          }),
        ]
      : [];
    return () => {
      off.forEach((fn) => fn());
      resize.disconnect();
      game.destroy(true);
      scene.current = undefined;
    };
  }, []);
  useEffect(() => {
    scene.current?.setAgents(agents);
  }, [agents]);
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        className="office-canvas"
        style={{ width: "100%", height: "100%" }}
        ref={host}
        aria-label="Escritório isométrico. Use WASD ou clique no chão para caminhar e E para interagir."
      />
      <nav
        aria-label="Câmera do escritório"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          pointerEvents: "none",
        }}
      >
        {roomViews.map((room, index) => (
          <button
            key={room.name}
            style={{
              pointerEvents: "auto",
              padding: "6px 9px",
              borderRadius: 3,
              border: "1px solid #688194",
              color: "#fff8e4",
              background: "#25495ee8",
              fontSize: 10,
            }}
            onClick={() => scene.current?.focusRoom(index)}
          >
            {room.name}
          </button>
        ))}
        <button
          style={{ pointerEvents: "auto", padding: "6px 9px", fontSize: 10 }}
          onClick={() => scene.current?.setZoom(2)}
        >
          2×
        </button>
        <button
          style={{ pointerEvents: "auto", padding: "6px 9px", fontSize: 10 }}
          onClick={() => scene.current?.setZoom(3)}
        >
          3×
        </button>
        <button
          style={{ pointerEvents: "auto", padding: "6px 9px", fontSize: 10 }}
          onClick={() => scene.current?.focusPlayer()}
        >
          ◎ Você
        </button>
      </nav>
      <span
        style={{
          position: "absolute",
          right: 12,
          bottom: 10,
          color: "#ecedd8",
          fontSize: 10,
          padding: "5px 9px",
          background: "#17384ed9",
          pointerEvents: "none",
        }}
      >
        Arraste para explorar · Scroll: 2× / 3×
      </span>
    </div>
  );
}
