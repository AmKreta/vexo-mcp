# svgtool MCP server

Lets an AI agent (Claude Code, Claude Desktop, or any MCP client) use React Svg Editor: draw and edit shapes, manage pages and palettes, animate with timelines and cutscenes, search images, preview work, and export SVG, PNG, JSON or MP4.

The editor keeps its documents in the browser (Redux state and IndexedDB), so the agent works through the editor tab you have open:

```
agent ⇄ (MCP over HTTP or stdio) ⇄ mcp-server ⇄ (websocket, 127.0.0.1:7341) ⇄ editor tab
```

Each tool runs the editor's own actions in that tab, so you see every change on the canvas as it happens, and edits are recorded into the open clip, just as if you had made them yourself. The API keeps the older `cutscene` name for clip-related tools.

## Setup

The server runs in one of two ways:

- **As a Docker service (default):** always running, and agents connect to it over HTTP at `http://127.0.0.1:7342/mcp`. This is what the repo's `.mcp.json` uses.
- **Over stdio:** the agent starts `node src/index.js` itself, with no Docker. Use this if you don't run Docker.

### With Docker

The `mcp` service in the repository's `docker-compose.yml` starts with the rest of the stack:

```sh
docker compose up -d mcp      # or ./scripts/start-local.sh, which starts it too
docker compose ps mcp         # "healthy" once it answers on /health
```

**Claude Code:** the repo's `.mcp.json` registers the server as `svgtool` at `http://127.0.0.1:7342/mcp`. Approve it when Claude Code asks, or run `/mcp`.

**Other clients** that speak Streamable HTTP, for example:

```json
{
  "mcpServers": {
    "svgtool": {
      "type": "http",
      "url": "http://127.0.0.1:7342/mcp"
    }
  }
}
```

Several agents can connect at once; each gets its own session, and they all drive the same editor tab. Both ports are published on 127.0.0.1 only: 7342 for agents (set `MCP_HTTP_PUBLISH_PORT` to change it, and the URL above to match) and 7341 for the editor bridge (set `MCP_BRIDGE_PORT`, and `VITE_MCP_BRIDGE_URL` in the editor to match). The server's source is mounted into the container, so after editing it run `docker compose restart mcp`; rebuild with `docker compose up -d --build mcp` after changing dependencies. Only one copy can hold the bridge port, so stop a locally started server first.

### Over stdio, without Docker

```sh
cd mcp-server && npm install
```

Point the client at the script, for example in Claude Desktop's `claude_desktop_config.json` (or the repo's `.mcp.json`, in place of the HTTP entry):

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

To run the HTTP server without Docker instead, start it with `MCP_TRANSPORT=http node src/index.js`.

### Connect the editor

Start the editor from the repository root with `npm run dev:frontend` and open it in a browser. In development the editor connects to the server by itself and retries every few seconds, so the server and the editor can be started in either order. Ask the agent to run `editor_status` to check the connection.

With several editor tabs open, the agent works in the one you focused last.

## Tools

Each `server.registerTool(...)` call automatically exposes its name, title, description, and input schema through MCP's standard tool listing. No separate listing tool is needed.

