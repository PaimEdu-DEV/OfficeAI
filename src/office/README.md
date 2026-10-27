# Office integration

`Office` mounts and destroys Phaser with React. Its `onInteract` callback emits
`{ kind: 'chat' | 'workstation' | 'meeting', agentId?: string }`.

`OfficeScene.agentVisit(from, to, text): Promise<void>` moves the source agent
along the collision grid to the recipient, displays the supplied text for 3.5
seconds, then returns home. `Office` already calls it on real `bridge-message`
events. The method does not synthesize or modify agent status. Concurrent visits
for the same source are ignored while its current visit is active.

Agent status is supplied through `setAgents` and `setStatus` from preload events.
Without preload, both resident characters remain disconnected. Walking and
bridge visits are presentation animations, independent of adapter status.

The room grid uses four-way A*. Furniture and partitions share the same collision
set. WASD/arrows move on grid axes; clicking the floor selects an A* destination.
E emits the nearby interaction. Typing in forms suspends keyboard movement.

Chat history, streaming, tool output, approval replies and file viewing use only
the shared preload contract. Monaco is bundled locally and read-only. Meeting
interaction opens an agent selector: the contract has no collective meeting API.

Validation: TypeScript check; frontend production bundle with in-memory PostCSS
override; grid reachability with furniture and wall rejection. Full Electron
smoke testing and live adapter verification remain integration checks. Standard
build currently encounters a pre-existing UTF-8 BOM in package.json; ownership
of that file is assigned to Claude in COLLAB.md.
