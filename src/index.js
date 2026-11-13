#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EditorBridge } from './bridge.js';

const PORT = Number(process.env.SVG_EDITOR_BRIDGE_PORT || 7341);
const ALLOWED_ORIGINS = (process.env.SVG_EDITOR_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// stdout carries the MCP protocol, so logs go to stderr
const log = (msg) => process.stderr.write(`[svgtool-mcp] ${msg}\n`);

const bridge = new EditorBridge({ port: PORT, allowedOrigins: ALLOWED_ORIGINS, log });

const server = new McpServer(
  { name: 'svgtool', version: '0.1.0' },
  {
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
  },
);

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

const point = z.tuple([z.number(), z.number()]);
const blendMode = z
  .enum(['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'])
  .describe('how the shape mixes with what is beneath it: multiply for shading, screen for light and glow, overlay/soft-light for texture, color/hue to tint');
const shapeType = z.enum([
  'circle',
  'rectangle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'image',
  'mirror',
  'motionPath',
  'draw',
]);
const motionPath = z
  .object({
    showPath: z
      .boolean()
      .optional()
      .describe('draw the path shape with its own style (default true); false hides it'),
    start: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('where along the path travel begins, % of its length (default 0)'),
    end: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('where along the path travel ends, % of its length (default 100)'),
    progress: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'how far the shape has travelled from start to end, % (default 0); change it inside a clip, e.g. 0 → 100, to move the shape along the path',
      ),
    rotate: z
      .boolean()
      .optional()
      .describe('turn the shape to face the direction it moves (its right side leads)'),
  })
  .describe(
    'motionPath only: how its shape travels along its path; add the path and the shape with move_into_group',
  );
const draw = z
  .object({
    start: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('where the visible stroke begins, % of each outline (default 0)'),
    end: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'where the visible stroke ends, % (default 100). Set 0 so shapes start hidden, then 100 inside a clip to draw them on',
      ),
    startPoint: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "where on each outline the pen starts, % of its length from the outline's own start (a rectangle's top-left corner, a circle's right-hand point); closed outlines wrap round",
      ),
    order: z
      .enum(['together', 'sequence'])
      .optional()
      .describe('together: every shape at once; sequence: one after another in layer order'),
    direction: z
      .enum(['forward', 'backward', 'both'])
      .optional()
      .describe('forward: one side at a time (clockwise on rectangles/circles); backward: the other way; both: out both ways from startPoint'),
    fill: z
      .enum(['show', 'reveal', 'hide'])
      .optional()
      .describe('fill while drawing: show always, reveal = fade in as each outline finishes, hide = outline only'),
  })
  .describe(
    'draw only: reveals the strokes of its shapes like a pen drawing them; only strokes are drawn, so give shapes a stroke',
  );
