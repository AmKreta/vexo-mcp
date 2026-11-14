import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// add_project_file accepts data URLs of up to 28 MB
const MAX_BODY_BYTES = 40 * 1024 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

function rpcError(res, status, message, code = -32000) {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body is not valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Serves MCP over Streamable HTTP at /mcp, with one McpServer per client session, plus a
 * /health endpoint. Only localhost Host headers (and `allowedHosts`) and browser pages from
 * localhost are accepted, because the tools can drive the editor.
 *
 * @param {{ port: number, host?: string, allowedHosts?: string[], createServer: () => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, status?: () => unknown, log?: (msg: string) => void }} options
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export async function startHttpServer({
  port,
  host = '127.0.0.1',
  allowedHosts = [],
  createServer,
  status = () => ({}),
  log = () => {},
}) {
  /** @type {Map<string, StreamableHTTPServerTransport>} */
  const sessions = new Map();
  let hosts = [];

  const handle = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    if (origin && !LOCAL_ORIGIN.test(origin)) {
      rpcError(res, 403, `Requests from ${origin} are not allowed.`);
      return;
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, sessions: sessions.size, editor: status() });
      return;
    }
    if (url.pathname !== '/mcp') {
      sendJson(res, 404, { error: 'Not found. The MCP endpoint is /mcp.' });
      return;
    }

    const sessionId = req.headers['mcp-session-id'];
    const existing = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (existing) {
        await existing.handleRequest(req, res, body);
        return;
      }
      if (sessionId) {
        rpcError(res, 404, 'Unknown or expired session; initialize a new one.', -32001);
        return;
      }
      if (!isInitializeRequest(body)) {
        rpcError(res, 400, 'Send an initialize request first to start a session.');
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableDnsRebindingProtection: true,
        allowedHosts: hosts,
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
          log(`MCP session ${id} opened (${sessions.size} open)`);
        },
      });
      const mcp = createServer();
      transport.onclose = () => {
        if (transport.sessionId && sessions.delete(transport.sessionId)) {
          log(`MCP session ${transport.sessionId} closed (${sessions.size} open)`);
        }
        mcp.close().catch(() => {});
      };
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!existing) {
        rpcError(res, sessionId ? 404 : 400, 'Missing or unknown mcp-session-id header.');
        return;
      }
      await existing.handleRequest(req, res);
      return;
    }

    res.writeHead(405, { Allow: 'GET, POST, DELETE' }).end();
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      log(`HTTP error: ${err.message}`);
      if (!res.headersSent) {
        rpcError(res, err.status || 500, err.message, err.status ? -32700 : -32603);
      } else {
        res.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const actualPort = server.address().port;
  hosts = [
    `localhost:${actualPort}`,
    `127.0.0.1:${actualPort}`,
    `[::1]:${actualPort}`,
    ...allowedHosts,
  ];
  log(`MCP over HTTP at http://${host}:${actualPort}/mcp`);

  return {
    port: actualPort,
    async close() {
      await Promise.all([...sessions.values()].map((t) => t.close().catch(() => {})));
      sessions.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
