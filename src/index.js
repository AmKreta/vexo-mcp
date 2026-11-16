#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { checkBatchEdit, mcpTools } from '@vexo/editor-tools';
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
    'Drives a running React Svg Editor tab: manage documents and pages; draw, style, group and filter shapes; search free images, videos and audio across providers; manage palettes; animate with timelines and clips; preview and export SVG, PNG, JSON or MP4.',
    'The editor must be open in a browser (npm run dev:frontend, then http://localhost:3000); call editor_status if a tool says no editor is connected.',
    'Reuse before you draw: before building more than one scene, make a sprite sheet (create_sprite_sheet, draw it with set_editor view "spritesheet") for every recurring character or prop and place it in each scene with place_sprite; give it controls (set_sprite_controls binds any property of shapes inside it, such as a fill color, text, visibility, rotation or size; list_sprite_properties shows them) for per-scene variations instead of redrawing. For repeated geometry (halftone dots, fences, stars, tiles, crowds of the same shape) draw ONE shape and give it an array modifier (properties.modifiers) or use a pattern, never dozens of copies. Run get_reuse_summary before adding scenes and before exporting to catch missed reuse.',
    'Use batch_edit to build a complete object per call, inspect after each meaningful pass, then refine in batches. Batch references ($name) allow grouping and editing new shapes without waiting for IDs.',
    'Patterns: create_pattern makes a repeating tile; open it with set_editor(view: "pattern", patternId), draw the tile with the normal tools, then set any shape\'s style.fill or style.stroke to its `fill` reference (url(#id)) from list_patterns. update_pattern changes size, scale, rotation or background.',
    'Use list_sprites, create_sprite_sheet, add_sprite_page and set_editor for project-wide vector sprites. Draw each animation using the normal tools; place_sprite adds an instance plus a timed clip. Instances expose controls; sprites may nest but cannot include themselves.',
    'Group properties include overlapOperation (add/subtract/union/intersection), containerId and overflow (visible/hidden). Children remain editable. Text supports properties.textBox; stackOrder controls explicit stacking.',
    'Media: search_media(query, media, provider, filters) searches one provider for images (iconify for icons/logos/flags, wikimedia for maps and diagrams, openverse for CC SVGs, unsplash/pexels/pixabay for photos, nasa for space), audio (freesound for effects, jamendo or openverse-audio for music) or video (pexels-video, pixabay-video, wikimedia-video, nasa-video). list_media_providers lists the providers that are set up and their filters. Results are numbered and come with a contact-sheet picture of the thumbnails: look at it, then use one with pick_media(number), which places an image or video (returning its shapeId) or adds audio to the timeline. An image shape holds a picture, GIF or video, typed from its file; update_media sets a video\'s start/end (page times), trim, rate, loop, mute, volume and fit. Video timing is not animatable and never goes in a clip; animate the shape (opacity, scale, position) for entrances and exits. The page plays at least until its last video ends, and MP4 export includes video sound unless muted. To choose from what the user sees in Insert → Media, call get_media_dialog (same numbers as the badges on screen) and pick_media(number, from: "dialog"). Credit the author when the license asks.',
    'Choosing between drawing and media: the user\'s instructions come first. If they say not to use images, video, stock media or clip art (or to draw everything by hand), do not search or place any; if they ask for media only, use media. Otherwise decide by the animation an object needs, not by how detailed it is: (1) If it needs no animation, or only animation a single primitive shape can do as a whole (move, slide in/out, scale, rotate, fade, color or filter changes, follow a motion path, spin, bounce), it can be clip art or an SVG: prefer an existing one over drawing many shapes, especially for detailed objects (scenery, buildings, vehicles, props, maps, flags, logos, icons, decorative illustrations). Search with svg results (openverse extension "svg", wikimedia type "svg", iconify, nounproject, permaclipart, openclipart), place it with pick_media, and animate the placed shape with clips like any other shape. Prefer SVG over raster so it stays sharp. (2) Draw it with vector shapes when its parts must move separately (a character that walks, talks, blinks or waves, limbs and rigs, a door that opens, wheels that turn on a car that also moves, morphs, draw-on and typewriter effects, charts and diagrams that build up piece by piece), or when it is simple anyway (text, basic shapes, arrows, callouts). Recurring animated characters belong in sprite sheets. (3) Use photos for realistic subjects and photo backgrounds, video for real footage (b-roll, backgrounds, demonstrations; set start/end with update_media and mute it under narration), GIFs or stickers for playful accents, and audio for music beds and sound effects (keep music volume low under narration). (4) Look at the contact sheet before choosing and keep one consistent style per scene (do not mix flat icons, photos and detailed illustrations at random); size the result to the layout, set fit, layer it correctly, and check with screenshot. Use media where it adds something, not on every element. (5) If the results don\'t fit (none, wrong subject, wrong style, low quality, or a license you can\'t use), don\'t settle and don\'t draw it yet: search again, first with a better query (simpler or more specific words, synonyms, the object\'s English name, adding "icon", "illustration", "clipart" or "flat"), then with other filters, then with another provider of the same kind (for SVG/clip art try openverse → wikimedia → iconify → nounproject → permaclipart → openclipart; for photos unsplash → pexels → pixabay → openverse; for footage pexels-video → pixabay-video → wikimedia-video → nasa-video; for sound freesound → openverse-audio → wikimedia-audio; for music jamendo → openverse-audio). list_media_providers shows which are set up. Try a few searches (about 3–5) before falling back to drawing it. If a provider is unavailable or still nothing fits, draw it instead. Respect licenses: prefer public-domain/CC0 or commercial-use results, and tell the user which results need credit (author and license from the result).',
    'Coordinates are canvas pixels with the origin at the top-left; get_document reports the canvas pixel size.',
    'Use add_shape and update_shape for geometry, text, paint, transforms, CSS filters, modifiers and particles. Use add_svg_filter for outline or inset-shadow effects attached to a shape; palette colors and gradients can be reused as url(#id) fills.',
    'Illustration polish: shade with a shape set to style.blendMode "multiply" (e.g. a soft purple shape over the dark side) and light with "screen", inside the character\'s group (groups isolate blending, so it never darkens the background); keep shading inside the outline or clip it with the group\'s containerId + overflow hidden. add_svg_filter type "effect" adds creative filters: grain or paper for texture, boil for a hand-drawn line wobble, ripple, glitch, crt, hologram, smoke, dissolve, goo, pixelate, neon for glow, duotone/posterize for print looks, emboss, rgbSplit, inkEdges. Boil, glitch, crt, hologram, smoke and ripple move on their own; any effect control can be animated by changing it with update_svg_filter inside a clip. For anything else, write SVG filter primitives once with create_filter_preset and reuse it.',
    'Rigging: use add_bone to draw bone segments, connect_bones to join pieces at their nearest free tail/head endpoints, and update_joint to set angle limits, angle or IK. attach_bone_artwork and detach_bone_artwork bind drawn artwork to a bone. The page camera is independent of its canvas; set_camera adjusts the start frame, whether it appears in Layers, and a follow target.',
    'Camera group: move_into_group with groupId "camera" attaches artwork to the camera so it keeps its place on screen while the camera pans and zooms (HUDs, titles, subtitles). remove_from_camera takes it back out. get_document reports camera.follow and camera.group.',
    'Mirror: add_shape type "mirror" makes a frame divided into sections (radial wedges or side-by-side columns, default 4). Draw artwork inside its first section, then move_into_group it into the mirror; the other sections reflect it live. Change sections, mode or size with update_shape properties.mirror. Guides show only while editing.',
    'Motion path: add_shape type "motionPath" places an empty drop box. move_into_group an outline into it first (a line, pen path, rectangle…; it becomes the path), then the shape that should travel. Or convert_to_motion_path an existing outline. Inside a clip, update_shape properties.motionPath.progress from 0 to 100 moves the shape from start to end; rotate turns it to face its direction; showPath false hides the path. release_from_modifier takes the path or shape back out.',
    'Code, HTML, Markdown, MathML and diagrams: add_shape type "richContent" with properties.content {kind: "code" (with language, e.g. "python"), "html" (with css, scoped to the box), "markdown", "mathml" (<math>…</math>) or "mermaid" (diagram source), source} draws a box (x, y = top-left, sized per kind). Use it for code snippets, formulas, flowcharts and formatted text blocks instead of drawing them shape by shape. Content is sanitized: no scripts, iframes, forms or outside URLs (images only as data: URLs). It animates like a rectangle (x, y, width, height, opacity, transforms). Code that changes step by step (a refactor, an algorithm improving): create_code_file with named versions (v1-naive, v2-memo…), show it with properties.content.fileRef {fileId, versionId}, then inside a clip update_shape content.fileRef.versionId to the next version; the box animates the change with content.transition.preset (gitDiff default for code: red lines collapse, green lines grow; morph "clean replace", the Markdown default; typewriter; highlight; crossfade; cut) and its options (order, stagger, keepDiffColors, animateHighlight). You have no file system: create files from text (create_code_file with versions, add_code_version, update_code_version). Markdown animates whole blocks; HTML, Mermaid and MathML cross-fade. Versions with the same text but different highlight/focusLine step through one listing. get_shapes contentInfo tells which file and version a box shows; get_timeline lists version changes as content.fileRef.versionId (v1 → v2).',
    'Text effects: add_shape type "typewriter" or "bend" places an empty drop box that takes only text shapes (move_into_group). Typewriter: set properties.typewriter.progress 0, then 100 inside a clip (linear ease) to type the text on; unit char|word, order together|sequence, cursor bar|block|underscore|none. Bend: properties.bend.amount −100…100 curves the text along an arc (positive arches up, 100 = half circle) and offset 0…100 slides it along; both animate in clips.',
    'Function graphs: add_shape type "graph" draws a math graph y = f(x) with axes, ticks, grid and axis names (x, y = top-left, 480×320). Set properties.graph.expression (right side of y = f(x), e.g. "a*sin(b*x)", "x^2", "e^(-x^2)", "tan x"; letters other than x, pi, e, tau are variables in graph.params, default 1) or graph.functions for several curves, and the window xMin/xMax/yMin/yMax (piTicks true labels x in multiples of π). Animate inside clips with update_shape: graph.params.<name>, graph.drawProgress 0 → 1 (draws the curve on), graph.tracer {show: true, x} then a new x (a point slides along the curve with a live (x, y) readout), or the window to pan/zoom. Expressions, curves and the other settings that do not tween (toggles, axis names, tickStep, piTicks, autoY, background, fontFamily, tracer.show) are document settings: changing one inside a clip changes it everywhere and records nothing. get_shapes graphInfo reports each expression\'s validity, the variables and the animatable keys.',
    'Draw: add_shape type "draw" places an empty drop box; move_into_group shapes with a stroke into it. Set properties.draw.end 0 so they start hidden, then inside a clip set end 100 to draw them on (start 0 → 100 with end 100 erases them). order "sequence" draws one after another; direction and startPoint choose where and which way the pen goes; fill "reveal" fades fills in as each outline finishes. Only strokes are drawn.',
    'Audio: get_audio lists audio timelines, clips, their narration state and the Kokoro voices. add_audio_clip with text adds narration (kind "speech", voice e.g. "af_heart", "am_michael", "bf_emma"); the editor generates the audio automatically and the clip takes the spoken length, so call generate_speech_audio (repeat until audio is "ready") before relying on its duration, e.g. to time animation to the words. Use one audio timeline per speaker. File clips accept an audio data URL or source URL. set_play_range sets one start and end for the video and audio timelines; audio clips that run longer extend the end. export_subtitles returns SRT or VTT captions made from the narration, timed to the MP4 export, for YouTube and other platforms. Background music across pages: add_audio_clip with scope "global" (start is seconds on the all-pages sequence; get_audio sequence shows where each page starts); it never lengthens pages. fadeIn / fadeOut (seconds) add fades, and a fade out follows the clip end when its duration changes; volumeKeyframes [{time, volume, ease}] duck music under narration.',
    'Animation: each timeline is a row of clips (the API tool names retain "cutscene"). Shape edits are recorded into the open clip as changes from the previous clip; during it, the object animates from the previous state to the new one.',
    'Each timeline animates one object; an object can have several (separate animations that play together, layered property by property; add_timeline with newTimeline true adds one). Draw artwork first, use add_timeline with shapeId to create or open its timeline, or omit shapeId for an empty row and assign it later with update_timeline. That assignment is permanent. Groups and sprites count as one object; children may have their own timelines. Deleting a timeline keeps artwork.',
    'To animate: draw the starting artwork, call add_timeline with shapeId, then add_cutscene and move or restyle that object. There is no implicit Start clip. Use screenshot with `time` to inspect an animation moment.',
    'Reading: read precisely instead of dumping everything. get_document with includeShapes false gives the overview; get_layer_tree shows structure and draw order (bottom → top); find_shapes locates shapes by regex over name, text or id, or by type, fill, canvas area, parent or animated; get_shapes / get_shape with `fields` read only the properties you need; get_timeline reads one object\'s animation. All of these take `page` to read another page without switching. screenshot_region zooms into shapes or an area (with `time`); shapes_at_point lists what is drawn at a spot, top first, to find what covers something. Mind layer order: draw backgrounds and panels before the objects that sit or move on them, and if a panel is added later, bring those objects to the front.',
    'Best practices: inspect get_document (includeShapes false) and get_layer_tree first; use the canvas pixel size for coordinates. Group related shapes before adding object timelines, name groups clearly, nest groups for larger objects, and animate the group. A group and its children may each have their own animation timelines.',
    'get_document returns hiddenShapeIds. Use set_layer_visibility to show or hide a page layer without changing opacity or creating a clip. Hiding a group hides its descendants.',
    'Reuse styling: add a palette color or gradient (give it a meaningful `name`; unnamed ones become "Color N" / "Gradient N"), then reuse its `fill` reference (`url(#id)`) across the document. list_colors and get_document show existing entries; update a shared color or gradient instead of changing every shape that uses it.',
    'Custom transitions: add_curve saves a cubic Bézier curve and returns its `ease` ("cubic-bezier(x1, y1, x2, y2)"); give that as a clip\'s ease. list_curves shows saved curves; update_curve changes every clip using it.',
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

