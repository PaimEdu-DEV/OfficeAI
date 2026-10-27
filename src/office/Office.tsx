import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { OfficeScene, Interaction } from "./OfficeScene";
import type { AgentInfo, AgentEvent, BridgeMessage } from "../shared/types";

export default function Office({
  agents,
  onInteract,
}: {
  agents: AgentInfo[];
  onInteract: (event: Interaction) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<OfficeScene>();
  const callback = useRef(onInteract);
  callback.current = onInteract;
  useEffect(() => {
    const office = new OfficeScene((event) => callback.current(event));
    scene.current = office;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      pixelArt: true,
      antialias: false,
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
      className="office-canvas"
      ref={host}
      aria-label="Escritório isométrico. Use WASD ou clique no chão para caminhar e E para interagir."
    />
  );
}
