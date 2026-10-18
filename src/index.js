#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EditorBridge } from './bridge.js';

const PORT = Number(process.env.SVG_EDITOR_BRIDGE_PORT || 7341);
const ALLOWED_ORIGINS = (process.env.SVG_EDITOR_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);

// stdout carries the MCP protocol, so logs go to stderr
const log = (msg) => process.stderr.write(`[svgtool-mcp] ${msg}\n`);

const bridge = new EditorBridge({ port: PORT, allowedOrigins: ALLOWED_ORIGINS, log });

const server = new McpServer(
    { name: 'svgtool', version: '0.1.0' },
    {
        instructions: [
            'Drives a running React Svg Editor tab: draw and edit shapes, manage pages, animate with timelines and cutscenes, and export SVG/PNG.',
            'The editor must be open in a browser (npm start, then http://localhost:3000); call editor_status if a tool says no editor is connected.',
            'Coordinates are canvas pixels with the origin at the top-left; get_document reports the canvas pixel size.',
            'Animation: each timeline is a row of cutscenes. Shape edits are recorded into the cutscene that is open on the canvas, as changes from the previous cutscene; during the cutscene the shapes animate from the previous state to the new one.',
            'So to animate: build the starting scene in the default "Start" cutscene, call add_cutscene, then move/restyle/add/delete shapes; repeat. Use screenshot with `time` to check a moment of the animation.',
            'Group as much as possible: as soon as you finish drawing an object made of several shapes (a tree from trunk and leaves, a cloud from puffs, a car from body and wheels), call group_shapes on its parts with a descriptive name ("Tree 1", "Car"). Group related objects again into bigger groups where it helps ("Forest", "Sky"). Groups keep the layers panel tidy and let one move, scale or fade animate the whole object.',
            'Group while building the scene: draw and group an object in the cutscene where it first appears (usually "Start"), in the timeline that will animate it, then animate the group rather than its parts. Only shapes in the same timeline can be grouped.',
            'Pages play one after another, like slides: the toolbar\'s Play runs page 1\'s animation, then page 2\'s, and so on. So when the story moves on to a new topic or scene, continue on a new page (add_page) instead of crowding one page; set_active_page goes back to an earlier one.',
            'Effects with many similar shapes: give one shape `properties.particles` (fireworks, sparks, snow, confetti, embers) or `properties.modifiers` with an array modifier (rows, rings or scatters of copies: fence posts, petals, stars) instead of drawing every shape. They follow the shape\'s edits and animation and show in screenshots and exports.',
            'Edits are not persisted until save_document is called.',
        ].join('\n'),
    },
);

