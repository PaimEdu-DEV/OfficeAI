# Office integration

The canvas fills the Electron content area. React provides a bottom dock and
independent draggable, resizable, light floating windows. Agent, project and
execution content reuse their real preload APIs. MeetingPanel is wrapped without
changing its logic. Pixelify Sans is a freely licensed, locally bundled UI font.
All game art remains original raster artwork; no commercial game assets are used.

## Navigation

The 24 x 22 collision grid uses 8-way A* with octile distance. Diagonal steps
require both adjacent cardinal cells to be clear, preventing corner cutting.
A cardinal tile takes 500 ms, a diagonal sqrt(2) times that duration. A completed
step snaps to the tile center. A route selected mid-step starts at the current
step's destination. Furniture remains blocked; only a selected chair is allowed
as a final endpoint. Clicking an unoccupied chair seats the user. WASD/arrows are
screen-relative, including combinations; Space waves; E opens nearby interaction.

The camera follows with interpolation and has map bounds. Mouse wheel uses
integer zoom 1x through 4x around the cursor. Right/middle drag pans; left drag
also pans on empty floor. A compact Map menu selects rooms or resumes following.
The floor under the pointer is highlighted. Names appear on hover/selection.

## Artwork

pixels.ts and art.ts create original ImageData textures, 64 x 32 floor tiles,
three shaded prop faces, one-pixel outlines, translucent shadows, windows and
baked lighting. No Phaser Graphics or Canvas vector paths are used. Server LEDs
and coffee steam update at a low rate. Character atlases have 72 frames: eight
walking directions x four frames, directional idle/blink/seated poses, typing
and waving, plus seated blinking. The renderer targets 60 fps with nearest-neighbor pixels.

## Real event choreography

OfficeScene.handleEvent consumes live agent-event events; status only comes from
preload. ChoreographyQueue is presentation-only and never calls or awaits an
adapter. Delegation sent visits the recipient. Done returns the delegated agent
to the owner; if the owner is still composing, the queue waits for its real final
reply and groups both agents into a visit to the user. Other ready jobs continue.
Final replies visit the user's current location and return home. Failure balloons
are red. Pending repeated events are grouped/deduplicated, while React receives
all real messages immediately regardless of animation progress.

OfficeScene.agentVisit(from, to, text) remains available for direct integration;
live bridge-message events enter the same presentation queue. Visits do not
synthesize status. Bubbles stack above actors, rise, fade and expire; a final
reply bubble opens the real chat via [VER MAIS]. User-message bubbles also derive
from actual preload events. Temporary textures are released after expiry.

Validation includes TypeScript, Vite/Electron build, corner-blocking and seat
path checks, queue grouping in both arrival orders, and Electron screenshots and
input checks. The native execution confirmation remains a backend interaction.
