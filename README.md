# svgtool MCP server

Lets an AI agent (Claude Code, Claude Desktop, or any MCP client) use React Svg Editor: draw and edit shapes, manage pages and palettes, animate with timelines and cutscenes, search images, preview work, and export SVG, PNG, JSON or MP4.

The editor keeps its documents in the browser (Redux state and IndexedDB), so the agent works through the editor tab you have open:

```
agent ⇄ (MCP over stdio) ⇄ mcp-server ⇄ (websocket, 127.0.0.1:7341) ⇄ editor tab
```

Each tool runs the editor's own actions in that tab, so you see every change on the canvas as it happens, and edits are recorded into the cutscene that is open, just as if you had made them yourself.

## Setup

```sh
cd mcp-server && npm install
```

**Claude Code:** the repo's `.mcp.json` already registers the server as `svgtool`. Approve it when Claude Code asks, or run `/mcp`.

**Other clients**, for example Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "svgtool": { "command": "node", "args": ["/absolute/path/to/svgEditor/mcp-server/src/index.js"] }
  }
}
```

Then start the editor from the repository root with `npm run dev:frontend` and open it in a browser. In development the editor connects to the server by itself and retries every few seconds, so the server and the editor can be started in either order. Ask the agent to run `editor_status` to check the connection.

With several editor tabs open, the agent works in the one you focused last.

## Tools

Each `server.registerTool(...)` call automatically exposes its name, title, description, and input schema through MCP's standard tool listing. No separate listing tool is needed.

| Area | Tools |
| --- | --- |
| Connection | `editor_status` — check whether the editor tab is connected and what is open. |
| Documents | `list_documents`, `open_document`, `new_document`, `save_document`, `export_document`, `get_document` — browse, load, create, save, export JSON, and inspect the current page. |
| Images | `search_images` — search clip art, illustrations, vectors, and photos for use on the canvas. |
| Shapes | `add_shape`, `update_shape`, `get_shape`, `delete_shapes`, `duplicate_shapes`, `select_shapes`, `group_shapes` — draw, inspect, modify, arrange, and remove shapes and groups. Shape properties include modifiers, particles, geometry, text, CSS filters, paint, and transforms. |
| Reusable styling | `list_colors`, `add_color`, `update_color`, `remove_color`, `add_gradient`, `update_gradient`, `remove_gradient`, `add_svg_filter`, `update_svg_filter`, `remove_svg_filter` — manage shared palette colors and gradients, plus shape-attached outline and inset-shadow filters. |
| Canvas and pages | `set_canvas`, `add_page`, `remove_page`, `set_active_page` — set the background and dimensions, and organize scenes as pages. |
| Timelines and cutscenes | `get_timelines`, `add_timeline`, `rename_timeline`, `delete_timeline`, `add_track`, `update_track`, `delete_track`, `add_cutscene`, `open_cutscene`, `update_cutscene`, `delete_cutscene`, `set_transition` — edit animation rows and overlay tracks, shape changes, timing, easing, repeats, camera view, blend modes, and enter/exit effects. |
| Playback and guides | `set_loop`, `set_play_range`, `play_animation`, `stop_animation`, `set_helpers` — control preview and show or hide editor guides. |
| Output | `export_svg`, `export_animated_svg`, `export_mp4`, `screenshot` — export static or animated work, or preview a PNG (pass `time` to inspect an animation moment). |

## Best practices

- Start with `get_document` and `get_timelines` so you know the canvas size, existing shapes, palette, pages, and open cutscene before editing.
- Reuse palette colors and gradients across the document. `add_color` and `add_gradient` return a fill reference such as `url(#id)`; `list_colors` and `get_document` show existing references. Update a shared palette entry to change all shapes that use it.
- For repeated geometry, add one shape and give it an array modifier in `properties.modifiers`. Choose linear for rows, radial for rings, or random for scatters. `count` is the number of copies in addition to the source shape; `delay` staggers animation across linear copies.
- Use `properties.particles` for effects such as fireworks, snow, confetti, embers, and sparkles. Set `hideSource` if the emitter itself should not be visible.
- Group related shapes as soon as they form an object, give the group a clear name, and nest groups for larger assemblies. Animate the group when its parts should move together. A group can contain shapes from only one timeline.
- For a repeating motion, animate one cycle in a cutscene, then set `repeat` and `loop` with `update_cutscene`. Use `alternate` for back-and-forth motion, `continue` when movement or rotation should accumulate, and `repeatDelay` for a pause. Repeats stop at the next cutscene or the playback-range end.
- Make a new page for a distinct scene and use cutscenes for changes within a scene. Preview with `play_animation` or `screenshot`, then call `save_document` to persist the work.

Changes stay in the tab until `save_document` is called, as in the editor itself. `open_document` and `new_document` replace the open document, and anything unsaved is lost.

## Configuration

| Where | Variable | Default | |
| --- | --- | --- | --- |
| server | `SVG_EDITOR_BRIDGE_PORT` | `7341` | port the editor connects to |
| server | `SVG_EDITOR_ALLOWED_ORIGINS` | none | comma-separated extra sites allowed to connect; localhost is always allowed |
| editor | `VITE_MCP_BRIDGE_URL` | `ws://127.0.0.1:7341` | must match the server's port |
| editor | `VITE_MCP_BRIDGE` | on in development | `true` to connect from a production build, `false` to never connect |

The websocket only listens on 127.0.0.1, and it refuses browser pages from sites other than localhost unless you list them.

## Tests

```sh
npm test
```

## Sprite and batch workflows

The bridge now supports the scene editor and sprite sheet editor. `get_document` identifies the
active workspace and lists project sprites, animation pages, controls, folders and file metadata.
Project JSON export includes the whole project, even while a sprite page is open.

| Area | New tools |
| --- | --- |
| Batching | `batch_edit` — 1–50 ordered add/update/group/delete operations in one bridge call. |
| Sprites | `list_sprites`, `create_sprite_sheet`, `update_sprite_sheet`, `add_sprite_page`, `update_sprite_page`, `set_editor`. |
| Controls and placement | `set_sprite_controls`, `place_sprite`, `update_sprite_instance`, `trim_sprite_clip`. |
| Filesystem | `create_project_folder`, `list_project_files`, `add_project_file`, `place_project_file`. |
| Stacking | `bring_to_front` — permanent, or temporary until another shape is selected. |

### Build, inspect, refine

Prefer one batch per coherent object or layer (usually 10–30 operations). An operation can name
its result with `ref`; later ID fields use `$ref`. Returned `refs` contain real IDs for later calls.
Text strings such as `$price` remain literal. References work in `id`, `ids`, `containerId`, and
`targetShapeId` fields. They are scoped to one batch and must refer to earlier successful edits.

```json
{
  "operations": [
    { "tool": "add_shape", "ref": "body", "args": { "type": "rectangle", "x": 100, "y": 100, "properties": { "width": 80, "height": 60 }, "style": { "fill": "#6c5cff", "strokeWidth": 0 } } },
    { "tool": "add_shape", "ref": "eye", "args": { "type": "circle", "x": 125, "y": 120, "properties": { "radius": 5 }, "style": { "fill": "white", "strokeWidth": 0 } } },
    { "tool": "group_shapes", "ref": "robot", "args": { "ids": ["$body", "$eye"], "name": "Robot" } }
  ]
}
```

Batch edits use the same command validation and timeline ownership rules as single edits. They
stop on the first failure and report completed operations, real IDs, the failing index and remaining
count. Completed work stays applied; retry only unfinished work. Edits stop if the document,
page or editing clip changes. The editor paints between small chunks to remain responsive.

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
