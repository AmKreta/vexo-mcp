import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { startHttpServer } from '../src/http.js';

function createServer() {
  const mcp = new McpServer({ name: 'test', version: '0.0.0' });
  mcp.registerTool('echo', { inputSchema: { text: z.string() } }, ({ text }) => ({
    content: [{ type: 'text', text }],
  }));
  return mcp;
}

async function start() {
  return startHttpServer({ port: 0, createServer, status: () => ({ connectedTabs: 0 }) });
}

async function connect(port) {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  return client;
}

test('serves tools to several clients, each in its own session', async () => {
  const server = await start();
  const [a, b] = await Promise.all([connect(server.port), connect(server.port)]);
  const { tools } = await a.listTools();
  assert.deepEqual(
    tools.map((t) => t.name),
    ['echo'],
  );
  const result = await b.callTool({ name: 'echo', arguments: { text: 'hi' } });
  assert.equal(result.content[0].text, 'hi');
  await Promise.all([a.close(), b.close()]);
  await server.close();
});

test('reports health', async () => {
  const server = await start();
  const res = await fetch(`http://127.0.0.1:${server.port}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, sessions: 0, editor: { connectedTabs: 0 } });
  await server.close();
});

test('rejects browser pages from other sites', async () => {
  const server = await start();
  const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  await server.close();
});

test('requires initialize before other requests', async () => {
  const server = await start();
  const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(res.status, 400);
  await server.close();
});
