import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { OfficeScene, Interaction, roomViews } from "./OfficeScene";
import type { AgentInfo } from "../shared/types";
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
    const office = new OfficeScene((event) => callback.current(event));
    office.controlsEnabled = controlsEnabled;
    scene.current = office;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      fps: { target: 60 },
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
          api.on("agent-event", (event) => office.handleEvent(event)),
          api.on("bridge-message", (message) =>
            office.enqueueBridge(message.from, message.to, message.text),
          ),
          api.on("agents-changed", (list) => office.setAgents(list)),
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
    if (scene.current) scene.current.controlsEnabled = controlsEnabled;
  }, [controlsEnabled]);
  useEffect(() => {
    scene.current?.setAgents(agents);
  }, [agents]);
  return (
    <div className="game-stage">
      <div
        className="office-canvas"
        ref={host}
        aria-label="Escritório. Clique para andar, WASD para mover, espaço para acenar. Arraste com botão direito para explorar."
      />
      <details className="camera-menu">
        <summary title="Mapa e câmera">⌖ Mapa</summary>
        <div>
          {roomViews.map((room, index) => (
            <button
              key={room.name}
              onClick={() => scene.current?.focusRoom(index)}
            >
              {room.name}
            </button>
          ))}
          <button onClick={() => scene.current?.focusPlayer()}>
            ◎ Seguir meu avatar
          </button>
          <small>
            Roda: zoom 1× a 4×
            <br />
            Botão direito: arrastar
          </small>
        </div>
      </details>
      <div className="game-hint">Clique para andar · WASD · Espaço: acenar</div>
    </div>
  );
}
