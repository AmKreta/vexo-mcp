#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mcpTools } from '@vexo/editor-tools';
import { EditorBridge } from './bridge.js';
import { startHttpServer } from './http.js';

// "stdio" (default): the MCP client starts this process. "http": a long-running server that
// clients reach at http://<host>:<port>/mcp, e.g. the always-on Docker service.
const TRANSPORT = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();
const HTTP_PORT = Number(process.env.MCP_HTTP_PORT || 7342);
const HTTP_HOST = process.env.MCP_HTTP_HOST || '127.0.0.1';
// Host headers accepted over HTTP (DNS rebinding protection); localhost is always allowed
const HTTP_ALLOWED_HOSTS = (process.env.MCP_HTTP_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const PORT = Number(process.env.SVG_EDITOR_BRIDGE_PORT || 7341);
// 0.0.0.0 inside a container, so the published port reaches it; keep 127.0.0.1 elsewhere
const HOST = process.env.SVG_EDITOR_BRIDGE_HOST || '127.0.0.1';
const ALLOWED_ORIGINS = (process.env.SVG_EDITOR_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// stdout carries the MCP protocol, so logs go to stderr
const log = (msg) => process.stderr.write(`[svgtool-mcp] ${msg}\n`);

const bridge = new EditorBridge({ port: PORT, host: HOST, allowedOrigins: ALLOWED_ORIGINS, log });

const SERVER_INFO = { name: 'svgtool', version: '0.1.0' };
const SERVER_OPTIONS = {
  instructions: [
    'Drives a running React Svg Editor tab: manage documents and pages; draw, style, group and filter shapes; search clip art, illustrations, vectors and photos; manage palettes; animate with timelines and clips; preview and export SVG, PNG, JSON or MP4.',
    'The editor must be open in a browser (npm run dev:frontend, then http://localhost:3000); call editor_status if a tool says no editor is connected.',
    'Use batch_edit to build a complete object per call, inspect after each meaningful pass, then refine in batches. Batch references ($name) allow grouping and editing new shapes without waiting for IDs.',
    'Patterns: create_pattern makes a repeating tile; open it with set_editor(view: "pattern", patternId), draw the tile with the normal tools, then set any shape\'s style.fill or style.stroke to its `fill` reference (url(#id)) from list_patterns. update_pattern changes size, scale, rotation or background.',
    'Use list_sprites, create_sprite_sheet, add_sprite_page and set_editor for project-wide vector sprites. Draw each animation using the normal tools; place_sprite adds an instance plus a timed clip. Instances expose controls; sprites may nest but cannot include themselves.',
    'Group properties include overlapOperation (add/subtract/union/intersection), containerId and overflow (visible/hidden). Children remain editable. Text supports properties.textBox; stackOrder controls explicit stacking.',
    'Coordinates are canvas pixels with the origin at the top-left; get_document reports the canvas pixel size.',
    'Use add_shape and update_shape for geometry, text, paint, transforms, CSS filters, modifiers and particles. Use add_svg_filter for outline or inset-shadow effects attached to a shape; palette colors and gradients can be reused as url(#id) fills.',
    'Illustration polish: shade with a shape set to style.blendMode "multiply" (e.g. a soft purple shape over the dark side) and light with "screen", inside the character\'s group (groups isolate blending, so it never darkens the background); keep shading inside the outline or clip it with the group\'s containerId + overflow hidden. add_svg_filter type "effect" adds creative filters: grain or paper for texture, boil for a hand-drawn line wobble, ripple, glitch, crt, hologram, smoke, dissolve, goo, pixelate, neon for glow, duotone/posterize for print looks, emboss, rgbSplit, inkEdges. Boil, glitch, crt, hologram, smoke and ripple move on their own; any effect control can be animated by changing it with update_svg_filter inside a clip. For anything else, write SVG filter primitives once with create_filter_preset and reuse it.',
    'Rigging: use add_bone to draw bone segments, connect_bones to join pieces at their nearest free tail/head endpoints, and update_joint to set angle limits, angle or IK. attach_bone_artwork and detach_bone_artwork bind drawn artwork to a bone. The page camera is independent of its canvas; set_camera adjusts the start frame, whether it appears in Layers, and a follow target.',
    'Camera group: move_into_group with groupId "camera" attaches artwork to the camera so it keeps its place on screen while the camera pans and zooms (HUDs, titles, subtitles). remove_from_camera takes it back out. get_document reports camera.follow and camera.group.',
    'Mirror: add_shape type "mirror" makes a frame divided into sections (radial wedges or side-by-side columns, default 4). Draw artwork inside its first section, then move_into_group it into the mirror; the other sections reflect it live. Change sections, mode or size with update_shape properties.mirror. Guides show only while editing.',
    'Motion path: add_shape type "motionPath" places an empty drop box. move_into_group an outline into it first (a line, pen path, rectangle…; it becomes the path), then the shape that should travel. Or convert_to_motion_path an existing outline. Inside a clip, update_shape properties.motionPath.progress from 0 to 100 moves the shape from start to end; rotate turns it to face its direction; showPath false hides the path. release_from_modifier takes the path or shape back out.',
    'Draw: add_shape type "draw" places an empty drop box; move_into_group shapes with a stroke into it. Set properties.draw.end 0 so they start hidden, then inside a clip set end 100 to draw them on (start 0 → 100 with end 100 erases them). order "sequence" draws one after another; direction and startPoint choose where and which way the pen goes; fill "reveal" fades fills in as each outline finishes. Only strokes are drawn.',
    'Audio: use get_audio to inspect page audio, then add_audio_timeline and add_audio_clip to arrange speech or sound. update_audio_clip changes timing and voice settings; file clips accept an audio data URL or source URL.',
    'Animation: each timeline is a row of clips (the API tool names retain "cutscene"). Shape edits are recorded into the open clip as changes from the previous clip; during it, the object animates from the previous state to the new one.',
    'Each timeline animates one object; an object can have several (separate animations that play together, layered property by property; add_timeline with newTimeline true adds one). Draw artwork first, use add_timeline with shapeId to create or open its timeline, or omit shapeId for an empty row and assign it later with update_timeline. That assignment is permanent. Groups and sprites count as one object; children may have their own timelines. Deleting a timeline keeps artwork.',
    'To animate: draw the starting artwork, call add_timeline with shapeId, then add_cutscene and move or restyle that object. There is no implicit Start clip. Use screenshot with `time` to inspect an animation moment.',
    'Best practices: inspect get_document and get_timelines first; use the canvas pixel size for coordinates. Group related shapes before adding object timelines, name groups clearly, nest groups for larger objects, and animate the group. A group and its children may each have their own animation timelines.',
    'get_document returns hiddenShapeIds. Use set_layer_visibility to show or hide a page layer without changing opacity or creating a clip. Hiding a group hides its descendants.',
    'Reuse styling: add a palette color or gradient, then reuse its `fill` reference (`url(#id)`) across the document. list_colors and get_document show existing entries; update a shared color or gradient instead of changing every shape that uses it.',
    'Repeated geometry: use one source shape with `properties.modifiers` and an array modifier (linear rows, radial rings, or random scatters) instead of drawing copies. `count` is the number of extra copies. Use `delay` for staggered motion.',
    'Custom filters and particles are React-style TSX components (what the Filter and Particle Editors show): create_filter_preset with `source`, and properties.particles.type "custom" with a `component` (see the schemas for the props and helpers). They run in a sandbox. Custom particles can also use a `script` of expressions (x, y, and optionally opacity, size, rotate, color, params) for motion the presets lack: orbits, spirals, vortices, swarms, particles tracing a shape. list_particle_presets shows scripted examples; create_particle_preset saves one for reuse.',
    'Effects: use `properties.particles` for bursts, falling confetti or snow, rising embers, and drifting sparkles instead of drawing many particles by hand. Set `hideSource` when the emitter shape should not show.',
    'Animation cycles: animate one complete motion in a cutscene, then set `repeat` and `loop` on it. Use `alternate` to reverse each repeat, `continue` to accumulate movement or rotation, and `repeatDelay` for a pause. Repeats end at the next cutscene or playback-range end.',
    'Use a new page for a distinct scene or topic, and cutscenes for changes within a scene. Pages play one after another, like slides. Preview with play_animation or screenshot, then save_document to persist edits.',
  ].join('\n'),
};

// Tools are recorded here and registered on each McpServer that createServer() makes: stdio
// uses one, while HTTP needs one per client session. All of them drive the same editor bridge.
const toolRegistrations = [];
const server = { registerTool: (...registration) => toolRegistrations.push(registration) };

function createServer() {
  const mcp = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  for (const registration of toolRegistrations) {
    mcp.registerTool(...registration);
  }
  return mcp;
}

/** Forwards a tool call to the editor tab and returns its JSON answer as text. */
async function run(method, params = {}) {
  try {
    const result = await bridge.call(method, params);
    return {
      ...(method === 'batchEdit' && result?.ok === false ? { isError: true } : {}),
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
}

// Each tool is defined once in @vexo/editor-tools, for both this server and the in-app assistant.
// Most forward to the editor command named by `method`; these have their own handlers.
const handlers = {
  editor_status: async () => {
    const status = bridge.status();
    if (!status.connectedTabs) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...status,
                hint: status.error
                  ? undefined
                  : 'Start the editor (npm run dev:frontend in the project root) and open http://localhost:3000 in a browser.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    try {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...status, editor: await bridge.call('status') }, null, 2),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  },
  export_mp4: async () => {
    try {
      const { filename, mimeType, base64 } = await bridge.call('exportMp4');
      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: `vexo-export://${encodeURIComponent(filename)}`,
              mimeType,
              blob: base64,
            },
          },
          { type: 'text', text: `Exported ${filename}` },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  },
  screenshot: async (args) => {
    try {
      const { png, width, height } = await bridge.call('screenshot', args);
      return {
        content: [
          { type: 'image', data: png, mimeType: 'image/png' },
          { type: 'text', text: `${width}×${height} canvas pixels` },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  },
};
for (const { name, method, ...config } of mcpTools) {
  server.registerTool(name, config, handlers[name] ?? ((args) => run(method, args)));
}

await bridge.start();

let httpServer;
const shutdown = async () => {
  bridge.close();
  await httpServer?.close();
  process.exit(0);
};

if (TRANSPORT === 'http') {
  httpServer = await startHttpServer({
    port: HTTP_PORT,
    host: HTTP_HOST,
    allowedHosts: HTTP_ALLOWED_HOSTS,
    createServer,
    status: () => bridge.status(),
    log,
  });
} else if (TRANSPORT === 'stdio') {
  await createServer().connect(new StdioServerTransport());
  // the client closed its end: nothing left to serve
  process.stdin.on('close', shutdown);
} else {
  log(`unknown MCP_TRANSPORT "${TRANSPORT}"; use "stdio" or "http"`);
  process.exit(1);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