const mirror = z
  .object({
    mode: z
      .enum(['radial', 'side-by-side'])
      .optional()
      .describe('radial: wedges around the centre; side-by-side: columns'),
    segments: z.number().int().min(2).max(24).optional().describe('sections, 2–24 (default 4)'),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .describe(
    'mirror only: the frame size and how many sections reflect the artwork drawn in the first one',
  );
const transition = z.enum([
  'none',
  'fade',
  'zoom',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
]);
const ease = z
  .string()
  .describe(
    'GSAP ease, e.g. "none" (linear), "power1.inOut" (smooth), "power2.in", "power2.out", "back.out(1.7)", "elastic.out(1, 0.4)", "bounce.out"',
  );

const arrayModifier = z.object({
  id: z.string().optional().describe('any unique id'),
  type: z.literal('array'),
  enabled: z.boolean().default(true),
  mode: z
    .enum(['linear', 'radial', 'random'])
    .describe(
      'linear: a row of copies; radial: a ring of copies around the shape; random: copies scattered over an area',
    ),
  count: z.number().int().min(0).max(200).describe('copies besides the shape itself'),
  stack: z
    .enum(['horizontal', 'vertical'])
    .optional()
    .describe(
      'linear: copies placed side by side (horizontal, default) or one under another, each against the last',
    ),
  offset: z
    .array(z.number())
    .length(2)
    .optional()
    .describe(
      'linear: [x, y] px. Along the stack it is the gap between copies (0 = touching, the default); across it, how far each copy steps aside',
    ),
  delay: z
    .number()
    .min(0)
    .optional()
    .describe(
      "linear: seconds each copy plays the shape's animation behind the one before (0 = all in step, the default); makes waves, marching rows and staggered entrances",
    ),
  radius: z.number().optional().describe('radial: ring radius'),
  sweep: z.number().optional().describe('radial: degrees round the ring, default 360'),
  rotateCopies: z.boolean().optional().describe('radial: turn copies to face outwards'),
  spanWidth: z.number().optional().describe('random: width of the area, centred on the shape'),
  spanHeight: z.number().optional().describe('random: height of the area'),
  seed: z.number().optional().describe('random: change to reshuffle'),
  hideSource: z.boolean().optional().describe('show only the copies, not the shape itself'),
  copyParticles: z
    .boolean()
    .optional()
    .describe("copies give off the shape's particles too (default true)"),
  hideSourceParticles: z
    .boolean()
    .optional()
    .describe('only the copies give off particles, not the shape itself'),
});

const particles = z.object({
  enabled: z.boolean().default(true),
  type: z
    .enum(['emit', 'fall', 'up', 'random', 'custom'])
    .describe(
      'emit: burst out in every direction (fireworks); fall: drift down (snow, confetti); up: rise (embers, bubbles); random: wander (sparkles); custom: motion written as expressions in `script` (orbits, spirals, vortices, shapes, anything else)',
    ),
  count: z.number().int().min(1).max(600).describe('particles per wave'),
  ttl: z.number().positive().describe('seconds each particle lives'),
  speed: z.number().min(0).describe('px per second on average'),
  velocity: z.enum(['constant', 'slow-down', 'speed-up']).default('slow-down'),
  opacity: z.enum(['constant', 'fade-out', 'fade-in-out', 'flicker']).default('fade-out'),
  colorStart: z.string().describe('colour when born'),
  colorEnd: z.string().describe('colour when it dies (blended in between)'),
  source: z
    .enum(['circle', 'star', 'self', 'image'])
    .default('circle')
    .describe('what a particle looks like; self = a copy of the shape'),
  image: z.string().optional().describe('image URL or data: URL when source is image'),
  size: z
    .number()
    .positive()
    .describe('particle radius in px; for self, scale of the copies (1 = same size)'),
  spread: z
    .number()
    .min(0)
    .default(0)
    .describe('seconds over which a wave is let out (0 = all at once, a burst)'),
  spanWidth: z
    .number()
    .min(0)
    .default(0)
    .describe('fall/up/random: width of the area particles start from'),
  spanHeight: z.number().min(0).default(0),
  gravity: z.number().default(0).describe('px/s² pulling down (fireworks droop ~40)'),
  loop: z
    .boolean()
    .default(false)
    .describe('keep emitting: a new wave every `spread` seconds (or every `ttl` for bursts)'),
  seed: z.number().default(1),
  hideSource: z
    .boolean()
    .optional()
    .describe('show only the particles, not the shape giving them off (e.g. a small emitter dot)'),

  component: z
    .string()
    .optional()
    .describe(
      'type custom, preferred over script: a React-style TSX component drawing ONE particle around (0, 0) = the emitting shape, as in the Particle Editor. `export const emitter = { count: 60, ttl: 3, spread: 3, loop: true, size: 3, colorStart: "#7cf6ff", colorEnd: "#a26bff" };` `export const controls = { radius: { type: "number", label: "Radius", default: 140 } } as const;` `export default function Spark({ u, k, r1, size, color, radius }) { return <circle cx={cos(k*tau)*radius*u} cy={sin(k*tau)*radius*u} r={size} fill={color} opacity={1-u}/>; }`. Props: t, u (life 0→1), T, i, n, k, w, r1…r6, ttl, speed, gravity, spanWidth, spanHeight, size, color (start→end over life), colorStart, colorEnd, plus each control. Return circle, ellipse, rect, line, polyline, polygon, path or g. Same globals as filters plus mixColor(a, b, k).',
    ),
  values: z
    .record(z.string(), z.union([z.number(), z.string()]))
    .optional()
    .describe("the component's control values"),
  script: z
    .object({
      x: z.string().describe('px from the emitting shape, across, e.g. "cos(r1*tau + u*spin) * radius * u"'),
      y: z.string().describe('px from the emitting shape, down'),
      opacity: z.string().optional().describe('0–1; omit to use the opacity curve'),
      size: z.string().optional().describe('times `size`; omit for 1'),
      rotate: z.string().optional().describe('degrees'),
      color: z.string().optional().describe('0 = colorStart, 1 = colorEnd; omit to blend over life'),
      params: z.record(z.string(), z.number()).optional().describe('numbers the expressions use by name'),
    })
    .optional()
    .describe(
      'type custom: each particle\'s motion and look as expressions, evaluated every frame. Variables: t (age s), u (life 0→1), T (s since the shape appeared), i (index in wave), n (count), k (i/n), w (wave), r1…r6 (random 0–1 fixed per particle), ttl, speed, gravity, spanWidth, spanHeight, size, plus params. Functions: sin cos tan atan2 abs floor ceil round sign sqrt exp log min max pow frac mod clamp mix smoothstep random noise; constants pi tau e. Examples: orbit x "cos(k*tau + T) * 110", y "sin(k*tau + T) * 40"; heart x "6*16*pow(sin(k*tau),3)", y "-6*(13*cos(k*tau)-5*cos(2*k*tau)-2*cos(3*k*tau)-cos(4*k*tau))".',
    ),
});

const properties = z
  .object({
    blendIsolation: z
      .boolean()
      .optional()
      .describe('group: keep blend modes inside the group from mixing with what is behind it (default true)'),
    overlapOperation: z
      .enum(['add', 'subtract', 'union', 'intersection'])
      .optional()
      .describe(
        'Group: non-destructive combination, first child supplies the fill; add restores editable children.',
      ),
    containerId: z
      .string()
      .optional()
      .describe(
        'Group: ID of a direct child used as the overflow container; empty string clears it.',
      ),
    overflow: z
      .enum(['visible', 'hidden'])
      .optional()
      .describe('Group: hidden clips to the selected container shape.'),
    stackOrder: z
      .number()
      .finite()
      .optional()
      .describe(
        'Explicit stacking order; greater values appear in front. Selection does not change it.',
      ),
    textBox: z
      .object({
        width: z.number().positive(),
        lineHeight: z.number().positive().optional(),
        maxLines: z.number().int().positive().optional(),
      })
      .optional()
      .describe('Text wrapping width, optional line height and line limit.'),
    name: z.string().optional().describe('label shown in the editor'),
    x: z
      .number()
      .optional()
      .describe('circle/ellipse: center x; rectangle/image: left; text: start of the baseline'),
    y: z
      .number()
      .optional()
      .describe('circle/ellipse: center y; rectangle/image: top; text: baseline'),
    radius: z.number().optional().describe('circle'),
    radiusX: z.number().optional().describe('ellipse'),
    radiusY: z.number().optional().describe('ellipse'),
    width: z.number().optional().describe('rectangle, image'),
    height: z.number().optional().describe('rectangle, image'),
    rx: z.number().optional().describe('rectangle corner radius (ry follows it unless given)'),
    ry: z.number().optional().describe('rectangle vertical corner radius'),
    points: z
      .array(point)
      .optional()
      .describe(
        'line (2 points), polyline, polygon. For a path prefer `d`; points alone draw a cubic Bézier: the first point is the start and the rest are read in threes (control 1, control 2, end), so give 1 + 3n points',
      ),
    d: z
      .string()
      .optional()
      .describe(
        'path: SVG path data with any commands — M/L/H/V/C/S/Q/T/A/Z, absolute or relative, e.g. "M 10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80 A 30 30 0 0 1 240 80 Z". Every node stays editable in the editor',
      ),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.number().optional().describe('100–900'),
    fontStyle: z.enum(['normal', 'italic', 'oblique']).optional(),
    fontFamily: z.string().optional().describe('e.g. "Arial", "Helvetica", "Georgia", "Futura"'),
    genericFontFamily: z
      .enum(['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace'])
      .optional(),
    modifiers: z
      .array(arrayModifier)
      .optional()
      .describe(
        'copies of the shape worked out live (they follow its edits and animation): use instead of drawing repeated shapes; replaces the whole list',
      ),
    particles: particles
      .optional()
      .describe(
        'particles given off by the shape from when it appears: use for fireworks, sparks, snow, confetti, embers instead of drawing many shapes',
      ),
    base64Url: z
      .string()
      .optional()
      .describe('image source: a data: URL (http URLs show in the editor but not in screenshots)'),
    mirror: mirror.optional(),
    motionPath: motionPath.optional(),
    draw: draw.optional(),
  })
  .describe('Geometry and content; which keys apply depends on the shape type');

const style = z
  .object({
    fill: z
      .string()
      .optional()
      .describe('CSS color, "transparent", or a reusable palette/gradient reference "url(#id)"'),
    fillOpacity: z.number().min(0).max(1).optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    strokeOpacity: z.number().min(0).max(1).optional(),
    strokeDasharray: z.array(z.number()).optional(),
    strokeTaper: z
      .object({ start: z.number().min(0).max(0.5), end: z.number().min(0).max(0.5) })
      .optional()
      .describe(
        'line/polyline/polygon/path: share of the length (0–0.5) over which the stroke thins to a point at its start and end, for hand-inked lines',
      ),
    strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
    strokeLinejoin: z.enum(['bevel', 'miter', 'round']).optional(),
    opacity: z.number().min(0).max(1).optional().describe('whole-shape opacity'),
    blendMode: blendMode.optional(),
    translate: point
      .optional()
      .describe(
        '[dx, dy] offset applied on top of the geometry; this is what dragging a shape changes',
      ),
    rotate: z.number().optional().describe('degrees, around the shape center'),
    scale: point.optional().describe('[sx, sy], around the shape center'),
    skewX: z.number().optional(),
    skewY: z.number().optional(),
    cssFilters: z
      .object({
        blur: z.number().optional().describe('px'),
        brightness: z.number().optional().describe('percent, 100 = unchanged'),
        contrast: z.number().optional().describe('percent'),
        grayscale: z.number().optional().describe('percent'),
        hueRotate: z.number().optional().describe('degrees'),
        invert: z.number().optional().describe('percent'),
        opacity: z.number().optional().describe('percent'),
        saturate: z.number().optional().describe('percent'),
        sepia: z.number().optional().describe('percent'),
        dropShadow: z
          .array(
            z.object({
              xOffset: z.number(),
              yOffset: z.number(),
              blur: z.number(),
              color: z.string(),
            }),
          )
          .optional(),
      })
      .optional()
      .describe('replaces all CSS filters of the shape'),
  })
  .describe('Paint and transform; only the keys given change');

const readOnly = { readOnlyHint: true, openWorldHint: false };
const edit = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

server.registerTool(
  'editor_status',
  {
    title: 'Editor status',
    description: 'Whether an editor tab is connected, and which document and cutscene it has open.',
    annotations: readOnly,
  },
  async () => {
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
);

// ---------- documents

server.registerTool(
  'undo',
  {
    title: 'Undo edit',
    description: 'Undo the most recent editor change.',
    annotations: edit,
  },
  () => run('undo'),
);

server.registerTool(
  'redo',
  {
    title: 'Redo edit',
    description: 'Redo the most recently undone editor change.',
    annotations: edit,
  },
  () => run('redo'),
);

server.registerTool(
  'list_documents',
  {
    title: 'List documents',
    description: 'Documents saved in this browser.',
    annotations: readOnly,
  },
  () => run('listDocuments'),
);

server.registerTool(
  'open_document',
  {
    title: 'Open document',
    description:
      'Opens a saved document in the editor. Unsaved changes to the current document are lost.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('openDocument', args),
);

server.registerTool(
  'new_document',
  {
    title: 'New document',
    description:
      'Starts a new empty document, or loads one from JSON in the editor\'s export format ("Export as JSON"). Unsaved changes to the current document are lost.',
    inputSchema: {
      document: z
        .record(z.string(), z.any())
        .optional()
        .describe('a document exported with "Export as JSON"'),
    },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('newDocument', args),
);

server.registerTool(
  'save_document',
  {
    title: 'Save document',
    description:
      'Saves the document in the browser. With a name, saves a new copy under that name ("Save as"); without one, overwrites the document it was opened from.',
    inputSchema: { name: z.string().optional() },
    annotations: edit,
  },
  (args) => run('saveDocument', args),
);

server.registerTool(
  'export_document',
  {
    title: 'Export document JSON',
    description:
      'Returns the full document in the editor JSON format, including every page, shape, palette, gradient, filter and animation.',
    annotations: readOnly,
  },
  () => run('exportDocument'),
);

server.registerTool(
  'get_document',
  {
    title: 'Get document',
    description:
      'The current page: canvas, independent camera frame, audio timelines and clips, color and gradient palettes, SVG filters, playback range, hidden layers, selection, editing clip and shapes (styles show values changed from defaults). render:false shapes are group children.',
    inputSchema: { includeShapes: z.boolean().optional().describe('default true') },
    annotations: readOnly,
  },
  (args) => run('getDocument', args),
);

// ---------- shapes

server.registerTool(
  'get_shape',
  {
    title: 'Get shape',
    description: 'Every property of one shape, including default style values.',
    inputSchema: { id: z.string() },
    annotations: readOnly,
  },
  (args) => run('getShape', args),
);

server.registerTool(
  'search_images',
  {
    title: 'Search images',
    description:
      'Searches free clip art, illustrations, vectors or photos. Use a returned image URL with add_shape(type: "image", src: ...).',
    inputSchema: {
      query: z.string().min(3),
      type: z
        .enum(['clipArt', 'illustration', 'vector', 'photo'])
        .optional()
        .describe('default clipArt'),
      page: z.number().int().min(1).optional().describe('result page, 20 items each'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  (args) => run('searchImages', args),
);

server.registerTool(
  'list_colors',
  {
    title: 'List palette colors',
    description: 'Lists saved document colors and their reusable SVG fill references.',
    annotations: readOnly,
  },
  () => run('listColors'),
);

server.registerTool(
  'add_color',
  {
    title: 'Add palette color',
    description:
      'Saves a color in the document palette and returns its id and reusable fill reference.',
    inputSchema: { color: z.string() },
    annotations: edit,
  },
  (args) => run('addColor', args),
);

server.registerTool(
  'update_color',
  {
    title: 'Update palette color',
    description: 'Changes a saved palette color; shapes using its fill reference update with it.',
    inputSchema: { id: z.string(), color: z.string() },
    annotations: edit,
  },
  (args) => run('updateColor', args),
);

server.registerTool(
  'remove_color',
  {
    title: 'Remove palette color',
    description:
      'Removes a saved color from the palette. Shapes that reference it will no longer use that palette pattern.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('removeColor', args),
);

server.registerTool(
  'add_svg_filter',
  {
    title: 'Add SVG filter',
    description:
      'Attaches an SVG filter to a shape: an outline, inset shadow or drop shadow; or type "effect" with a `preset` (built-in creative effects: grain, paper, ripple, boil, glitch, crt, hologram, smoke, dissolve, goo, pixelate, neon, duotone, posterize, emboss, rgbSplit, inkEdges; or a project preset from create_filter_preset) and its control `values`. Several filters stack in order. CSS filters are available through update_shape.',
    inputSchema: {
      shapeId: z.string(),
      type: z.enum(['outline', 'insetShadow', 'dropShadow', 'effect']),
      color: z.string().optional(),
      blur: z.number().min(0).optional(),
      radius: z.number().min(0).optional().describe('outline thickness'),
      xOffset: z.number().optional().describe('shadow horizontal offset'),
      yOffset: z.number().optional().describe('shadow vertical offset'),
      preset: z.string().optional().describe('effect: preset id from list_filter_presets'),
      values: z
        .record(z.string(), z.union([z.number(), z.string()]))
        .optional()
        .describe('effect: control values by param key; missing ones use the preset defaults'),
    },
    annotations: edit,
  },
  (args) => run('addSvgFilter', args),
);

server.registerTool(
  'update_svg_filter',
  {
    title: 'Update SVG filter',
    description:
      'Changes a filter already attached to a shape: outline/shadow settings, or an effect\'s control `values`. Effect values live on the shape, so changing them inside an open clip animates them (e.g. dissolve amount 0 → 1).',
    inputSchema: {
      shapeId: z.string(),
      id: z.string(),
      type: z.enum(['outline', 'insetShadow', 'dropShadow', 'effect']),
      color: z.string().optional(),
      blur: z.number().min(0).optional(),
      radius: z.number().min(0).optional(),
      xOffset: z.number().optional(),
      yOffset: z.number().optional(),
      values: z
        .record(z.string(), z.union([z.number(), z.string()]))
        .optional()
        .describe('effect: control values to change, by param key'),
    },
    annotations: edit,
  },
  (args) => run('updateSvgFilter', args),
);

const effectParam = z.object({
  key: z.string().regex(/^\w+$/).describe('used as {{key}} in the markup'),
  label: z.string(),
  kind: z.enum(['number', 'color']),
  default: z.union([z.number(), z.string()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
});

server.registerTool(
  'list_particle_presets',
  {
    title: 'List particle presets',
    description: 'Built-in particle presets (including scripted ones: Spiral galaxy, Orbit, Fireflies, Vortex, Heart, Fountain arc) and the project\'s own, each with its full `particles` settings. Copy one into update_shape properties.particles, adjusting as needed.',
    inputSchema: {},
    annotations: readOnly,
  },
  (args) => run('listParticlePresets', args),
);

server.registerTool(
  'create_particle_preset',
  {
    title: 'Create particle preset',
    description: 'Saves a particle setup in the project so it can be reused and appears in the Particles panel. For new motion use type "custom" with a `script` (see the particles property). Returns the preset; apply it with update_shape properties.particles.',
    inputSchema: {
      name: z.string().min(1),
      hint: z.string().optional(),
      folder: z.string().optional().describe('Filesystem folder path'),
      particles,
    },
    annotations: edit,
  },
  (args) => run('createParticlePreset', args),
);

server.registerTool(
  'update_particle_preset',
  {
    title: 'Update particle preset',
    description: 'Changes a project particle preset: its name, hint, Filesystem folder, or its particles (pass only what changes; type custom with a `component` or `script` is checked). Shapes made from the preset update too.',
    inputSchema: {
      presetId: z.string(),
      name: z.string().min(1).optional(),
      hint: z.string().optional(),
      folder: z.string().optional().describe('Filesystem folder path; "" = top level'),
      particles: particles.partial().optional(),
    },
    annotations: edit,
  },
  (args) => run('updateParticlePreset', args),
);

server.registerTool(
  'delete_particle_preset',
  {
    title: 'Delete particle preset',
    description: 'Deletes a project particle preset. Shapes keep the particles they already have.',
    inputSchema: { presetId: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteParticlePreset', args),
);

server.registerTool(
  'list_filter_presets',
  {
    title: 'List filter presets',
    description: 'Built-in creative filter presets and the project\'s own, with their params (and markup for project presets). Use a preset id with add_svg_filter type "effect".',
    inputSchema: {},
    annotations: readOnly,
  },
  (args) => run('listFilterPresets', args),
);

server.registerTool(
  'create_filter_preset',
  {
    title: 'Create filter preset',
    description: 'Saves a reusable creative SVG filter in the project, for effects the built-in presets don\'t cover. `markup` is the inside of a <filter>: SVG filter primitives only (feTurbulence, feDisplacementMap, feGaussianBlur, feColorMatrix, feComponentTransfer with feFuncR/G/B/A, feComposite, feBlend, feMorphology, feConvolveMatrix, feDiffuseLighting/feSpecularLighting with a light, feFlood, feOffset, feMerge, feDropShadow, feTile); feImage, scripts and links are stripped. Use {{key}} for each param; a color param also gives {{key.r}}, {{key.g}}, {{key.b}} (0–1), a number param {{key.inv}} (1 − value) and {{key.steps}} (that many values from 0 to 1). {{= expression}} computes from number params and t (seconds), with + - * / %, pi and sin, cos, abs, floor, ceil, round, sqrt, min, max, pow, frac, mod, clamp, smoothstep, random(n); e.g. seed="{{= floor(t*rate)}}" makes noise change rate times a second, so the effect moves during playback. Apply it with add_svg_filter type "effect". Returns the cleaned markup as `preview`.',
    inputSchema: {
      name: z.string().min(1),
      description: z.string().optional(),
      markup: z
        .string()
        .min(1)
        .optional()
        .describe('the filter as SVG filter primitives with {{placeholders}}; use `source` instead for a component'),
      source: z
        .string()
        .optional()
        .describe(
          'Preferred: the filter as a React-style TSX component (what users see in the Filter Editor). `export const controls = { size: { type: "number", label: "Size", default: 8, min: 0, max: 40 }, color: { type: "color", label: "Colour", default: "#0ef" } } as const;` then `export default function MyFilter({ size, color, t, box }) { return (<><feGaussianBlur in="SourceAlpha" stdDeviation={size} result="b"/><feFlood floodColor={color}/><feComposite in2="b" operator="in"/></>); }`. Props: each control, t (seconds; using it makes it move) and box {x, y, width, height} (the shape\'s bounds, for placing feTile/feFlood regions). Return only filter primitives (fe…). Globals: tau, pi, sin, cos, mix, clamp, smoothstep, frac, mod, noise, random, channel(color, "r"|"g"|"b"), steps(n). Runs in a sandbox; only "react" may be imported.',
        ),
      params: z.array(effectParam).max(20).optional(),
      folder: z.string().optional().describe('Filesystem folder path, e.g. "Effects/Glows"'),
    },
    annotations: edit,
  },
  (args) => run('createFilterPreset', args),
);

server.registerTool(
  'update_filter_preset',
  {
    title: 'Update filter preset',
    description: "Changes a project filter preset's name, description, Filesystem folder, component `source`, or markup and params. Every shape using it updates. Built-in presets can't be changed.",
    inputSchema: {
      presetId: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      markup: z.string().min(1).optional(),
      source: z
        .string()
        .optional()
        .describe('replaces the filter with this React-style TSX component (same format as create_filter_preset)'),
      params: z.array(effectParam).max(20).optional(),
      folder: z.string().optional().describe('move it to this Filesystem folder; "" = top level'),
    },
    annotations: edit,
  },
  (args) => run('updateFilterPreset', args),
);

server.registerTool(
  'delete_filter_preset',
  {
    title: 'Delete filter preset',
    description: 'Deletes a project filter preset. Effects still using it stop changing their shapes.',
    inputSchema: { presetId: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteFilterPreset', args),
);

server.registerTool(
  'remove_svg_filter',
  {
    title: 'Remove SVG filter',
    description:
      'Detaches an outline, inset shadow or drop shadow from a shape and removes that filter from the page.',
    inputSchema: {
      shapeId: z.string(),
      id: z.string(),
      type: z.enum(['outline', 'insetShadow', 'dropShadow', 'effect']),
    },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('removeSvgFilter', args),
);

server.registerTool(
  'add_shape',
  {
    title: 'Add shape',
    description: [
      'Draws a shape on the current page and selects it. New shapes default to a 1px black stroke and a transparent fill.',
      'circle/ellipse: x, y = center (defaults radius 40 / radiusX 80, radiusY 40). rectangle/image: x, y = top-left (defaults 60×60 / 200×200).',
      'text: x, y = baseline start. line/polyline/polygon: give `points`; path: give `properties.d` (SVG path data); x and y are ignored.',
      'mirror: x, y = top-left of its frame (default 320×320, 4 radial sections); then draw artwork inside its first section (top-right wedge for radial, left column for side-by-side) and move_into_group it into the mirror.',
      'motionPath: x, y = top-left of an empty drop box. move_into_group an outline (line, path, rectangle…) into it first: that becomes the path; then move_into_group the shape that travels along it. convert_to_motion_path turns an existing outline into one. Change properties.motionPath.progress inside a clip (0 → 100) to move the shape.',
      'draw: x, y = top-left of an empty drop box. move_into_group shapes with a stroke (or plain groups of them) into it; set properties.draw.end 0 so they start hidden, then 100 inside a clip to draw them on.',
    ].join(' '),
    inputSchema: {
      type: shapeType,
      x: z.number().optional(),
      y: z.number().optional(),
      points: z.array(point).optional().describe('for line, polyline, polygon, path'),
      src: z
        .string()
        .optional()
        .describe(
          'image: a data: URL or image URL; data URLs work in screenshots and self-contained exports',
        ),
      properties: properties.optional(),
      style: style.optional(),
    },
    annotations: edit,
  },
  (args) => run('addShape', args),
);

server.registerTool(
  'update_shape',
  {
    title: 'Update shape',
    description:
      "Changes a shape's geometry, text, or style. Only the given keys change; arrays (points, translate, scale) are replaced whole.",
    inputSchema: { id: z.string(), properties: properties.optional(), style: style.optional() },
    annotations: edit,
  },
  (args) => run('updateShape', args),
);

server.registerTool(
  'delete_shapes',
  {
    title: 'Delete shapes',
    description:
      "Deletes shapes (a group's children go with it). Inside a later cutscene, this makes them exit with an animation.",
    inputSchema: { ids: z.array(z.string()).min(1) },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteShapes', args),
);

server.registerTool(
  'duplicate_shapes',
  {
    title: 'Duplicate shapes',
    description:
      'Copies top-level shapes (groups with their children), moved by `offset`, and selects the copies. Returns them.',
    inputSchema: {
      ids: z.array(z.string()).min(1),
      offset: point.optional().describe('[dx, dy], default [20, 20]'),
    },
    annotations: edit,
  },
  (args) => run('duplicateShapes', args),
);

server.registerTool(
  'select_shapes',
  {
    title: 'Select shapes',
    description:
      'Selects shapes in the editor, so the user sees them highlighted. An empty list clears the selection.',
    inputSchema: { ids: z.array(z.string()) },
    annotations: edit,
  },
  (args) => run('selectShapes', args),
);

server.registerTool(
  'group_shapes',
  {
    title: 'Group shapes',
    description:
      'Groups top-level shapes so they move and transform together, and shows them as one named item in Layers. Group related shapes before adding object timelines whenever possible. Returns the new group.',
    inputSchema: { ids: z.array(z.string()).min(1), name: z.string().optional() },
    annotations: edit,
  },
  (args) => run('groupShapes', args),
);

server.registerTool(
  'move_into_group',
  {
    title: 'Move into group',
    description:
      'Moves shapes into an existing group, mirror, motion path or draw, keeping where they appear on the canvas; they leave their previous group. A motion path takes two: the first shape becomes its path (an outline, not a group, text or image) and the next travels along it. A draw takes any shapes with outlines. groupId "camera" puts them in the camera group so they move and zoom with the camera (HUDs, titles, subtitles, score); the first such move creates it. Bones, joints, arrays and morphs cannot take children here, and a group cannot go inside its own descendants. release_from_modifier takes a shape back out of a motion path or draw.',
    inputSchema: {
      ids: z.array(z.string()).min(1),
      groupId: z.string().describe('a group, mirror, motion path or draw id, or "camera"'),
    },
    annotations: edit,
  },
  (args) => run('moveIntoGroup', args),
);

server.registerTool(
  'release_from_modifier',
  {
    title: 'Release from modifier',
    description:
      'Takes a shape out of a motion path, draw or morph and puts it back on the canvas where it appears now (fully drawn, if it was in a draw). Releasing a motion path\'s path leaves it empty until another outline is moved in.',
    inputSchema: {
      modifierId: z.string().describe('the motion path, draw or morph'),
      id: z.string().describe('the shape inside it to release'),
    },
    annotations: edit,
  },
  (args) => run('releaseFromModifier', args),
);

server.registerTool(
  'convert_to_motion_path',
  {
    title: 'Convert to motion path',
    description:
      'Turns a non-group shape with an outline (line, polyline, polygon, path, rectangle, circle, ellipse) into a motion path that uses it as its path, in the same place. Then move_into_group the shape that should travel along it.',
    inputSchema: { id: z.string() },
    annotations: edit,
  },
  (args) => run('convertToMotionPath', args),
);

server.registerTool(
  'remove_from_camera',
  {
    title: 'Remove from camera',
    description:
      'Takes shapes out of the camera group back to the top level, where they sit at the camera\'s start frame. An empty camera group is removed.',
    inputSchema: { ids: z.array(z.string()).min(1) },
    annotations: edit,
  },
  (args) => run('removeFromCamera', args),
);

server.registerTool(
  'set_layer_visibility',
  {
    title: 'Set layer visibility',
    description:
      'Shows or hides a page layer without changing opacity or creating a clip. Hiding a group also hides its descendants; show the hidden group to make its children visible again.',
    inputSchema: { id: z.string(), visible: z.boolean() },
    annotations: edit,
  },
  (args) => run('setLayerVisibility', args),
);

// ---------- bones, joints and camera

server.registerTool(
  'add_bone',
  {
    title: 'Add bone',
    description:
      'Draws a bone between two canvas points. Optionally attach it to a free tail endpoint on an existing rig by passing rootId and anchorBoneId.',
    inputSchema: {
      start: point.describe('bone head [x, y]'),
      end: point.describe('bone tail [x, y]'),
      rootId: z.string().optional().describe('existing rig group to extend'),
      anchorBoneId: z.string().optional().describe('free bone tail endpoint on that rig'),
    },
    annotations: edit,
  },
  (args) => run('addBone', args),
);

server.registerTool(
  'connect_bones',
  {
    title: 'Connect bones',
    description:
      'Connects two groups at their nearest free tail/head endpoints. The second group moves to align; optional pair fields let you choose the exact roots and bone endpoints.',
    inputSchema: {
      ids: z.array(z.string()).length(2),
      options: z
        .object({
          pair: z.object({
            anchorRoot: z.string(),
            movingRoot: z.string(),
            anchorBoneId: z.string(),
            movingBoneId: z.string(),
          }),
          alignedRoot: z.string().optional(),
          alignRotation: z.boolean().optional(),
        })
        .optional(),
    },
    annotations: edit,
  },
  (args) => run('connectBones', args),
);

server.registerTool(
  'add_bone_socket',
  {
    title: 'Add bone socket',
    description:
      'Adds a join socket to artwork at a canvas position. Add a second socket to define its bone segment, then connect it to another rig with connect_bones.',
    inputSchema: { shapeId: z.string(), point },
    annotations: edit,
  },
  (args) => run('addBoneSocket', args),
);

server.registerTool(
  'remove_bone_sockets',
  {
    title: 'Remove bone sockets',
    description: 'Removes an unconnected socket wrapper and preserves its artwork placement.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('removeBoneSockets', args),
);

server.registerTool(
  'disconnect_joint',
  {
    title: 'Disconnect joint',
    description: 'Disconnects a joint while preserving the moving artwork’s current pose.',
    inputSchema: { id: z.string().describe('joint assembly group ID') },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('disconnectJoint', args),
);

server.registerTool(
  'attach_bone_artwork',
  {
    title: 'Attach artwork to bone',
    description: 'Attaches a shape or group to a bone while preserving its current placement.',
    inputSchema: { boneId: z.string(), sourceId: z.string() },
    annotations: edit,
  },
  (args) => run('attachBoneArtwork', args),
);

server.registerTool(
  'detach_bone_artwork',
  {
    title: 'Detach artwork from bone',
    description: 'Detaches all artwork from a bone and preserves each item’s current placement.',
    inputSchema: { boneId: z.string() },
    annotations: edit,
  },
  (args) => run('detachBoneArtwork', args),
);

server.registerTool(
  'update_joint',
  {
    title: 'Update joint',
    description:
      'Changes a joint’s angle or min/max limits in degrees. On a chain’s terminal joint, ik can set enabled, bend direction, influence or target [x, y].',
    inputSchema: {
      id: z.string(),
      angle: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      ik: z
        .object({
          enabled: z.boolean().optional(),
          bend: z.number().optional(),
          influence: z.number().min(0).max(1).optional(),
          target: point.optional(),
        })
        .optional(),
    },
    annotations: edit,
  },
  (args) => run('updateJoint', args),
);

server.registerTool(
  'set_camera',
  {
    title: 'Set camera',
    description:
      'Sets the camera start frame position and width, independently of the canvas, optionally shows or hides it in Layers, sets a follow target, and sets what the editor canvas shows (viewMode: "viewport", the default, shows only what the camera sees; "full" the whole drawing area; fullscreen and exports always use the camera). Camera height follows the output aspect ratio; use update_cutscene to animate camera moves. follow moves the camera along with a shape or group by however far it travels from its starting position (camera clips still add their own pan and zoom); null stops following. Returns the frame, follow target and camera group.',
    inputSchema: {
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().min(40).optional(),
      visible: z.boolean().optional().describe('show the implicit camera in Layers'),
      viewMode: z
        .enum(['full', 'viewport'])
        .optional()
        .describe('editor canvas: only the camera view (viewport) or the whole drawing area (full)'),
      follow: z
        .string()
        .nullable()
        .optional()
        .describe('shape or group id for the camera to follow; null stops following'),
    },
    annotations: edit,
  },
  (args) => run('setCamera', args),
);

// ---------- audio timelines

server.registerTool(
  'get_audio',
  {
    title: 'Get audio timelines',
    description: 'Lists this page’s audio timelines, clips and duration.',
    annotations: readOnly,
  },
  () => run('getAudio'),
);

server.registerTool(
  'add_audio_timeline',
  {
    title: 'Add audio timeline',
    description: 'Adds an audio row to the current page.',
    inputSchema: { name: z.string().optional() },
    annotations: edit,
  },
  (args) => run('addAudioTimeline', args),
);

server.registerTool(
  'update_audio_timeline',
  {
    title: 'Update audio timeline',
    description: 'Renames or mutes an audio row.',
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      muted: z.boolean().optional(),
    },
    annotations: edit,
  },
  (args) => run('updateAudioTimeline', args),
);

server.registerTool(
  'delete_audio_timeline',
  {
    title: 'Delete audio timeline',
    description: 'Deletes an audio row. Set deleteClips to true to remove its clips too.',
    inputSchema: { id: z.string(), deleteClips: z.boolean().optional() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteAudioTimeline', args),
);

server.registerTool(
  'add_audio_clip',
  {
    title: 'Add audio clip',
    description:
      'Adds speech narration or a sound file. File audio accepts a source URL or audio data URL; speech is synthesized by the browser during playback.',
    inputSchema: {
      timelineId: z.string().optional(),
      kind: z.enum(['speech', 'file']).optional(),
      name: z.string().optional(),
      start: z.number().min(0).optional(),
      duration: z.number().positive().optional(),
      source: z.string().optional(),
      sourceDataUrl: z.string().startsWith('data:audio/').max(70000000).optional(),
      sourceName: z.string().optional(),
      text: z.string().optional(),
      voiceURI: z.string().optional(),
      lang: z.string().optional(),
      rate: z.number().positive().optional(),
      pitch: z.number().positive().optional(),
      volume: z.number().min(0).max(1).optional(),
      muted: z.boolean().optional(),
    },
    annotations: edit,
  },
  (args) => run('addAudioClip', args),
);

server.registerTool(
  'update_audio_clip',
  {
    title: 'Update audio clip',
    description: 'Changes timing, narration, voice settings, volume, mute or source on an audio clip.',
    inputSchema: {
      id: z.string(),
      patch: z.object({
        name: z.string().optional(),
        start: z.number().min(0).optional(),
        duration: z.number().positive().optional(),
        source: z.string().optional(),
        sourceStart: z.number().min(0).optional(),
        sourceEnd: z.number().positive().optional(),
        text: z.string().optional(),
        voiceURI: z.string().optional(),
        lang: z.string().optional(),
        rate: z.number().positive().optional(),
        pitch: z.number().positive().optional(),
        volume: z.number().min(0).max(1).optional(),
        muted: z.boolean().optional(),
      }),
    },
    annotations: edit,
  },
  (args) => run('updateAudioClip', args),
);

server.registerTool(
  'delete_audio_clip',
  {
    title: 'Delete audio clip',
    description: 'Removes an audio clip from the page.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteAudioClip', args),
);

server.registerTool(
  'set_audio_duration',
  {
    title: 'Set audio duration',
    description: 'Sets the page’s explicit total audio duration; omit duration to clear the override.',
    inputSchema: { duration: z.number().min(0).optional() },
    annotations: edit,
  },
  (args) => run('setAudioDuration', args),
);

server.registerTool(
  'add_gradient',
  {
    title: 'Add gradient',
    description:
      'Adds a gradient to the document. Returns its id and the `fill` value ("url(#id)") to use as a shape\'s fill or stroke.',
    inputSchema: {
      type: z.enum(['linear', 'radial']),
      stops: z
        .array(
          z.object({
            stopColor: z.string(),
            offset: z.number().min(0).max(100).describe('percent'),
            stopOpacity: z.number().min(0).max(1).default(1),
          }),
        )
        .min(2),
      rotate: z.number().optional().describe('degrees; 0 runs left to right'),
      spreadMethod: z.enum(['pad', 'reflect', 'repeat']).optional(),
      cx: z.number().optional().describe('radial: center x, percent'),
      cy: z.number().optional().describe('radial: center y, percent'),
      fx: z.number().optional().describe('radial: focus x, percent'),
      fy: z.number().optional().describe('radial: focus y, percent'),
    },
    annotations: edit,
  },
  (args) => run('addGradient', args),
);

server.registerTool(
  'update_gradient',
  {
    title: 'Update gradient',
    description:
      'Changes a gradient; every shape using it updates. Only the given keys change; `stops` replaces all stops.',
    inputSchema: {
      id: z.string(),
      type: z.enum(['linear', 'radial']).optional(),
      stops: z
        .array(
          z.object({
            stopColor: z.string(),
            offset: z.number().min(0).max(100).describe('percent'),
            stopOpacity: z.number().min(0).max(1).default(1),
          }),
        )
        .min(2)
        .optional(),
      rotate: z.number().optional(),
      spreadMethod: z.enum(['pad', 'reflect', 'repeat']).optional(),
      cx: z.number().optional(),
      cy: z.number().optional(),
      fx: z.number().optional(),
      fy: z.number().optional(),
    },
    annotations: edit,
  },
  (args) => run('updateGradient', args),
);

server.registerTool(
  'remove_gradient',
  {
    title: 'Remove gradient',
    description:
      'Removes a gradient from the document. Change the fill of shapes that use it first.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('removeGradient', args),
);

// ---------- canvas and pages

server.registerTool(
  'set_canvas',
  {
    title: 'Set canvas',
    description:
      'Sets the page background and output size. A canvas with an aspect ratio has a fixed resolution (1:1 = 1080×1080, 3:4 = 1080×1440, 4:3 = 1440×1080, 9:16 = 1080×1920, 16:9 = 1920×1080); "fill" makes it fill the editor. canvasArea adjusts the drawable area independently of the camera. get_document reports the pixel size.',
    inputSchema: {
      aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9', 'fill']).optional(),
      backgroundColor: z.string().optional(),
      width: z.number().positive().optional().describe('percent'),
      height: z.number().positive().optional().describe('percent'),
      canvasArea: z
        .discriminatedUnion('mode', [
          z.object({ mode: z.literal('auto') }),
          z.object({
            mode: z.literal('custom'),
            x: z.number(),
            y: z.number(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          }),
        ])
        .optional()
        .describe('drawable canvas bounds in pixels, separate from the camera frame'),
    },
    annotations: edit,
  },
  (args) => run('setCanvas', args),
);

server.registerTool(
  'add_page',
  {
    title: 'Add page',
    description:
      "Adds an empty page at the end and switches to it. Pages play one after another, like slides (the toolbar's Play runs page 1's animation, then page 2's, and so on), so a new topic or scene belongs on a new page.",
    annotations: edit,
  },
  () => run('addPage'),
);

server.registerTool(
  'remove_page',
  {
    title: 'Remove page',
    description:
      'Deletes a page (numbered from 0) with everything on it. A document keeps at least one page.',
    inputSchema: { index: z.number().int().min(0) },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('removePage', args),
);

server.registerTool(
  'set_active_page',
  {
    title: 'Switch page',
    description: 'Switches to another page (numbered from 0).',
    inputSchema: { index: z.number().int().min(0) },
    annotations: edit,
  },
  (args) => run('setActivePage', args),
);

// ---------- output

server.registerTool(
  'export_svg',
  {
    title: 'Export SVG',
    description: 'The current page as standalone SVG markup, without editor overlays.',
    annotations: readOnly,
  },
  () => run('exportSvg'),
);

server.registerTool(
  'export_animated_svg',
  {
    title: 'Export animated SVG',
    description:
      'Returns a standalone animated SVG for the current page, including its timeline, particles and generated copies.',
    annotations: readOnly,
  },
  () => run('exportAnimatedSvg'),
);

server.registerTool(
  'export_mp4',
  {
    title: 'Export MP4 video',
    description:
      'Renders the current page playback range as an MP4 video and returns it as a binary file resource. Requires browser H.264/WebCodecs support.',
    annotations: readOnly,
  },
  async () => {
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
);

server.registerTool(
  'screenshot',
  {
    title: 'Screenshot',
    description:
      'A PNG of the current page, to check how it looks. With `time`, shows the animation at that moment instead of the cutscene being edited.',
    inputSchema: {
      scale: z.number().min(0.1).max(2).optional().describe('default 1'),
      time: z.number().min(0).optional().describe('seconds into the animation'),
    },
    annotations: readOnly,
  },
  async (args) => {
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
);

// ---------- animation

server.registerTool(
  'get_timelines',
  {
    title: 'Get timelines',
    description:
      "The page's timelines and their cutscenes (times in seconds), with which shapes each cutscene adds, changes, and removes, and the cutscene open for editing.",
    annotations: readOnly,
  },
  () => run('getTimelines'),
);

server.registerTool(
  'add_timeline',
  {
    title: 'Add timeline',
    description:
      'Creates or opens a timeline for shapeId (a group or sprite is one object). An object can have several timelines, separate animations that play together (e.g. one moves it, one spins it): pass newTimeline true to add another instead of opening its first. Each timeline controls the properties it animates; where two animate the same one, the lower timeline wins. Omit shapeId for an unassigned row, then bind it with update_timeline. New timelines contain no clips.',
    inputSchema: {
      name: z.string().optional(),
      shapeId: z.string().optional(),
      newTimeline: z
        .boolean()
        .optional()
        .describe('add another, separate timeline even if the shape already has one'),
    },
    annotations: edit,
  },
  (args) => run('addTimeline', args),
);
server.registerTool(
  'update_timeline',
  {
    title: 'Update timeline',
    description:
      'Changes the name or mute state, or assigns shapeId to an unassigned timeline. An assigned shape cannot be replaced. A shape may have several timelines; mute one to turn its animation off.',
    inputSchema: {
      timelineId: z.string(),
      shapeId: z.string().optional(),
      name: z.string().optional(),
      muted: z.boolean().optional(),
    },
    annotations: edit,
  },
  (args) => run('updateTimeline', args),
);

server.registerTool(
  'add_cutscene',
  {
    title: 'Add cutscene',
    description:
      "Appends a cutscene after the last one in a timeline and opens it for editing. Shape edits made next become this cutscene's animation.",
    inputSchema: {
      timelineId: z.string().optional().describe('default: the timeline being edited'),
      name: z.string().optional(),
      duration: z.number().positive().optional().describe('seconds, default 1'),
      ease: ease.optional(),
    },
    annotations: edit,
  },
  (args) => run('addCutscene', args),
);

server.registerTool(
  'open_cutscene',
  {
    title: 'Open cutscene',
    description:
      'Loads a cutscene onto the canvas (the scene as it is when the cutscene ends) so later shape edits go into it.',
    inputSchema: { timelineId: z.string(), cutsceneId: z.string() },
    annotations: edit,
  },
  (args) => run('openCutscene', args),
);

server.registerTool(
  'update_cutscene',
  {
    title: 'Update cutscene',
    description:
      "Renames or retimes a cutscene, or changes how it plays: easing, direction (reverse plays it backwards), repeats and repeat delay; viewBox pans and zooms the canvas (a camera) during the cutscene. Repeats stop at the next cutscene of the timeline; loop 'inherit' plays each one like the cutscene, 'alternate' back and forth, 'continue' keeps going (movement and rotation add up: use it for cycles like flying, walking, spinning). Cutscenes in the same timeline cannot overlap.",
    inputSchema: {
      timelineId: z.string(),
      cutsceneId: z.string(),
      name: z.string().optional(),
      start: z.number().min(0).optional().describe('seconds'),
      end: z.number().positive().optional().describe('seconds'),
      ease: ease.optional(),
      direction: z.enum(['forward', 'reverse']).optional(),
      repeat: z
        .union([z.number().int().min(0).max(99), z.literal('infinite')])
        .optional()
        .describe(
          'extra plays after the cutscene; "infinite" repeats until the next cutscene or the end of the animation',
        ),
      repeatDelay: z
        .number()
        .min(0)
        .optional()
        .describe('seconds to pause after each play before repeating'),
      loop: z
        .enum(['alternate', 'inherit', 'continue'])
        .optional()
        .describe(
          'how repeats play: inherit = each like the cutscene (default), alternate = back and forth, continue = keep going: movement and rotation add up each time while the rest goes back and forth (e.g. one flap that moves a bird 68px, repeated, flies it across the scene)',
        ),
      viewBox: z
        .union([
          z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]),
          z.null(),
        ])
        .optional()
        .describe(
          '[x, y, width, height] in canvas pixels: the part of the canvas shown once the clip ends; it pans/zooms there during the clip, with its easing. Keep the canvas aspect ratio to avoid bars. null removes it. Needs a fixed-size canvas.',
        ),
    },
    annotations: edit,
  },
  (args) => run('updateCutscene', args),
);

server.registerTool(
  'rename_timeline',
  {
    title: 'Rename timeline',
    description: 'Renames a timeline.',
    inputSchema: { timelineId: z.string(), name: z.string().min(1) },
    annotations: edit,
  },
  (args) => run('renameTimeline', args),
);

server.registerTool(
  'delete_timeline',
  {
    title: 'Delete timeline',
    description:
      'Deletes a timeline and its clips, keeping the page artwork. A page may have no timelines.',
    inputSchema: { timelineId: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteTimeline', args),
);

server.registerTool(
  'delete_cutscene',
  {
    title: 'Delete cutscene',
    description:
      'Deletes a clip and the changes it makes. Legacy imported starting clips remain protected; delete their timeline instead.',
    inputSchema: { timelineId: z.string(), cutsceneId: z.string() },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('deleteCutscene', args),
);

server.registerTool(
  'set_loop',
  {
    title: 'Set loop',
    description: "Whether the page's animation plays in a loop.",
    inputSchema: { loop: z.boolean() },
    annotations: edit,
  },
  (args) => run('setLoop', args),
);

server.registerTool(
  'set_play_range',
  {
    title: 'Set playback range',
    description:
      'Sets where the current page animation starts and ends. Pass null to restore the default for either endpoint.',
    inputSchema: {
      start: z.number().min(0).nullable().optional().describe('seconds'),
      end: z.number().positive().nullable().optional().describe('seconds'),
    },
    annotations: edit,
  },
  (args) => run('setPlayRange', args),
);

server.registerTool(
  'set_helpers',
  {
    title: 'Show editor guides',
    description:
      'Shows or hides the grid, pointer guides and shape helpers in the open editor tab.',
    inputSchema: {
      grid: z.boolean().optional(),
      pointer: z.boolean().optional(),
      shapes: z.boolean().optional(),
    },
    annotations: edit,
  },
  (args) => run('setHelpers', args),
);

server.registerTool(
  'play_animation',
  {
    title: 'Preview animation',
    description:
      'Plays the current page repeatedly or cycles through every document page until stopped.',
    inputSchema: { mode: z.enum(['current', 'all']).optional().describe('default current page') },
    annotations: edit,
  },
  (args) => run('playAnimation', args),
);

server.registerTool(
  'stop_animation',
  {
    title: 'Stop animation preview',
    description: 'Stops the active animation preview and returns the playback state.',
    annotations: edit,
  },
  () => run('stopAnimation'),
);

server.registerTool(
  'set_transition',
  {
    title: 'Set transition',
    description:
      'Picks how a shape enters (if it was added in the open cutscene) or exits (if it was deleted in it). The default is fade.',
    inputSchema: { shapeId: z.string(), kind: z.enum(['enter', 'exit']), transition },
    annotations: edit,
  },
  (args) => run('setTransition', args),
);

const batchAdd = z.object({
  type: shapeType,
  x: z.number().optional(),
  y: z.number().optional(),
  points: z.array(point).optional(),
  src: z.string().optional(),
  properties: properties.optional(),
  style: style.optional(),
});
const batchRef = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .optional();
server.registerTool(
  'batch_edit',
  {
    title: 'Batch edit artwork',
    description:
      'Apply 1–50 ordered edits in one round trip. Prefer coherent passes of 10–30 edits. Each add/group can name its returned ID with ref; later id/ids use "$ref". References exist only in this batch; the result returns actual IDs for later calls. On failure, completed work remains: retry only unfinished edits. Build a rough composition, inspect it, then batch refinements.',
    inputSchema: {
      operations: z
        .array(
          z.union([
            z.object({ tool: z.literal('add_shape'), args: batchAdd, ref: batchRef }),
            z.object({
              tool: z.literal('update_shape'),
              args: z.object({
                id: z.string(),
                properties: properties.optional(),
                style: style.optional(),
              }),
              ref: batchRef,
            }),
            z.object({
              tool: z.literal('group_shapes'),
              args: z.object({ ids: z.array(z.string()).min(1), name: z.string().optional() }),
              ref: batchRef,
            }),
            z.object({
              tool: z.literal('delete_shapes'),
              args: z.object({ ids: z.array(z.string()).min(1) }),
              ref: batchRef,
            }),
          ]),
        )
        .min(1)
        .max(50),
    },
    annotations: { ...edit, destructiveHint: true },
  },
  (args) => run('batchEdit', args),
);

const spriteSize = z.number().positive().max(8192);
const tileSize = z.number().min(4).max(2000);
const controlValue = z.union([z.string(), z.number().finite(), z.boolean()]);
const control = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(['number', 'text', 'boolean']),
  defaultValue: controlValue,
  targetShapeId: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
});
const features = [
  [
    'place_project_file',
    'Place project image',
    'Place an imported SVG, PNG or other image file onto the current scene or sprite canvas.',
    'placeProjectFile',
    {
      fileId: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    },
  ],
  [
    'bring_to_front',
    'Bring to front',
    'Bring selected IDs to the front. temporary=true lifts them only while editing; selecting another shape restores the normal order.',
    'bringToFront',
    { ids: z.array(z.string()).min(1), temporary: z.boolean().optional() },
  ],
  [
    'update_sprite_page',
    'Rename sprite animation',
    'Rename a sprite animation page without changing its identity or existing scene references.',
    'updateSpritePage',
    { sheetId: z.string(), pageId: z.string(), name: z.string().min(1) },
  ],
  [
    'list_sprites',
    'List project sprites',
    'Project-wide sprite assets, animations and controls. Open an animation with set_editor to draw it with normal shape and timeline tools.',
    'listSprites',
    {
      includeDocuments: z
        .boolean()
        .optional()
        .describe('Return full editable animation documents only when needed; false by default.'),
    },
    true,
  ],
  [
    'create_sprite_sheet',
    'Create sprite sheet',
    'Create an editable vector sprite in the project. No imported image is required.',
    'createSpriteSheet',
    {
      name: z.string().min(1),
      width: spriteSize.optional(),
      height: spriteSize.optional(),
      folder: z.string().optional(),
    },
  ],
  [
    'update_sprite_sheet',
    'Update sprite sheet',
    'Rename, move into a project folder, or set sprite dimensions across all its animation pages.',
    'updateSpriteSheet',
    {
      sheetId: z.string(),
      name: z.string().min(1).optional(),
      width: spriteSize.optional(),
      height: spriteSize.optional(),
      folder: z.string().optional(),
    },
  ],
  [
    'add_sprite_page',
    'Add sprite animation',
    'One sprite page is one animation, with the full drawing tools and timelines.',
    'addSpritePage',
    { sheetId: z.string(), name: z.string().optional() },
  ],
  [
    'set_sprite_controls',
    'Set sprite controls',
    'Replace animation controls. Keep existing IDs to preserve instance overrides. Number controls rotate a target shape; text controls replace text; boolean controls toggle visibility. Get shape IDs by editing the sprite page.',
    'setSpriteControls',
    { sheetId: z.string(), pageId: z.string(), controls: z.array(control).max(100) },
  ],
  [
    'list_patterns',
    'List patterns',
    'Project-wide repeating tiles. Each has a `fill` reference (url(#id)) to use as any shape\'s style.fill or style.stroke, in every scene and sprite.',
    'listPatterns',
    {
      includeDocuments: z
        .boolean()
        .optional()
        .describe('Return each tile\'s editable document only when needed; false by default.'),
    },
    true,
  ],
  [
    'create_pattern',
    'Create pattern',
    'Create an empty repeating tile (polka dots, stripes, checks, scales, prints). Then open it with set_editor(view: "pattern", patternId) and draw the tile between (0, 0) and (width, height) with the normal shape tools; artwork crossing an edge should continue on the opposite edge. Returns its id and `fill` reference.',
    'createPattern',
    {
      name: z.string().min(1),
      width: tileSize.optional().describe('tile width in px, default 40'),
      height: tileSize.optional().describe('tile height in px, default 40'),
      scale: z.number().positive().max(20).optional().describe('how big the tile is drawn where used; 1 = its own size'),
      rotate: z.number().optional().describe('turns the whole tiling, degrees (45 makes diagonal stripes)'),
      background: z.string().optional().describe('tile background colour; transparent by default'),
    },
  ],
  [
    'update_pattern',
    'Update pattern',
    'Rename a pattern or change its tile size, scale, rotation or background. Every shape using it updates.',
    'updatePattern',
    {
      patternId: z.string(),
      name: z.string().min(1).optional(),
      width: tileSize.optional(),
      height: tileSize.optional(),
      scale: z.number().positive().max(20).optional(),
      rotate: z.number().optional(),
      background: z.string().optional(),
    },
  ],
  [
    'delete_pattern',
    'Delete pattern',
    'Delete a pattern. Shapes still using its fill reference lose that fill, so change them first.',
    'deletePattern',
    { patternId: z.string() },
  ],
  [
    'set_editor',
    'Switch editor',
    'Open the scene editor, a specific sprite animation, a pattern\'s tile, or the Filter or Particle Editor (code for project presets, shown in place of the canvas). Subsequent drawing, batch and timeline tools act on this visible editor.',
    'setEditor',
    {
      view: z.enum(['scene', 'spritesheet', 'pattern', 'filters', 'particles']),
      sheetId: z.string().optional(),
      pageId: z.string().optional(),
      patternId: z.string().optional().describe('pattern: the tile to draw'),
      presetId: z
        .string()
        .optional()
        .describe('filters/particles: the project preset to open in the Filter or Particle Editor'),
    },
  ],
  [
    'place_sprite',
    'Place animated sprite',
    'Reference a project sprite on the canvas and automatically create its animation clip in the current timeline. Works in scenes and other sprites; rejects direct and indirect self-inclusion. Returns shape and owning clip IDs.',
    'placeSprite',
    {
      sheetId: z.string(),
      pageId: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    },
  ],
  [
    'update_sprite_instance',
    'Update sprite controls on canvas',
    'Change only this instance’s control values, keyed by control IDs. Original sprite artwork stays editable in its source.',
    'updateSpriteInstance',
    { id: z.string(), variables: z.record(z.string(), controlValue) },
  ],
  [
    'trim_sprite_clip',
    'Trim sprite animation',
    'Open the owning clip first. Set the source animation start/end in seconds; its timeline clip length follows automatically and later clips shift to keep their gaps.',
    'trimSpriteClip',
    {
      timelineId: z.string(),
      cutsceneId: z.string(),
      shapeId: z.string(),
      start: z.number().min(0),
      end: z.number().positive(),
    },
  ],
  [
    'list_project_files',
    'List project files',
    'The whole project Filesystem: folders, imported files (metadata only), sprites, and filter and particle presets, each with its folder.',
    'listProjectFiles',
    {},
    true,
  ],
  [
    'rename_project_folder',
    'Rename project folder',
    'Renames a Filesystem folder; everything inside it (sub-folders, sprites, files, filter and particle presets) moves along.',
    'renameProjectFolder',
    { path: z.string().min(1).describe('the folder, e.g. "Effects/Glows"'), name: z.string().min(1).describe('its new name (no /)') },
  ],
  [
    'update_project_file',
    'Rename or move a project file',
    'Renames an imported project file or moves it to another Filesystem folder ("" = top level).',
    'updateProjectFile',
    { fileId: z.string(), name: z.string().min(1).optional(), folder: z.string().optional() },
  ],
  [
    'create_project_folder',
    'Create project folder',
    'Create a project folder; use / for nested folders. Sprite sheets can be moved there with update_sprite_sheet.',
    'createProjectFolder',
    { path: z.string().min(1) },
  ],
  [
    'add_project_file',
    'Add project file',
    'Store an SVG, PNG or other file in the project filesystem from a data URL. Sprite sheets are drawn with vector tools; this imports ordinary files.',
    'addProjectFile',
    {
      name: z.string().min(1),
      dataUrl: z.string().startsWith('data:').max(28000000),
      folder: z.string().optional(),
    },
  ],
];
for (const [name, title, description, method, inputSchema, readOnly] of features) {
  server.registerTool(
    name,
    { title, description, inputSchema, annotations: readOnly ? { readOnlyHint: true } : edit },
    (args) => run(method, args),
  );
}

await bridge.start();
await server.connect(new StdioServerTransport());

const shutdown = () => {
  bridge.close();
  process.exit(0);
};
process.stdin.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
