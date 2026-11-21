#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  checkBatchEdit,
  coreMcpTools,
  formatValidationIssues,
  loadSkill,
  mcpTools,
  skillNames,
  toolSkill,
  validateToolArgs,
} from '@vexo/editor-tools';
import { z } from 'zod';
import { CORE_INSTRUCTIONS } from '@vexo/editor-tools';
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
  instructions: `${CORE_INSTRUCTIONS}
MCP: the editor must be open in a browser; call editor_status if disconnected. Do not request media descriptions unless the user asks for verification or a closer media match.`,
};

// Tools are recorded here and registered on each McpServer that createServer() makes: stdio
// uses one, while HTTP needs one per client session. All of them drive the same editor bridge.
const toolRegistrations = [];
const server = { registerTool: (...registration) => toolRegistrations.push(registration) };

function createServer() {
  const mcp = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  const state = { loadedSkills: new Set() };
  for (const [name, config, handler] of toolRegistrations) {
    const isolatedHandler =
      name === 'load_skill' || name === 'call_tool' ? (args) => handler(args, state) : handler;
    mcp.registerTool(name, config, isolatedHandler);
  }
  return mcp;
}

/**
 * Forwards a tool call to the editor tab and returns its JSON answer as text. Pictures a command
 * attaches as `__images` (e.g. search_media's numbered contact sheet) go back as image content.
 */
async function run(method, params = {}, toolId) {
  try {
    const result = await bridge.call(method, params, { toolId });
    const { __images: images, __file: file, ...rest } =
      result && typeof result === 'object' && !Array.isArray(result) ? result : { value: result };
    const body = result && typeof result === 'object' && !Array.isArray(result) ? rest : result;
    return {
      ...(method === 'batchEdit' && result?.ok === false ? { isError: true } : {}),
      content: [
        ...(Array.isArray(images)
          ? images.map(({ data, mimeType }) => ({ type: 'image', data, mimeType }))
          : []),
        ...(file
          ? [{
              type: 'resource',
              resource: {
                uri: `vexo-media://${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`,
                mimeType: file.mimeType,
                blob: file.data,
              },
            }]
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
            text: JSON.stringify(
              { ...status, editor: await bridge.call('status', {}, { toolId: 'editor_status' }) },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  },
  export_mp4: async () => {
    try {
      const { filename, mimeType, base64 } = await bridge.call(
        'exportMp4',
        {},
        { toolId: 'export_mp4' },
      );
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
      const { filename, mimeType, text, cues } = await bridge.call('exportSubtitles', args, {
        toolId: 'export_subtitles',
      });
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
      const { png, width, height } = await bridge.call('screenshot', args, {
        toolId: 'screenshot',
      });
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
  add_supertonic_narration: async ({ voice = 'F1', ...args }) =>
    run('addAudioClip', { ...args, voice: `supertonic:${voice}` }, 'add_supertonic_narration'),
  add_kokoro_narration: async ({ voice = 'af_heart', ...args }) =>
    run('addAudioClip', { ...args, voice: `kokoro:${voice}` }, 'add_kokoro_narration'),
  // batch_edit's schema leaves each operation's args open (repeating every shape schema in it
  // would double its size), so each operation is checked against its own tool's schema here
  batch_edit: async (args) => {
    const problem = checkBatchEdit('mcp', args.operations);
    if (problem) return { isError: true, content: [{ type: 'text', text: problem }] };
    return run('batchEdit', args, 'batch_edit');
  },
  load_skill: async ({ name }, state) => {
    if (state.loadedSkills.has(name)) {
      return { content: [{ type: 'text', text: `Skill ${name} is already loaded.` }] };
    }
    const skill = loadSkill(name, 'mcp');
    if (!skill)
      return { isError: true, content: [{ type: 'text', text: `Unknown skill: ${name}.` }] };
    state.loadedSkills.add(name);
    return { content: [{ type: 'text', text: JSON.stringify(skill) }] };
  },
  call_tool: async ({ name, args = {} }, state) => {
    const parsed = validateToolArgs(name, 'mcp', args);
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid ${name} arguments: ${formatValidationIssues(parsed.error.issues)}`,
          },
        ],
      };
    }
    if (name === 'batch_edit') {
      const problem = checkBatchEdit('mcp', parsed.data.operations);
      if (problem) return { isError: true, content: [{ type: 'text', text: problem }] };
    }
    const def = mcpTools.find((candidate) => candidate.name === name);
    if (!def) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}.` }] };
    const result = await (handlers[name] ?? ((input) => run(def.method, input, name)))(parsed.data);
    const skill = toolSkill(name);
    if (skill && !state.loadedSkills.has(skill)) {
      result.content = [
        {
          type: 'text',
          text: `Tool ${name} result. Skill ${skill} is not loaded; call load_skill with name "${skill}" for its guidance.`,
        },
        ...(result.content ?? []),
      ];
    } else if (result.content) {
      result.content = [{ type: 'text', text: `Tool ${name} result.` }, ...result.content];
    }
    return result;
  },
};
for (const { name, method, ...config } of coreMcpTools) {
  server.registerTool(name, config, async (args) => {
    const parsed = validateToolArgs(name, 'mcp', args);
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid ${name} arguments: ${formatValidationIssues(parsed.error.issues)}`,
          },
        ],
      };
    }
    if (name === 'batch_edit') {
      const problem = checkBatchEdit('mcp', parsed.data.operations);
      if (problem) return { isError: true, content: [{ type: 'text', text: problem }] };
    }
    return (handlers[name] ?? ((input) => run(method, input, name)))(parsed.data);
  });
}
server.registerTool(
  'load_skill',
  {
    title: 'Load editor skill',
    description: "Load one area's guidance and member schemas.",
    inputSchema: { name: z.enum(skillNames) },
  },
  handlers.load_skill,
);
server.registerTool(
  'call_tool',
  {
    title: 'Call editor tool',
    description: 'Run a validated editor tool by name with its arguments.',
    inputSchema: {
      name: z.enum(mcpTools.map((tool) => tool.name)),
      args: z.record(z.string(), z.unknown()).default({}),
    },
  },
  handlers.call_tool,
);

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