| Area                | Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection          | `editor_status` — check whether the editor tab is connected and what is open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| History             | `undo`, `redo` — undo or redo the most recent editor change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Documents           | `list_documents`, `open_document`, `new_document`, `save_document`, `export_document`, `get_document` — browse, load, create, save, export JSON, and inspect the current page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Media               | `update_media`, `list_media_providers`, `search_media`, `get_media_dialog`, `media_dialog_search`, `pick_media` — image shapes hold pictures, GIFs or video (typed from the file); `update_media` sets a video's start/end page times, trim, speed, loop, sound and fit (not animatable). search free images (Openverse, Wikimedia Commons, Iconify, The Noun Project, Unsplash, Pexels, Pixabay, NASA, Art Institute of Chicago, PermaClipArt, Openclipart, GIPHY), videos (Pexels, Pixabay, Wikimedia Commons, NASA) and audio (Openverse, Freesound, Jamendo, Wikimedia Commons, NASA) with each provider's filters. Results are numbered and come with a contact-sheet picture so the agent can see them; `get_media_dialog` shows what the user's Insert → Media dialog shows, and `pick_media` uses a result like a click. Providers that need an API key appear once it is set in `frontend/.env.local`. |
| Inspect             | `find_shapes`, `get_shapes`, `get_layer_tree`, `get_timeline`, `screenshot_region`, `shapes_at_point` — targeted reads: find shapes by regex over name, text or id (or by type, fill, area, parent, animated), read several shapes or only some fields, see the layer tree in draw order, read one timeline, zoom into shapes or an area, and list what is drawn at a point. All except the last two read any page without switching. `get_shape` also takes `fields`. |
| Shapes              | `add_shape`, `update_shape`, `get_shape`, `delete_shapes`, `duplicate_shapes`, `select_shapes`, `group_shapes`, `move_into_group` — draw, inspect, modify, arrange, and remove shapes, groups, mirrors, motion paths, draws, typewriters and bends (`add_shape` type `mirror`, `motionPath`, `draw`, `typewriter` or `bend`); `release_from_modifier` and `convert_to_motion_path` manage them. Shape properties include modifiers, particles, mirror sections, motion path, draw, typewriter and bend settings, geometry, text, CSS filters, paint, and transforms. `add_shape` type `graph` draws a function graph y = f(x) (`properties.graph`: animate `graph.params.<name>`, `graph.tracer.x`, `graph.drawProgress` or the window in clips); type `richContent` draws a code, HTML & CSS, Markdown, MathML or Mermaid box (`properties.content`). `get_shapes` adds `graphInfo` / `contentInfo`.                                                                                  |
| Bones and camera    | `add_bone`, `connect_bones`, `update_joint`, `disconnect_joint`, `add_bone_socket`, `remove_bone_sockets`, `attach_bone_artwork`, `detach_bone_artwork`, `set_camera`, `remove_from_camera` — build and edit rigs, set joint angles/limits and IK, attach artwork, adjust the independent camera frame and its follow target, and manage artwork attached to the camera.                                                                                                                                                                                                                                                                              |
| Audio               | `get_audio`, `analyze_music_beats`, `add_audio_timeline`, `update_audio_timeline`, `delete_audio_timeline`, `add_audio_clip`, `update_audio_clip`, `delete_audio_clip`, `generate_speech_audio` — Kokoro text-to-speech narration generated in the browser, sound clips, and audio rows per speaker or music. `scope: "global"` puts audio (background music) under every page on the all-pages sequence clock; `fadeIn` / `fadeOut` and `volumeKeyframes` animate volume; `dimOnNarration` automatically lowers global music during narration.                                                                                                                                                                                                                                                                                                                                                                |
| Code files          | `list_code_files`, `create_code_file`, `update_code_file`, `delete_code_file`, `add_code_version`, `update_code_version`, `delete_code_version` — project code files with named versions, created from text or imported through `import_project_code_file`. A `richContent` box shows one with `content.fileRef`; changing `content.fileRef.versionId` inside a clip animates the change with `content.transition` (`gitDiff`, `morph`, `typewriter`, `highlight`, `crossfade`, `cut`). `set_editor` view `code` opens the Code Editor. |
| Subtitles           | `export_subtitles` — SubRip (.srt) or WebVTT (.vtt) subtitles from narration clips, timed to match the MP4 export (all pages or the current page).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Layers              | `set_layer_visibility` — show or hide page layers without using opacity or adding animation. Hiding a group also hides its descendants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Layout and timing   | `align_shapes`, `animate_shape`, `analyze_music_beats` (grid) — `align_shapes` lines shapes up by their rendered boxes (text included) against the canvas (with margin), the selection or another shape, optionally as one block (`together`); `animate_shape` sets a start pose and every keyframe clip of a shape in one call, checked for overlaps first; `analyze_music_beats` also returns `interval` and a per-page `grid` of beat `times` and `accents` ready to use as clip starts. Text takes `textAnchor` (start/middle/end) so changing text stays centred or right-aligned; images take `rx` for rounded or capsule photos (with `update_media` fit "cover"). |
| Presets             | `search_presets`, `list_presets`, `insert_preset`, `export_preset` — search and place animated layouts, original titles and cards, 12 standalone text effects, reusable templates, and six-picture photo effects. Use a returned ID and set inputs by name. |
| Reusable styling    | `list_colors`, `add_color`, `update_color`, `remove_color`, `add_gradient`, `update_gradient`, `remove_gradient`, `list_curves`, `add_curve`, `update_curve`, `remove_curve`, `add_svg_filter`, `update_svg_filter`, `remove_svg_filter` — shared, named palette colours and gradients; reusable cubic-Bézier transition curves for clip easing; outline and shadow filters; creative `effect` filters (grain, paper, ripple, boil, glitch, crt, hologram, smoke, dissolve, goo, pixelate, neon, duotone, posterize, emboss, rgbSplit, inkEdges) whose controls can be animated in clips. Shapes also take `style.blendMode` and `style.strokeTaper`. |
| Custom filters      | `list_filter_presets`, `create_filter_preset`, `update_filter_preset`, `delete_filter_preset` — project filters written as React-style TSX components (`source`) or filter markup; they live in the Filesystem and appear under Project presets.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Particles           | `list_particle_presets`, `create_particle_preset`, `update_particle_preset`, `delete_particle_preset` — particle setups, including `type: "custom"` particles drawn by a TSX `component` (or an expression `script`). Shapes made from a preset follow its edits.                                                                                                                                                                                                                                                                                                                                                                                     |
| Canvas and pages    | `set_canvas`, `add_page`, `remove_page`, `set_active_page` — set the background and dimensions, and organize scenes as pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Text animation      | `list_text_animation_presets`, `add_text_animation`, `update_text_animation` — word effects with editable clips. |
| Timelines and clips | `get_timelines`, `add_timeline`, `rename_timeline`, `delete_timeline`, `update_timeline`, `add_cutscene`, `open_cutscene`, `update_cutscene`, `delete_cutscene`, `set_transition` — create or open one timeline per shapeId (including groups, preset instances and spritesheet instances), or add an empty row and choose its shape later. The shape binding is permanent. Then edit clips, timing, easing, repeats, camera views and enter/exit effects. Artwork remains on the page when its timeline is removed.                                                                                                                                                                  |
| Project assets      | `list_project_presets`, `create_preset`, `update_preset`, `add_preset_page`, `update_preset_page`, `list_preset_properties`, `set_preset_controls`, `set_editor`, `place_preset`, `update_preset_instance`, `trim_preset_clip`, `get_reuse_summary`, `list_project_files`, `create_project_folder`, `rename_project_folder`, `create_project_file`, `read_project_file`, `copy_project_file`, `add_project_file`, `update_project_file`, `place_project_file`, `list_patterns`, `create_pattern`, `update_pattern`, `delete_pattern` — reusable presets (drawn components with animation pages and controls; library presets from `insert_preset` install into these too) and patterns, and the project Filesystem (folders, files, presets, spritesheets, filter and particle presets). `set_editor` opens the Scene, Preset, Spritesheet, Pattern, Filter or Particle Editor. |
| Spritesheets        | `list_spritesheets`, `create_spritesheet`, `update_spritesheet`, `delete_spritesheet`, `set_spritesheet_animation`, `delete_spritesheet_animation`, `place_spritesheet`, `update_spritesheet_instance` — raster spritesheet images cut into a grid of frames, with frame-by-frame animations played by scene instances. `set_editor` view `spritesheet` opens the Spritesheet Editor. |
| Playback and guides | `set_loop`, `set_play_range`, `play_animation`, `stop_animation`, `set_helpers` — control preview and show or hide editor guides, including `set_helpers({beatIndicators: true})` for the beat strip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Output              | `export_svg`, `export_animated_svg`, `export_mp4`, `screenshot` — export static or animated work, or preview a PNG (pass `time` to inspect an animation moment).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Best practices

