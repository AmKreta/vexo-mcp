import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('registers only the core plus skill wrappers and validates dynamic calls', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));
  env.MCP_TRANSPORT = 'stdio';
  env.SVG_EDITOR_BRIDGE_PORT = '0';
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
    cwd: process.cwd(),
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'registry-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.ok(names.includes('load_skill'));
    assert.ok(names.includes('call_tool'));
    assert.ok(names.includes('batch_edit'));
    assert.ok(names.includes('animate_shape'));
    assert.ok(!names.includes('search_media'));
    assert.ok(!names.includes('export_mp4'));

    const loaded = await client.callTool({ name: 'load_skill', arguments: { name: 'drawing' } });
    assert.match(loaded.content[0].text, /shapePropertyReference/);
    const duplicate = await client.callTool({ name: 'load_skill', arguments: { name: 'drawing' } });
    assert.match(duplicate.content[0].text, /already loaded/);

    const invalidDynamic = await client.callTool({
      name: 'call_tool',
      arguments: { name: 'add_shape', args: { type: 'mirror', properties: { mirror: { segments: 99 } } } },
    });
    assert.equal(invalidDynamic.isError, true);
    assert.match(invalidDynamic.content[0].text, /properties\.mirror\.segments.*maximum is 24/);

    const invalidCore = await client.callTool({
      name: 'add_shape',
      arguments: { type: 'mirror', properties: { mirror: { segments: 99 } } },
    });
    assert.equal(invalidCore.isError, true);
    assert.match(invalidCore.content[0].text, /properties\.mirror\.segments.*maximum is 24/);
  } finally {
    await client.close();
  }
});