/** Forwards a tool call to the editor tab and returns its JSON answer as text. */
async function run(method, params = {}) {
    try {
        const result = await bridge.call(method, params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
}

const point = z.tuple([z.number(), z.number()]);
const shapeType = z.enum(['circle', 'rectangle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image']);
const transition = z.enum(['none', 'fade', 'zoom', 'slideLeft', 'slideRight', 'slideUp', 'slideDown']);
const ease = z.string().describe('GSAP ease, e.g. "none" (linear), "power1.inOut" (smooth), "power2.in", "power2.out", "back.out(1.7)", "elastic.out(1, 0.4)", "bounce.out"');

const arrayModifier = z.object({
    id: z.string().optional().describe('any unique id'),
    type: z.literal('array'),
    enabled: z.boolean().default(true),
    mode: z.enum(['linear', 'radial', 'random']).describe('linear: a row of copies; radial: a ring of copies around the shape; random: copies scattered over an area'),
    count: z.number().int().min(0).max(200).describe('copies besides the shape itself'),
    stack: z.enum(['horizontal', 'vertical']).optional().describe('linear: copies placed side by side (horizontal, default) or one under another, each against the last'),
    offset: z.array(z.number()).length(2).optional().describe('linear: [x, y] px. Along the stack it is the gap between copies (0 = touching, the default); across it, how far each copy steps aside'),
    delay: z.number().min(0).optional().describe('linear: seconds each copy plays the shape\'s animation behind the one before (0 = all in step, the default); makes waves, marching rows and staggered entrances'),
    radius: z.number().optional().describe('radial: ring radius'),
    sweep: z.number().optional().describe('radial: degrees round the ring, default 360'),
    rotateCopies: z.boolean().optional().describe('radial: turn copies to face outwards'),
    spanWidth: z.number().optional().describe('random: width of the area, centred on the shape'),
    spanHeight: z.number().optional().describe('random: height of the area'),
    seed: z.number().optional().describe('random: change to reshuffle'),
    hideSource: z.boolean().optional().describe('show only the copies, not the shape itself'),
    copyParticles: z.boolean().optional().describe('copies give off the shape\'s particles too (default true)'),
    hideSourceParticles: z.boolean().optional().describe('only the copies give off particles, not the shape itself'),
});

const particles = z.object({
    enabled: z.boolean().default(true),
    type: z.enum(['emit', 'fall', 'up', 'random']).describe('emit: burst out in every direction (fireworks); fall: drift down (snow, confetti); up: rise (embers, bubbles); random: wander (sparkles)'),
    count: z.number().int().min(1).max(600).describe('particles per wave'),
    ttl: z.number().positive().describe('seconds each particle lives'),
    speed: z.number().min(0).describe('px per second on average'),
    velocity: z.enum(['constant', 'slow-down', 'speed-up']).default('slow-down'),
    opacity: z.enum(['constant', 'fade-out', 'fade-in-out', 'flicker']).default('fade-out'),
    colorStart: z.string().describe('colour when born'),
    colorEnd: z.string().describe('colour when it dies (blended in between)'),
    source: z.enum(['circle', 'star', 'self', 'image']).default('circle').describe('what a particle looks like; self = a copy of the shape'),
    image: z.string().optional().describe('image URL or data: URL when source is image'),
    size: z.number().positive().describe('particle radius in px; for self, scale of the copies (1 = same size)'),
    spread: z.number().min(0).default(0).describe('seconds over which a wave is let out (0 = all at once, a burst)'),
    spanWidth: z.number().min(0).default(0).describe('fall/up/random: width of the area particles start from'),
    spanHeight: z.number().min(0).default(0),
    gravity: z.number().default(0).describe('px/s² pulling down (fireworks droop ~40)'),
    loop: z.boolean().default(false).describe('keep emitting: a new wave every `spread` seconds (or every `ttl` for bursts)'),
    seed: z.number().default(1),
    hideSource: z.boolean().optional().describe('show only the particles, not the shape giving them off (e.g. a small emitter dot)'),
});

const properties = z.object({
    name: z.string().optional().describe('label shown in the editor'),
    x: z.number().optional().describe('circle/ellipse: center x; rectangle/image: left; text: start of the baseline'),
    y: z.number().optional().describe('circle/ellipse: center y; rectangle/image: top; text: baseline'),
    radius: z.number().optional().describe('circle'),
    radiusX: z.number().optional().describe('ellipse'),
    radiusY: z.number().optional().describe('ellipse'),
    width: z.number().optional().describe('rectangle, image'),
    height: z.number().optional().describe('rectangle, image'),
    rx: z.number().optional().describe('rectangle corner radius (ry follows it unless given)'),
    ry: z.number().optional().describe('rectangle vertical corner radius'),
    points: z.array(point).optional().describe('line (2 points), polyline, polygon, path. A path draws a cubic Bézier: the first point is the start and the rest are read in threes (control 1, control 2, end), so give 1 + 3n points'),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.number().optional().describe('100–900'),
    fontStyle: z.enum(['normal', 'italic', 'oblique']).optional(),
    fontFamily: z.string().optional().describe('e.g. "Arial", "Helvetica", "Georgia", "Futura"'),
    genericFontFamily: z.enum(['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace']).optional(),
    modifiers: z.array(arrayModifier).optional().describe('copies of the shape worked out live (they follow its edits and animation): use instead of drawing repeated shapes; replaces the whole list'),
    particles: particles.optional().describe('particles given off by the shape from when it appears: use for fireworks, sparks, snow, confetti, embers instead of drawing many shapes'),
    base64Url: z.string().optional().describe('image source: a data: URL (http URLs show in the editor but not in screenshots)'),
}).describe('Geometry and content; which keys apply depends on the shape type');

const style = z.object({
    fill: z.string().optional().describe('CSS color, "transparent", or a gradient reference "url(#id)" from add_gradient'),
    fillOpacity: z.number().min(0).max(1).optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    strokeOpacity: z.number().min(0).max(1).optional(),
    strokeDasharray: z.array(z.number()).optional(),
    strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
    strokeLinejoin: z.enum(['bevel', 'miter', 'round']).optional(),
    opacity: z.number().min(0).max(1).optional().describe('whole-shape opacity'),
    translate: point.optional().describe('[dx, dy] offset applied on top of the geometry; this is what dragging a shape changes'),
    rotate: z.number().optional().describe('degrees, around the shape center'),
    scale: point.optional().describe('[sx, sy], around the shape center'),
    skewX: z.number().optional(),
    skewY: z.number().optional(),
    cssFilters: z.object({
        blur: z.number().optional().describe('px'),
        brightness: z.number().optional().describe('percent, 100 = unchanged'),
        contrast: z.number().optional().describe('percent'),
        grayscale: z.number().optional().describe('percent'),
        hueRotate: z.number().optional().describe('degrees'),
        invert: z.number().optional().describe('percent'),
        opacity: z.number().optional().describe('percent'),
        saturate: z.number().optional().describe('percent'),
        sepia: z.number().optional().describe('percent'),
        dropShadow: z.array(z.object({ xOffset: z.number(), yOffset: z.number(), blur: z.number(), color: z.string() })).optional(),
    }).optional().describe('replaces all CSS filters of the shape'),
}).describe('Paint and transform; only the keys given change');

const readOnly = { readOnlyHint: true, openWorldHint: false };
const edit = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

server.registerTool('editor_status', {
    title: 'Editor status',
    description: 'Whether an editor tab is connected, and which document and cutscene it has open.',
    annotations: readOnly,
}, async () => {
    const status = bridge.status();
    if (!status.connectedTabs) {
        return { content: [{ type: 'text', text: JSON.stringify({ ...status, hint: status.error ? undefined : 'Start the editor (npm start in the project root) and open http://localhost:3000 in a browser.' }, null, 2) }] };
    }
    try {
        return { content: [{ type: 'text', text: JSON.stringify({ ...status, editor: await bridge.call('status') }, null, 2) }] };
    } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
});

// ---------- documents

server.registerTool('list_documents', {
    title: 'List documents',
    description: 'Documents saved in this browser, plus the built-in examples.',
    annotations: readOnly,
}, () => run('listDocuments'));

server.registerTool('open_document', {
    title: 'Open document',
    description: 'Opens a saved document or example in the editor. Unsaved changes to the current document are lost.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('openDocument', args));

server.registerTool('new_document', {
    title: 'New document',
    description: 'Starts a new empty document, or loads one from JSON in the editor\'s export format ("Export as JSON"). Unsaved changes to the current document are lost.',
    inputSchema: { document: z.record(z.string(), z.any()).optional().describe('a document exported with "Export as JSON"') },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('newDocument', args));

server.registerTool('save_document', {
    title: 'Save document',
    description: 'Saves the document in the browser. With a name, saves a new copy under that name ("Save as"); without one, overwrites the document it was opened from.',
    inputSchema: { name: z.string().optional() },
    annotations: edit,
}, (args) => run('saveDocument', args));

server.registerTool('get_document', {
    title: 'Get document',
    description: 'The current page: canvas size and background, gradients, selection, the cutscene being edited, and every shape (style lists only values changed from the defaults). Shapes with render:false are children of a group.',
    inputSchema: { includeShapes: z.boolean().optional().describe('default true') },
    annotations: readOnly,
}, (args) => run('getDocument', args));

// ---------- shapes

server.registerTool('get_shape', {
    title: 'Get shape',
    description: 'Every property of one shape, including default style values.',
    inputSchema: { id: z.string() },
    annotations: readOnly,
}, (args) => run('getShape', args));

server.registerTool('add_shape', {
    title: 'Add shape',
    description: [
        'Draws a shape on the current page and selects it. New shapes default to a 1px black stroke and a transparent fill.',
        'circle/ellipse: x, y = center (defaults radius 40 / radiusX 80, radiusY 40). rectangle/image: x, y = top-left (defaults 60×60 / 200×200).',
        'text: x, y = baseline start. line/polyline/polygon/path: give `points`; x and y are ignored.',
    ].join(' '),
    inputSchema: {
        type: shapeType,
        x: z.number().optional(),
        y: z.number().optional(),
        points: z.array(point).optional().describe('for line, polyline, polygon, path'),
        src: z.string().optional().describe('image: a data: URL'),
        properties: properties.optional(),
        style: style.optional(),
    },
    annotations: edit,
}, (args) => run('addShape', args));

server.registerTool('update_shape', {
    title: 'Update shape',
    description: 'Changes a shape\'s geometry, text, or style. Only the given keys change; arrays (points, translate, scale) are replaced whole.',
    inputSchema: { id: z.string(), properties: properties.optional(), style: style.optional() },
    annotations: edit,
}, (args) => run('updateShape', args));

server.registerTool('delete_shapes', {
    title: 'Delete shapes',
    description: 'Deletes shapes (a group\'s children go with it). Inside a later cutscene, this makes them exit with an animation.',
    inputSchema: { ids: z.array(z.string()).min(1) },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('deleteShapes', args));

server.registerTool('duplicate_shapes', {
    title: 'Duplicate shapes',
    description: 'Copies top-level shapes (groups with their children), moved by `offset`, and selects the copies. Returns them.',
    inputSchema: { ids: z.array(z.string()).min(1), offset: point.optional().describe('[dx, dy], default [20, 20]') },
    annotations: edit,
}, (args) => run('duplicateShapes', args));

server.registerTool('select_shapes', {
    title: 'Select shapes',
    description: 'Selects shapes in the editor, so the user sees them highlighted. An empty list clears the selection.',
    inputSchema: { ids: z.array(z.string()) },
    annotations: edit,
}, (args) => run('selectShapes', args));

server.registerTool('group_shapes', {
    title: 'Group shapes',
    description: 'Groups top-level shapes so they move, transform and animate together, and shows them as one named item in the layers panel. Group as much as possible: every object made of several shapes (a tree, a cloud, a car and its wheels) should be one named group. Shapes must be in the same timeline. Returns the new group.',
    inputSchema: { ids: z.array(z.string()).min(1), name: z.string().optional() },
    annotations: edit,
}, (args) => run('groupShapes', args));

server.registerTool('add_gradient', {
    title: 'Add gradient',
    description: 'Adds a gradient to the document. Returns its id and the `fill` value ("url(#id)") to use as a shape\'s fill or stroke.',
    inputSchema: {
        type: z.enum(['linear', 'radial']),
        stops: z.array(z.object({
            stopColor: z.string(),
            offset: z.number().min(0).max(100).describe('percent'),
            stopOpacity: z.number().min(0).max(1).default(1),
        })).min(2),
        rotate: z.number().optional().describe('degrees; 0 runs left to right'),
        spreadMethod: z.enum(['pad', 'reflect', 'repeat']).optional(),
        cx: z.number().optional().describe('radial: center x, percent'),
        cy: z.number().optional().describe('radial: center y, percent'),
        fx: z.number().optional().describe('radial: focus x, percent'),
        fy: z.number().optional().describe('radial: focus y, percent'),
    },
    annotations: edit,
}, (args) => run('addGradient', args));

server.registerTool('update_gradient', {
    title: 'Update gradient',
    description: 'Changes a gradient; every shape using it updates. Only the given keys change; `stops` replaces all stops.',
    inputSchema: {
        id: z.string(),
        type: z.enum(['linear', 'radial']).optional(),
        stops: z.array(z.object({
            stopColor: z.string(),
            offset: z.number().min(0).max(100).describe('percent'),
            stopOpacity: z.number().min(0).max(1).default(1),
        })).min(2).optional(),
        rotate: z.number().optional(),
        spreadMethod: z.enum(['pad', 'reflect', 'repeat']).optional(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        fx: z.number().optional(),
        fy: z.number().optional(),
    },
    annotations: edit,
}, (args) => run('updateGradient', args));

server.registerTool('remove_gradient', {
    title: 'Remove gradient',
    description: 'Removes a gradient from the document. Change the fill of shapes that use it first.',
    inputSchema: { id: z.string() },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('removeGradient', args));

// ---------- canvas and pages

server.registerTool('set_canvas', {
    title: 'Set canvas',
    description: 'Sets the page background and shape. A canvas with an aspect ratio has a fixed resolution (1:1 = 1080×1080, 3:4 = 1080×1440, 4:3 = 1440×1080) that coordinates are in; "fill" makes it fill the editor, sized by width/height (percent of the drawing area). get_document reports the pixel size.',
    inputSchema: {
        aspectRatio: z.enum(['1:1', '3:4', '4:3', 'fill']).optional(),
        backgroundColor: z.string().optional(),
        width: z.number().positive().optional().describe('percent'),
        height: z.number().positive().optional().describe('percent'),
    },
    annotations: edit,
}, (args) => run('setCanvas', args));

server.registerTool('add_page', {
    title: 'Add page',
    description: 'Adds an empty page at the end and switches to it. Pages play one after another, like slides (the toolbar\'s Play runs page 1\'s animation, then page 2\'s, and so on), so a new topic or scene belongs on a new page.',
    annotations: edit,
}, () => run('addPage'));

server.registerTool('remove_page', {
    title: 'Remove page',
    description: 'Deletes a page (numbered from 0) with everything on it. A document keeps at least one page.',
    inputSchema: { index: z.number().int().min(0) },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('removePage', args));

server.registerTool('set_active_page', {
    title: 'Switch page',
    description: 'Switches to another page (numbered from 0).',
    inputSchema: { index: z.number().int().min(0) },
    annotations: edit,
}, (args) => run('setActivePage', args));

// ---------- output

server.registerTool('export_svg', {
    title: 'Export SVG',
    description: 'The current page as standalone SVG markup, without editor overlays.',
    annotations: readOnly,
}, () => run('exportSvg'));

server.registerTool('screenshot', {
    title: 'Screenshot',
    description: 'A PNG of the current page, to check how it looks. With `time`, shows the animation at that moment instead of the cutscene being edited.',
    inputSchema: {
        scale: z.number().min(0.1).max(2).optional().describe('default 1'),
        time: z.number().min(0).optional().describe('seconds into the animation'),
    },
    annotations: readOnly,
}, async (args) => {
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
});

// ---------- animation

server.registerTool('get_timelines', {
    title: 'Get timelines',
    description: 'The page\'s timelines and their cutscenes (times in seconds), with which shapes each cutscene adds, changes, and removes, and the cutscene open for editing.',
    annotations: readOnly,
}, () => run('getTimelines'));

server.registerTool('add_timeline', {
    title: 'Add timeline',
    description: 'Adds a timeline (an independent animation row that owns the shapes added in it) and opens its "Start" cutscene for editing.',
    inputSchema: { name: z.string().optional() },
    annotations: edit,
}, (args) => run('addTimeline', args));

server.registerTool('add_cutscene', {
    title: 'Add cutscene',
    description: 'Appends a cutscene after the last one in a timeline and opens it for editing. Shape edits made next become this cutscene\'s animation.',
    inputSchema: {
        timelineId: z.string().optional().describe('default: the timeline being edited'),
        name: z.string().optional(),
        duration: z.number().positive().optional().describe('seconds, default 1'),
        ease: ease.optional(),
    },
    annotations: edit,
}, (args) => run('addCutscene', args));

server.registerTool('open_cutscene', {
    title: 'Open cutscene',
    description: 'Loads a cutscene onto the canvas (the scene as it is when the cutscene ends) so later shape edits go into it.',
    inputSchema: { timelineId: z.string(), cutsceneId: z.string() },
    annotations: edit,
}, (args) => run('openCutscene', args));

server.registerTool('update_cutscene', {
    title: 'Update cutscene',
    description: 'Renames or retimes a cutscene, or changes how it plays: easing, direction (reverse plays it backwards), and repeats. Repeats play right after it (shown as lighter pseudo-cutscenes) and stop at the next cutscene of the timeline; loop \'inherit\' plays each one like the cutscene, \'alternate\' back and forth, \'continue\' keeps going (movement and rotation add up: use it for cycles like flying, walking, spinning). Cutscenes in the same timeline cannot overlap.',
    inputSchema: {
        timelineId: z.string(),
        cutsceneId: z.string(),
        name: z.string().optional(),
        start: z.number().min(0).optional().describe('seconds'),
        end: z.number().positive().optional().describe('seconds'),
        ease: ease.optional(),
        direction: z.enum(['forward', 'reverse']).optional(),
        repeat: z.union([z.number().int().min(0).max(99), z.literal('infinite')]).optional().describe('extra plays after the cutscene; "infinite" repeats until the next cutscene or the end of the animation'),
        loop: z.enum(['alternate', 'inherit', 'continue']).optional().describe('how repeats play: inherit = each like the cutscene (default), alternate = back and forth, continue = keep going: movement and rotation add up each time while the rest goes back and forth (e.g. one flap that moves a bird 68px, repeated, flies it across the scene)'),
    },
    annotations: edit,
}, (args) => run('updateCutscene', args));

server.registerTool('rename_timeline', {
    title: 'Rename timeline',
    description: 'Renames a timeline.',
    inputSchema: { timelineId: z.string(), name: z.string().min(1) },
    annotations: edit,
}, (args) => run('renameTimeline', args));

server.registerTool('delete_timeline', {
    title: 'Delete timeline',
    description: 'Deletes a timeline and its cutscenes. A page keeps at least one timeline.',
    inputSchema: { timelineId: z.string() },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('deleteTimeline', args));

server.registerTool('delete_cutscene', {
    title: 'Delete cutscene',
    description: 'Deletes a cutscene and the changes it makes. The "Start" cutscene of a timeline can\'t be deleted.',
    inputSchema: { timelineId: z.string(), cutsceneId: z.string() },
    annotations: { ...edit, destructiveHint: true },
}, (args) => run('deleteCutscene', args));

server.registerTool('set_loop', {
    title: 'Set loop',
    description: 'Whether the page\'s animation plays in a loop.',
    inputSchema: { loop: z.boolean() },
    annotations: edit,
}, (args) => run('setLoop', args));

server.registerTool('set_transition', {
    title: 'Set transition',
    description: 'Picks how a shape enters (if it was added in the open cutscene) or exits (if it was deleted in it). The default is fade.',
    inputSchema: { shapeId: z.string(), kind: z.enum(['enter', 'exit']), transition },
    annotations: edit,
}, (args) => run('setTransition', args));

await bridge.start();
await server.connect(new StdioServerTransport());

const shutdown = () => {
    bridge.close();
    process.exit(0);
};
process.stdin.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