- Start with `get_document` (with `includeShapes: false` on busy pages) and `get_layer_tree`, then read precisely with `find_shapes`, `get_shapes` (with `fields`) and `get_timeline` rather than dumping whole pages.
- Reuse palette colors and gradients across the document. `add_color` and `add_gradient` return a fill reference such as `url(#id)` and take an optional `name`; `list_colors` and `get_document` show existing references. Update a shared palette entry to change all shapes that use it.
- Save a custom transition with `add_curve` and pass its returned `ease` (`cubic-bezier(x1, y1, x2, y2)`) to a clip. Editing the curve with `update_curve` updates every clip using it.
- For repeated geometry, add one shape and give it an array modifier in `properties.modifiers`. Choose linear for rows, radial for rings, or random for scatters. `count` is the number of copies in addition to the source shape; `delay` staggers animation across linear copies.
- Use `properties.particles` for effects such as fireworks, snow, confetti, embers, and sparkles. Set `hideSource` if the emitter itself should not be visible.
- Group related shapes as soon as they form an object, give the group a clear name, and nest groups for larger assemblies. Prefer grouping before adding timelines; animate the group when its parts should move together.
- For character rigs, add bone segments or sockets, connect free tail/head endpoints, and attach the drawn artwork to the bones. Use `update_joint` for joint angle limits and terminal-chain IK. The camera frame is independent of the drawing canvas; `set_camera` adjusts its start position and width and can follow a moving shape (`follow`), while camera animation belongs in a camera timeline. `move_into_group` with `groupId: "camera"` attaches HUDs, titles or subtitles to the camera so they stay put on screen; `remove_from_camera` detaches them.
- For symmetric artwork, `add_shape` a `mirror`, draw only its first section, then `move_into_group` those shapes into the mirror; the other sections reflect them live.
- To move a shape along a route, `add_shape` a `motionPath`, `move_into_group` an outline into it first (it becomes the path) and then the travelling shape, or `convert_to_motion_path` an existing outline. Change `properties.motionPath.progress` from 0 to 100 inside a clip to move it; `rotate` turns it along the way.
- To morph vector artwork, use `add_shape` with `type: "morph"`, then `move_into_group` with the target IDs in order. The first target anchors all transform origins. Use `animate_shape` on the modifier with `properties: { morph: { activeShapeId: "target-id" } }` in each clip. Use `release_from_modifier` to detach a target at its aligned position.
- To animate words in editable text, use `list_text_animation_presets`, then call `add_text_animation` with `{ id, preset }` or include both `start` and `end` in scene-local seconds. Enter and Exit each reuse one clip. Each on-screen effect adds a separate clip. Use the returned `timelineId` and `cutsceneId` with `update_text_animation` to change its effect within the same phase, `update_cutscene` to retime it, or `delete_cutscene` to remove it. `get_timeline` shows the preset under `textAnimation`.
- To draw outlines on stroke by stroke, `add_shape` a `draw`, `move_into_group` stroked shapes into it, set `properties.draw.end` to 0, then to 100 inside a clip. `order`, `direction`, `startPoint` and `fill` shape how it draws.
- To type text on, `add_shape` a `typewriter`, `move_into_group` text shapes into it (only text is accepted), set `properties.typewriter.progress` to 0, then to 100 inside a clip. To curve text, `add_shape` a `bend`, move text into it and set `properties.bend.amount` (−100…100); `amount` and `offset` animate in clips.
- Search the gallery by design or motion with `search_presets` (for example, “three step sequence” or “six photo dice”). Use a returned ID in `insert_preset` and set inputs by name. Photo Effects has `Photo 1` through `Photo 6`. Use `add_text_animation` for effects on an existing text shape.
- Don't compute positions by hand: `align_shapes` centres or aligns by the rendered box (text included), and text with `textAnchor: "middle"` stays centred when its words change. Build whole animations with `animate_shape` (start pose + all keyframes, validated) instead of add_timeline/add_cutscene/update_shape/update_cutscene per clip.
- Use `analyze_music_beats({start, end})` for music timing. The optional range is in whole-video seconds. The result includes estimated BPM and beats with sequence `time`, intensity from 0 to 1, and local `pages[{index, time}]` positions for animation clips. `interval` is the beat length and `grid` lists each page's beat `times` and stronger `accents` on its own timeline (filter with `page`, `strongOnly`). A scene trimmed to 30–40 seconds uses 30–40 on its own timeline. A 0–10 second scene placed at sequence 30–40 seconds maps those beats to 0–10 locally. `get_audio` lists each scene’s sequence content bounds and local play range. Mark uploaded voiceovers with `narration: true` to exclude them from beat detection.
- Use `get_audio` to inspect audio before editing. `add_audio_clip` with `text` (and a Kokoro `voice` such as `af_heart`) adds narration; the editor generates its audio automatically (the voice model, about 90 MB, downloads once when the editor opens) and sets the clip to the spoken length. Call `generate_speech_audio` until the clip's `audio` is `ready` before timing animation to it. File clips take an audio URL or data URL. `set_play_range` sets the page's start and end for both the video and audio timelines.
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
| server | `MCP_TRANSPORT`              | `stdio`               | `http` to serve MCP over HTTP at `/mcp` (the Docker service does)           |
| server | `MCP_HTTP_PORT`              | `7342`                | port of the HTTP endpoint                                                   |
| server | `MCP_HTTP_HOST`              | `127.0.0.1`           | address the HTTP endpoint listens on; `0.0.0.0` inside Docker               |
| server | `MCP_HTTP_ALLOWED_HOSTS`     | none                  | comma-separated extra `Host` headers to accept; localhost is always allowed |
| editor | `VITE_MCP_BRIDGE_URL`        | `ws://127.0.0.1:7341` | must match the server's port                                                |
| editor | `VITE_MCP_BRIDGE`            | on in development     | `true` to connect from a production build, `false` to never connect         |