/**
 * Forwards a tool call to the editor tab and returns its JSON answer as text. Pictures a command
 * attaches as `__images` (e.g. search_media's numbered contact sheet) go back as image content.
 */
async function run(method, params = {}) {
  try {
    const result = await bridge.call(method, params);
    const { __images: images, ...rest } =
      result && typeof result === 'object' && !Array.isArray(result) ? result : { value: result };
    const body = result && typeof result === 'object' && !Array.isArray(result) ? rest : result;
    return {
      ...(method === 'batchEdit' && result?.ok === false ? { isError: true } : {}),
      content: [
        ...(Array.isArray(images)
          ? images.map(({ data, mimeType }) => ({ type: 'image', data, mimeType }))
          : []),
        { type: 'text', text: JSON.stringify(body, null, 2) },
      ],
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
  export_subtitles: async (args) => {
    try {
      const { filename, mimeType, text, cues } = await bridge.call('exportSubtitles', args);
      return {
        content: [
          {
            type: 'resource',
            resource: { uri: `vexo-export://${encodeURIComponent(filename)}`, mimeType, text },
          },
          { type: 'text', text: `Exported ${filename} (${cues} cues)` },
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
  // batch_edit's schema leaves each operation's args open (repeating every shape schema in it
  // would double its size), so each operation is checked against its own tool's schema here
  batch_edit: async (args) => {
    const problem = checkBatchEdit('mcp', args.operations);
    if (problem) return { isError: true, content: [{ type: 'text', text: problem }] };
    return run('batchEdit', args);
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
