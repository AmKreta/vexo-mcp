# svgtool MCP server

Lets an AI agent (Claude Code, Claude Desktop, or any MCP client) use React Svg Editor: draw and edit shapes, manage pages and palettes, animate with timelines and cutscenes, search images, preview work, and export SVG, PNG, JSON or MP4.

The editor keeps its documents in the browser (Redux state and IndexedDB), so the agent works through the editor tab you have open:

```
agent ⇄ (MCP over stdio) ⇄ mcp-server ⇄ (websocket, 127.0.0.1:7341) ⇄ editor tab
```

Each tool runs the editor's own actions in that tab, so you see every change on the canvas as it happens, and edits are recorded into the open clip, just as if you had made them yourself. The API keeps the older `cutscene` name for clip-related tools.

## Setup

```sh
cd mcp-server && npm install
```

**Claude Code:** the repo's `.mcp.json` already registers the server as `svgtool`. Approve it when Claude Code asks, or run `/mcp`.

**Other clients**, for example Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "svgtool": {
      "command": "node",
      "args": ["/absolute/path/to/svgEditor/mcp-server/src/index.js"]
    }
  }
}
```

Then start the editor from the repository root with `npm run dev:frontend` and open it in a browser. In development the editor connects to the server by itself and retries every few seconds, so the server and the editor can be started in either order. Ask the agent to run `editor_status` to check the connection.

With several editor tabs open, the agent works in the one you focused last.

**With Docker:** the repository's `docker-compose.yml` has an `mcp` service. MCP talks over stdio, so the client starts the container itself; `docker compose up` leaves it out. Build it once with `docker compose build mcp`, then point the client at:

```json
{
  "mcpServers": {
    "svgtool": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/absolute/path/to/svgEditor/docker-compose.yml",
        "run",
        "--rm",
        "-T",
        "--service-ports",
        "mcp"
      ]
    }
  }
}
```

Keep `-T`: a terminal would corrupt the MCP messages. `--service-ports` publishes the editor bridge on `127.0.0.1:7341` (set `MCP_BRIDGE_PORT` to change it, and `VITE_MCP_BRIDGE_URL` in the editor to match). The server's source is mounted into the container, so edits apply the next time the client starts it; rebuild after changing dependencies. Only one copy can hold the bridge port, so stop a locally started server first.

## Tools

Each `server.registerTool(...)` call automatically exposes its name, title, description, and input schema through MCP's standard tool listing. No separate listing tool is needed.

| Area                | Tools                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection          | `editor_status` — check whether the editor tab is connected and what is open.                                                                                                                                                                                                                                                                                                                        |
| History             | `undo`, `redo` — undo or redo the most recent editor change.                                                                                                                                                                                                                                                                                                                                          |
| Documents           | `list_documents`, `open_document`, `new_document`, `save_document`, `export_document`, `get_document` — browse, load, create, save, export JSON, and inspect the current page.                                                                                                                                                                                                                       |
| Images              | `search_images` — search clip art, illustrations, vectors, and photos for use on the canvas.                                                                                                                                                                                                                                                                                                         |
| Shapes              | `add_shape`, `update_shape`, `get_shape`, `delete_shapes`, `duplicate_shapes`, `select_shapes`, `group_shapes`, `move_into_group` — draw, inspect, modify, arrange, and remove shapes, groups, mirrors, motion paths and draws (`add_shape` type `mirror`, `motionPath` or `draw`); `release_from_modifier` and `convert_to_motion_path` manage motion paths and draws. Shape properties include modifiers, particles, mirror sections, motion path and draw settings, geometry, text, CSS filters, paint, and transforms.                                                                                                                    |
| Bones and camera    | `add_bone`, `connect_bones`, `update_joint`, `disconnect_joint`, `add_bone_socket`, `remove_bone_sockets`, `attach_bone_artwork`, `detach_bone_artwork`, `set_camera`, `remove_from_camera` — build and edit rigs, set joint angles/limits and IK, attach artwork, adjust the independent camera frame and its follow target, and manage artwork attached to the camera.                                                                                                                                 |
| Audio               | `get_audio`, `add_audio_timeline`, `update_audio_timeline`, `delete_audio_timeline`, `add_audio_clip`, `update_audio_clip`, `delete_audio_clip`, `set_audio_duration` — create narration or sound clips, arrange and mute audio rows, and set the page’s audio length.                                                                                                                                                                      |
| Layers              | `set_layer_visibility` — show or hide page layers without using opacity or adding animation. Hiding a group also hides its descendants.                                                                                                                                                                                                                                                                   |
| Reusable styling    | `list_colors`, `add_color`, `update_color`, `remove_color`, `add_gradient`, `update_gradient`, `remove_gradient`, `add_svg_filter`, `update_svg_filter`, `remove_svg_filter` — shared palette colours and gradients; outline and shadow filters; creative `effect` filters (grain, paper, ripple, boil, glitch, crt, hologram, smoke, dissolve, goo, pixelate, neon, duotone, posterize, emboss, rgbSplit, inkEdges) whose controls can be animated in clips. Shapes also take `style.blendMode` and `style.strokeTaper`. |
| Custom filters      | `list_filter_presets`, `create_filter_preset`, `update_filter_preset`, `delete_filter_preset` — project filters written as React-style TSX components (`source`) or filter markup; they live in the Filesystem and appear under Project presets. |
| Particles           | `list_particle_presets`, `create_particle_preset`, `update_particle_preset`, `delete_particle_preset` — particle setups, including `type: "custom"` particles drawn by a TSX `component` (or an expression `script`). Shapes made from a preset follow its edits. |
| Canvas and pages    | `set_canvas`, `add_page`, `remove_page`, `set_active_page` — set the background and dimensions, and organize scenes as pages.                                                                                                                                                                                                                                                                        |
| Timelines and clips | `get_timelines`, `add_timeline`, `rename_timeline`, `delete_timeline`, `update_timeline`, `add_cutscene`, `open_cutscene`, `update_cutscene`, `delete_cutscene`, `set_transition` — create or open one timeline per shapeId (including groups and sprites), or add an empty row and choose its shape later. The shape binding is permanent. Then edit clips, timing, easing, repeats, camera views and enter/exit effects. Artwork remains on the page when its timeline is removed. |
| Project assets       | `list_sprites`, `create_sprite_sheet`, `update_sprite_sheet`, `add_sprite_page`, `set_sprite_controls`, `set_editor`, `place_sprite`, `update_sprite_instance`, `trim_sprite_clip`, `list_project_files`, `create_project_folder`, `rename_project_folder`, `add_project_file`, `update_project_file`, `place_project_file`, `list_patterns`, `create_pattern`, `update_pattern`, `delete_pattern` — reusable sprites and patterns, and the project Filesystem (folders, files, sprites, filter and particle presets). `set_editor` opens the Scene, Sprite Sheet, Pattern, Filter or Particle Editor. |
| Playback and guides | `set_loop`, `set_play_range`, `play_animation`, `stop_animation`, `set_helpers` — control preview and show or hide editor guides.                                                                                                                                                                                                                                                                    |
| Output              | `export_svg`, `export_animated_svg`, `export_mp4`, `screenshot` — export static or animated work, or preview a PNG (pass `time` to inspect an animation moment).                                                                                                                                                                                                                                     |

## Best practices

- Start with `get_document` and `get_timelines` so you know the canvas size, existing shapes, palette, pages, and open cutscene before editing.
- Reuse palette colors and gradients across the document. `add_color` and `add_gradient` return a fill reference such as `url(#id)`; `list_colors` and `get_document` show existing references. Update a shared palette entry to change all shapes that use it.
- For repeated geometry, add one shape and give it an array modifier in `properties.modifiers`. Choose linear for rows, radial for rings, or random for scatters. `count` is the number of copies in addition to the source shape; `delay` staggers animation across linear copies.
- Use `properties.particles` for effects such as fireworks, snow, confetti, embers, and sparkles. Set `hideSource` if the emitter itself should not be visible.
- Group related shapes as soon as they form an object, give the group a clear name, and nest groups for larger assemblies. Prefer grouping before adding timelines; animate the group when its parts should move together.
- For character rigs, add bone segments or sockets, connect free tail/head endpoints, and attach the drawn artwork to the bones. Use `update_joint` for joint angle limits and terminal-chain IK. The camera frame is independent of the drawing canvas; `set_camera` adjusts its start position and width and can follow a moving shape (`follow`), while camera animation belongs in a camera timeline. `move_into_group` with `groupId: "camera"` attaches HUDs, titles or subtitles to the camera so they stay put on screen; `remove_from_camera` detaches them.
- For symmetric artwork, `add_shape` a `mirror`, draw only its first section, then `move_into_group` those shapes into the mirror; the other sections reflect them live.
- To move a shape along a route, `add_shape` a `motionPath`, `move_into_group` an outline into it first (it becomes the path) and then the travelling shape, or `convert_to_motion_path` an existing outline. Change `properties.motionPath.progress` from 0 to 100 inside a clip to move it; `rotate` turns it along the way.
- To draw outlines on stroke by stroke, `add_shape` a `draw`, `move_into_group` stroked shapes into it, set `properties.draw.end` to 0, then to 100 inside a clip. `order`, `direction`, `startPoint` and `fill` shape how it draws.
- Use `get_audio` to inspect audio before editing. Add speech clips for browser-synthesized narration or file clips with an audio URL/data URL, then use `update_audio_clip` for timing and voice settings.
- `get_document` reports `hiddenShapeIds`. Use `set_layer_visibility` for page-layer visibility rather than changing opacity in a clip.
- For a repeating motion, animate one cycle in a cutscene, then set `repeat` and `loop` with `update_cutscene`. Use `alternate` for back-and-forth motion, `continue` when movement or rotation should accumulate, and `repeatDelay` for a pause. Repeats stop at the next cutscene or the playback-range end.
- Make a new page for a distinct scene and use cutscenes for changes within a scene. Preview with `play_animation` or `screenshot`, then call `save_document` to persist the work.

Changes stay in the tab until `save_document` is called, as in the editor itself. `open_document` and `new_document` replace the open document, and anything unsaved is lost.

## Configuration

| Where  | Variable                     | Default               |                                                                             |
| ------ | ---------------------------- | --------------------- | --------------------------------------------------------------------------- |
| server | `SVG_EDITOR_BRIDGE_PORT`     | `7341`                | port the editor connects to                                                 |
| server | `SVG_EDITOR_BRIDGE_HOST`     | `127.0.0.1`           | address the websocket listens on; `0.0.0.0` inside Docker                   |
| server | `SVG_EDITOR_ALLOWED_ORIGINS` | none                  | comma-separated extra sites allowed to connect; localhost is always allowed |
| editor | `VITE_MCP_BRIDGE_URL`        | `ws://127.0.0.1:7341` | must match the server's port                                                |
| editor | `VITE_MCP_BRIDGE`            | on in development     | `true` to connect from a production build, `false` to never connect         |

The websocket listens on 127.0.0.1 (in Docker it listens inside the container, and the port is published on 127.0.0.1 only), and it refuses browser pages from sites other than localhost unless you list them.

## Tests

```sh
npm test
```

## Sprite and batch workflows

The bridge now supports the scene editor and sprite sheet editor. `get_document` identifies the
active workspace and lists project sprites, animation pages, controls, folders and file metadata.
Project JSON export includes the whole project, even while a sprite page is open.

| Area                   | New tools                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Batching               | `batch_edit` — 1–50 ordered add/update/group/delete operations in one bridge call.                                   |
| Sprites                | `list_sprites`, `create_sprite_sheet`, `update_sprite_sheet`, `add_sprite_page`, `update_sprite_page`, `set_editor`. |
| Controls and placement | `set_sprite_controls`, `place_sprite`, `update_sprite_instance`, `trim_sprite_clip`.                                 |
| Filesystem             | `create_project_folder`, `rename_project_folder`, `list_project_files`, `add_project_file`, `update_project_file`, `place_project_file`. |
| Patterns               | `list_patterns`, `create_pattern`, `update_pattern`, `delete_pattern`, `set_editor` with `view: "pattern"`.          |
| Stacking               | `bring_to_front` — permanent, or temporary until another shape is selected.                                          |

### Build, inspect, refine

Prefer one batch per coherent object or layer (usually 10–30 operations). An operation can name
its result with `ref`; later ID fields use `$ref`. Returned `refs` contain real IDs for later calls.
Text strings such as `$price` remain literal. References work in `id`, `ids`, `containerId`, and
`targetShapeId` fields. They are scoped to one batch and must refer to earlier successful edits.

```json
{
  "operations": [
    {
      "tool": "add_shape",
      "ref": "body",
      "args": {
        "type": "rectangle",
        "x": 100,
        "y": 100,
        "properties": { "width": 80, "height": 60 },
        "style": { "fill": "#6c5cff", "strokeWidth": 0 }
      }
    },
    {
      "tool": "add_shape",
      "ref": "eye",
      "args": {
        "type": "circle",
        "x": 125,
        "y": 120,
        "properties": { "radius": 5 },
        "style": { "fill": "white", "strokeWidth": 0 }
      }
    },
    {
      "tool": "group_shapes",
      "ref": "robot",
      "args": { "ids": ["$body", "$eye"], "name": "Robot" }
    }
  ]
}
```

Batch edits use the same command validation and timeline ownership rules as single edits. They
stop on the first failure and report completed operations, real IDs, the failing index and remaining
count. Completed work stays applied; retry only unfinished work. Edits stop if the document,
page or editing clip changes. The editor paints between small chunks to remain responsive.

### Write a custom filter or particles

Custom filters and particles are React-style TSX components, the same code people see in the
Filter and Particle Editors. They run in a sandboxed engine (QuickJS) in the editor, not on the
page, and their output is sanitized; only `react` can be imported.

1. Filter: `create_filter_preset` with `name` and `source`:

   ```tsx
   export const controls = {
     color: { type: 'color', label: 'Glow colour', default: '#00e5ff' },
     size: { type: 'number', label: 'Size', default: 8, min: 0, max: 40 },
   } as const;
   export default function Glow({ color, size, t }) {
     return (
       <>
         <feGaussianBlur in="SourceAlpha" stdDeviation={size * (0.6 + 0.4 * sin(t * tau))} result="b" />
         <feFlood floodColor={color} />
         <feComposite in2="b" operator="in" result="glow" />
         <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
       </>
     );
   }
   ```

   Props: each control, `t` (seconds) and `box` (the shape's bounds). Apply it with
   `add_svg_filter` `{ type: "effect", preset: <id> }`; change its controls inside a clip with
   `update_svg_filter` to animate them.
2. Particles: set `properties.particles` to `{ type: "custom", component }` with `update_shape`,
   or save it first with `create_particle_preset`. The component exports `emitter` (count, ttl,
   spread, loop, size, colours) and `controls`, and draws one particle around (0, 0):
   `export default function Spark({ u, k, size, color }) { return <circle cx={cos(k*tau)*80*u} cy={sin(k*tau)*80*u} r={size} fill={color} opacity={1-u} />; }`.
   Props: `t`, `u`, `T`, `i`, `n`, `k`, `w`, `r1`…`r6`, the emitter settings, `color`, and each control.
3. Helpers in both: `tau`, `pi`, `sin`, `cos`, `mix`, `clamp`, `smoothstep`, `frac`, `mod`,
   `noise`, `random`, `channel(color, "r")`, `steps(n)`, `mixColor(a, b, k)`.
4. `set_editor` with `view: "filters"` or `"particles"` (and `presetId`) shows the code to the user.

### Make a repeating pattern

1. `create_pattern` with a name and tile width/height (and optional scale, rotation, background).
2. `set_editor` with `view: "pattern"` and the pattern ID, then draw the tile with `batch_edit`
   between (0, 0) and the tile size. Artwork crossing an edge should continue on the opposite edge.
3. `set_editor` with `view: "scene"`, then set a shape's `style.fill` or `style.stroke` to the
   pattern's `fill` reference (`url(#id)`, from `list_patterns`).
4. `update_pattern` changes the size, scale (how big it's drawn where used), rotation or
   background; every shape using it updates.

Strokes on lines, polylines, polygons and paths can taper to a point: set
`style.strokeTaper: { start, end }` (each 0–0.5 of the length).

### Draw a reusable sprite

1. `create_sprite_sheet` with a name, frame width/height, and optional folder.
2. `set_editor` with `view: "spritesheet"`, the sheet ID and animation page ID.
3. Draw with `batch_edit`, then animate with normal timeline/cutscene tools. Use `add_sprite_page`
   for another animation; `update_sprite_page` renames one.
4. `set_sprite_controls` exposes number (target rotation), text (target text), and boolean (target
   visibility) controls. This replaces the page's controls; retain IDs to preserve overrides.
5. Switch to `view: "scene"` and call `place_sprite`. It references the source artwork and creates
   an animation clip automatically. Sprites can also be placed in other sprites; direct and indirect
   self-inclusion are rejected.
6. `update_sprite_instance` changes only that instance's control values. To trim playback, open
   its owning clip, then use `trim_sprite_clip`; the clip duration follows the source range.

`list_sprites` returns metadata by default. Use `includeDocuments: true` only when full sprite
animation documents are needed. Frame dimensions apply to every animation page in a sheet.
`add_project_file` accepts a data URL; `place_project_file` places an imported image by file ID.

### Groups and text

`update_shape.properties` now exposes:

- `overlapOperation`: `add`, `subtract`, `union`, `intersection`. Operations are non-destructive;
  original children stay editable and the first child's fill paints combined areas.
- `containerId`: direct child used as the group's container; `""` clears it.
- `overflow`: `visible` or `hidden`; hidden clips against the selected container.
- `stackOrder`: explicit stacking position. Selection itself never changes stacking.
- `textBox`: `{width, lineHeight?, maxLines?}` for wrapped text and speech bubbles.

Restart your MCP client/server connection to load the updated tool catalog, and refresh the editor
to load the updated bridge commands. Existing drawing and timeline tool names remain available.