The websocket and the HTTP endpoint listen on 127.0.0.1 (in Docker they listen inside the container, and the ports are published on 127.0.0.1 only). The websocket refuses browser pages from sites other than localhost unless you list them; the HTTP endpoint refuses browser pages from other sites and requests whose `Host` isn't localhost (DNS rebinding protection). `GET /health` reports whether an editor tab is connected.

## Tests

```sh
npm test
```

## Preset, spritesheet and batch workflows

The bridge supports the Scene Editor, Preset Editor and Spritesheet Editor. `get_document`
identifies the active workspace and lists project presets, animation pages, controls, folders and
file metadata. Project JSON export includes the whole project, even while a preset page is open.

| Area                   | New tools                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Batching               | `batch_edit` — 1–50 ordered add/update/group/delete operations in one bridge call.                                                       |
| Presets                | `list_project_presets`, `create_preset`, `update_preset`, `add_preset_page`, `update_preset_page`, `set_editor`.                         |
| Controls and placement | `list_preset_properties`, `set_preset_controls`, `place_preset`, `update_preset_instance`, `trim_preset_clip`.                           |
| Spritesheets           | `list_spritesheets`, `create_spritesheet`, `update_spritesheet`, `delete_spritesheet`, `set_spritesheet_animation`, `delete_spritesheet_animation`, `place_spritesheet`, `update_spritesheet_instance`. |
| Filesystem             | `create_project_folder`, `rename_project_folder`, `list_project_files`, `create_project_file`, `read_project_file`, `copy_project_file`, `add_project_file`, `update_project_file`, `place_project_file`. |
| Patterns               | `list_patterns`, `create_pattern`, `update_pattern`, `delete_pattern`, `set_editor` with `view: "pattern"`.                              |
| Stacking               | `bring_to_front` — permanent, or temporary until another shape is selected.                                                              |

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
         <feGaussianBlur
           in='SourceAlpha'
           stdDeviation={size * (0.6 + 0.4 * sin(t * tau))}
           result='b'
         />
         <feFlood floodColor={color} />
         <feComposite in2='b' operator='in' result='glow' />
         <feMerge>
           <feMergeNode in='glow' />
           <feMergeNode in='SourceGraphic' />
         </feMerge>
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

