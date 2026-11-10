#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * smoke.mjs — the package's own check (npm test). Starts the MCP server over stdio on a copy of fixtures/, the way an assistant
 * does, and calls one tool per kind of file; then runs the cadcraft command line. Exit 1 on any failure.
 *
 *   node test/smoke.mjs [--bin <folder with mcp/ and cli/>]     (default: this repo; CI also runs it on the installed package)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bi = process.argv.indexOf('--bin');
const PKG = path.resolve(bi > 0 ? process.argv[bi + 1] : path.join(HERE, '..'));
const SERVER = path.join(PKG, 'mcp/server.mjs'), CLI = path.join(PKG, 'cli/cadcraft.mjs');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (extra === undefined ? '' : ' — ' + JSON.stringify(extra).slice(0, 400))); } };

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cadcraft-mcp-smoke-'));
fs.cpSync(path.join(HERE, '../fixtures'), DIR, { recursive: true });
fs.mkdirSync(path.join(DIR, 'out'));

// ---- MCP over stdio: one JSON-RPC message per line
const srv = spawn(process.execPath, [SERVER, '--root', DIR, '--allow', 'read,export', '--log', path.join(DIR, 'out/calls.jsonl')], { stdio: ['pipe', 'pipe', 'inherit'] });
const waiting = new Map();
let buf = '', nextId = 1;
srv.stdout.on('data', (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0;) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  }
});
const rpc = (method, params) => new Promise((res, rej) => {
  const id = nextId++;
  const t = setTimeout(() => rej(new Error(method + ': no answer in 120 s')), 120000);
  waiting.set(id, (m) => { clearTimeout(t); res(m); });
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, a) => {
  const r = await rpc('tools/call', { name, arguments: a });
  const res = r.result || {};
  const text = (res.content || []).map((c) => c.text || '').join('');
  let data = res.structuredContent; if (!data) { try { data = JSON.parse(text); } catch { data = text; } }
  if (res.isError || r.error) throw new Error(name + ': ' + (text || JSON.stringify(r.error)));
  return data;
};
const step = async (label, fn) => { try { await fn(); } catch (e) { ok(false, label, String(e.message || e)); } };

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
ok(init.result && init.result.serverInfo && init.result.protocolVersion, 'initialize', init);
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const list = await rpc('tools/list', {});
const names = (list.result && list.result.tools || []).map((t) => t.name);
ok(['drawing_open', 'ifc_open', 'site_open', 'part_open', 'takeoff_open'].every((n) => names.includes(n)), 'tools/list names a tool for each kind of file', names);

await step('a DWG drawing: describe and plot', async () => {
  const { doc } = await call('drawing_open', { path: 'kitchen-equipment.dwg' });
  const d = await call('drawing_describe', { doc });
  ok(Array.isArray(d.layers) && d.layers.length > 0, 'drawing_describe lists layers');
  await call('drawing_plot', { doc, out: 'out/kitchen.pdf' });
  ok(fs.readFileSync(path.join(DIR, 'out/kitchen.pdf')).subarray(0, 5).toString() === '%PDF-', 'drawing_plot writes a PDF');
});
await step('a DXF drawing opens', async () => { const { doc } = await call('drawing_open', { path: 'base-plan.dxf' }); ok(!!doc, 'drawing_open reads DXF'); });
await step('an IFC model: doors', async () => {
  const { doc } = await call('ifc_open', { path: 'house.ifc' });
  const q = await call('ifc_query', { doc, class: 'IfcDoor' });
  ok(JSON.stringify(q).includes('IfcDoor'), 'ifc_query finds doors');
});
await step('a CivilCraft site: cut and fill', async () => {
  const { doc } = await call('site_open', { path: 'site.civilcraft.json' });
  const v = await call('surface_volume', { doc });
  ok(v && typeof v === 'object' && /cut/i.test(JSON.stringify(v)), 'surface_volume answers cut and fill');
});
await step('a PartCraft part: mass', async () => {
  const { doc } = await call('part_open', { path: 'screw.partcraft.json' });
  const m = await call('mass_properties', { doc });
  ok(/volume/i.test(JSON.stringify(m)), 'mass_properties gives a volume');
});
await step('a takeoff: estimate', async () => {
  const { doc } = await call('takeoff_open', { path: 'job.takeoff.json' });
  const e = await call('takeoff_estimate', { doc });
  ok(e && typeof e === 'object', 'takeoff_estimate answers');
});
await step('refusals', async () => {
  const r = await rpc('tools/call', { name: 'drawing_open', arguments: { path: '../outside.dwg' } });
  ok(r.result && r.result.isError, 'a path outside --root is refused');
  const { doc } = await call('drawing_open', { path: 'base-plan.dxf' });
  const w = await rpc('tools/call', { name: 'command_run', arguments: { doc, input: 'ERASE ALL ' } });
  ok(w.result && w.result.isError, 'an edit without --allow edit is refused');
});
srv.stdin.end();
await new Promise((r) => srv.on('exit', r));
ok(fs.existsSync(path.join(DIR, 'out/calls.jsonl')) && fs.readFileSync(path.join(DIR, 'out/calls.jsonl'), 'utf8').trim().split('\n').length >= 10, '--log keeps every call');

// ---- the command line
const cli = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: DIR, encoding: 'utf8', timeout: 180000 });
let r = cli('info', 'kitchen-equipment.dwg', '--json');
ok(r.status === 0 && JSON.parse(r.stdout), 'cadcraft info --json', r.stderr);
r = cli('convert', 'kitchen-equipment.dwg', 'out/kitchen-2013.dwg', '--version', '2013');
ok(r.status === 0 && fs.existsSync(path.join(DIR, 'out/kitchen-2013.dwg')), 'cadcraft convert to DWG 2013', r.stderr);
r = cli('convert', 'site.civilcraft.json', 'out/site.xml');
ok(r.status === 0 && fs.readFileSync(path.join(DIR, 'out/site.xml'), 'utf8').includes('<LandXML'), 'cadcraft convert site → LandXML', r.stderr);
r = cli('convert', 'screw.partcraft.json', 'out/screw.stl');
ok(r.status === 0 && fs.statSync(path.join(DIR, 'out/screw.stl')).size > 84, 'cadcraft convert part → STL', r.stderr);
r = cli('convert', 'screw.partcraft.json', 'out/screw.usdz');
ok(r.status === 0 && fs.readFileSync(path.join(DIR, 'out/screw.usdz')).subarray(0, 2).toString() === 'PK', 'cadcraft convert part → USDZ', r.stderr);
r = cli('tools', '--json');
ok(r.status === 0 && JSON.parse(r.stdout), 'cadcraft tools --json', r.stderr);
r = cli('frobnicate');
ok(r.status === 2, 'a mistake in the command exits 2', r.status);

fs.rmSync(DIR, { recursive: true, force: true });
console.log(pass + ' passed, ' + fail + ' failed (Node ' + process.versions.node + ', ' + process.platform + ')');
process.exit(fail ? 1 : 0);
