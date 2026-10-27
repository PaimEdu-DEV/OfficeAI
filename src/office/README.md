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

The project workbench creates and opens real project folders, browses a lazy
directory tree, and displays files in Monaco. The execution workbench subscribes
to process output even when closed, keeps bounded logs, and supports starting,
stopping, and previewing local development processes. Logs have no history API;
only output received during the renderer session is available.

The worktree package files were reset and master merged to resolve the local BOM
issue. Fonts now ship locally through @fontsource rather than Google Fonts.