### Draw a reusable preset

1. `create_preset` with a name, frame width/height, and optional folder.
2. `set_editor` with `view: "preset"`, the sheet ID (`sheetId`) and animation page ID (`pageId`).
3. Draw with `batch_edit`, then animate with normal timeline/cutscene tools. Use `add_preset_page`
   for another animation; `update_preset_page` renames one.
4. `set_preset_controls` exposes properties of the preset's shapes as controls: each control has
   `bindings` `[{shapeId, property}]`, and `list_preset_properties` shows what each shape can expose
   (fill/stroke color, opacity, position, rotation, scale, size, text, visibility, draw/typewriter
   progress, a nested preset's controls). One control can drive several shapes. This replaces the
   page's controls; retain IDs to preserve instance values. `update_preset_instance` inside an open
   clip animates a control value.
5. Switch to `view: "scene"` and call `place_preset`. It references the source artwork and creates
   an animation clip automatically. Presets can also be placed in other presets; direct and indirect
   self-inclusion are rejected.
6. `update_preset_instance` changes only that instance's control values. To trim playback, open
   its owning clip, then use `trim_preset_clip`; the clip duration follows the source range.

`list_project_presets` returns metadata by default. Use `includeDocuments: true` only when full
preset animation documents are needed. Frame dimensions apply to every animation page in a preset.
Library presets placed with `insert_preset` are installed as project presets, so the same tools
edit them. A placed instance is stored on the shape as `presetInstance` (formerly
`spriteInstance`); older projects migrate automatically when opened.

### Animate a spritesheet image

A spritesheet is a raster image (PNG, GIF, WebP, JPG or SVG) holding a grid of frames, as used in
games. It is separate from presets, which are drawn vector components.

1. `create_spritesheet` with `name` and `image` (a URL, a data URL, or
   `"project-file:<id or name>"`). Optional `frameWidth`, `frameHeight`, `offsetX`, `offsetY`,
   `spacingX`, `spacingY`, `pixelated` (hard edges for pixel art) and `folder`. Without a cell size
   it is detected from the transparent or plain gaps between frames; the first row of cells becomes
   the first animation. `update_spritesheet` `{spritesheetId, ...}` changes the same fields, and
   `delete_spritesheet` `{spritesheetId}` removes one.
2. `set_spritesheet_animation` `{spritesheetId, animationId?, name?, fps?, loop?, frames?}` creates
   an animation (omit `animationId`) or replaces one. Each frame is a grid cell `{column, row}` or a
   crop `{x, y, width, height}`, with an optional `duration` in seconds. `delete_spritesheet_animation`
   `{spritesheetId, animationId}` removes one. `list_spritesheets` shows sheets, grids and animations;
   `includeFrames: true` adds each frame's crop and duration.
3. `set_editor` with `view: "spritesheet"`, `spritesheetId` and `animationId` shows it to the user.
4. In a scene, `place_spritesheet` `{spritesheetId, animationId?, x?, y?, width?, height?, speed?,
   offset?}` adds an instance. `update_spritesheet_instance` `{id, animationId?, speed?, offset?}`
   switches the animation (by ID or name), the playback speed, or the start delay in seconds; inside
   an open clip the switch is animated in that clip.

These tools belong to the `reuse` skill.

### Project files and the Code Editor

Use `list_project_files` to discover files stored in Vexo. The result includes an `editable` flag
for text files. These commands operate on the open Vexo project.

| Action                      | Tool and example arguments                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a folder             | `create_project_folder { "path": "Code/Examples" }`; omit `path` for a numbered name.                                                                                                       |
| Create a text file          | `create_project_file { "folder": "Code", "name": "demo.js", "content": "const total = 3;" }`; name and content are optional.                                                                |
| Read or edit text           | `read_project_file { "fileId": "…" }`, then `update_project_file { "fileId": "…", "content": "const total = 4;" }`.                                                                         |
| Copy or move                | `copy_project_file { "fileId": "…", "folder": "Code/Examples" }` keeps the original. Use the same arguments with `update_project_file` to move the original. `folder: ""` targets the root. |
| Import into the Code Editor | `import_project_code_file { "projectFileId": "…" }`. A matching name adds a version. Set `codeFileId` to pick the destination explicitly.                                                   |

`add_project_file` accepts a data URL for imported assets. `place_project_file` places an image by file ID.

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
