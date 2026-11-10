/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: design blocks (0.5 WL.35) — ELSAVEBLOCK / ELDESIGNBLOCK typed at CadCraft's command line with the add-on
// started by CadCraft's own loader, and lib/designblocks.js on its own (the untrusted read, export / import).
const { ok, section, load, APP } = globalThis.__elTest;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { Doc } = await load('doc.js');
const G = await load('geom.js');
const Cmd = await load('commands.js');
const CA = await load('addons/cadcraft-api.js');
const A = await load('addons.js');
const M = await import(pathToFileURL(path.join(APP, 'addons/electrical/lib/model.js')).href);
const DB = await import(pathToFileURL(path.join(APP, 'addons/electrical/lib/designblocks.js')).href);

section('WL.35 design blocks: save part of a schematic, place it again retagged and renumbered');
{
  const doc = new Doc();
  const log = [];
  const host = {
    cursor: { x: 0, y: 0 }, selection: new Set(),
    print: (s) => log.push(String(s)), prompt: () => {},
    setSelection: (s) => { host.selection = new Set(s); }, preview: () => {},
    pickAt: (p) => { let best = null, bd = 0.5; for (const e of doc.all()) { const d = G.distToEntity(e, p, doc.blocks); if (d < bd) { bd = d; best = e.id; } } return best; },
    pickWindow: (w, crossing) => doc.all().filter((e) => G.inWindow(e, w, crossing, doc.blocks)).map((e) => e.id),
    zoomExtents: () => {}, zoomWindow: () => {}, props: { schedule: () => {} },
  };
  const eng = new Cmd.Engine(doc, host);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
  const type = async (...lines) => { for (const l of lines) { eng.text(l); await settle(); } };
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const started = await CA.startAddons({
    doc, engine: eng, host, print: host.print, redraw: () => {}, pickFile: async () => null, download: async () => {}, openDrawing: async () => {},
    base: pathToFileURL(path.join(APP, 'addons') + '/').href, storage, packages: A.packageStore(null), noGlobal: true,
    fetchJson: async (u) => { try { return JSON.parse(fs.readFileSync(fileURLToPath(u), 'utf8')); } catch { return null; } },
    importer: (u) => import(u),
  });
  ok(started.list().find((a) => a.id === 'electrical')?.state === 'active' && Cmd.lookup('ELSAVEBLOCK') && Cmd.lookup('ELDB')?.name === 'ELDESIGNBLOCK', 'ELSAVEBLOCK and ELDESIGNBLOCK (ELDB) are commands of the add-on');

  // a coil, its contact on another path, two wires; numbered
  await type('ELSHEET', 'A3', 'Control');
  const xp = (p) => Math.round((20 + 39 * (p - 0.5)) / 2.5) * 2.5;
  await type('ELSYMBOL', 'coil', `${xp(2)},200`);
  await type('ELSYMBOL', 'contact.no', `${xp(3)},200`, '-K102');
  await type('ELWIRE', `${xp(2)},250`, `${xp(2)},205`);   // ends by itself on the pin
  await type('ELWIRE', `${xp(3)},250`, `${xp(3)},205`);
  await type('ELNUMBER', 'G');
  let m = M.scan(doc);
  const before = { coil: m.devices.find((d) => d.role === 'coil'), wirenos: m.wirenos.map((w) => w.value).sort() };
  ok(before.coil?.tag === '-K102' && m.devices.find((d) => d.role === 'contact')?.tag === '-K102' && before.wirenos.length === 2 && before.wirenos.every(Boolean), 'the starting schematic: -K102 and its contact, two numbered wires', JSON.stringify(before.wirenos));

  // save it: the selection, a base point, a name
  host.selection = new Set(doc.all().map((e) => e.id));
  await type('ELSAVEBLOCK', `${xp(2)},250`, 'Starter');
  const saved = JSON.parse(storage.getItem('cc-addon:cadcraft:electrical:designBlocks') || '[]');
  ok(saved.length === 1 && saved[0].name === 'Starter' && saved[0].format === DB.FORMAT && saved[0].entities.length >= 6 && saved[0].blocks.some((b) => /coil/i.test(b.name)), 'ELSAVEBLOCK keeps it in this browser, with the symbol blocks it uses', JSON.stringify(saved[0] && [saved[0].entities.length, saved[0].blocks.map((b) => b.name)]));
  ok(saved[0].entities.some((e) => e.type === 'line' && e.x1 === 0 && e.y1 === 0), 'relative to its base point');
  ok(/Starter saved/.test(log.join('\n')), 'it says so');

  // place it on path 6, lower on the sheet
  const steps = doc.undoStack.length;
  host.selection = new Set();
  await type('ELDESIGNBLOCK', '1', `${xp(6)},150`);
  m = M.scan(doc);
  const coils = m.devices.filter((d) => d.role === 'coil');
  const contacts = m.devices.filter((d) => d.role === 'contact');
  const nu = coils.find((d) => d.id !== before.coil.id);
  ok(coils.length === 2 && nu && nu.tag && nu.tag !== '-K102' && /^-K1\d\d/.test(nu.tag), 'placed: the new coil has a tag of its own from the path grid', nu?.tag);
  ok(contacts.length === 2 && contacts.some((d) => d.tag === nu.tag) && contacts.some((d) => d.tag === '-K102'), 'its contact follows it; the first contact keeps -K102', JSON.stringify(contacts.map((d) => d.tag)));
  ok(m.devices.find((d) => d.id === before.coil.id).tag === '-K102', 'the original coil is untouched');
  const now = m.wirenos.map((w) => w.value);
  ok(now.length === 4 && before.wirenos.every((v) => now.includes(v)) && new Set(now).size === 4, 'the new wires have new numbers; the numbers already there stay', JSON.stringify(now));
  const nuContact = contacts.find((d) => d.tag === nu.tag);
  ok(nuContact.attrs.XREF && nuContact.attrs.XREF !== before.coil.attrs?.XREF && Object.keys(nu.attrs).some((k) => /^XREF\d/.test(k) && nu.attrs[k]), 'cross-references worked out for the new pair', JSON.stringify([nuContact.attrs.XREF]));
  ok(doc.undoStack.length === steps + 1, 'one undo step');
  doc.undo();
  ok(M.scan(doc).devices.length === 2 && M.scan(doc).wirenos.length === 2, 'undo takes the whole design block away');
  doc.redo();

  // placing it twice more: no tag or number used twice
  await type('ELDESIGNBLOCK', '1', `${xp(9)},150`);
  m = M.scan(doc);
  const tags = m.devices.filter((d) => d.role === 'coil').map((d) => d.tag);
  ok(tags.length === 3 && new Set(tags).size === 3 && new Set(m.wirenos.map((w) => w.value)).size === m.wirenos.length, 'placed again: every coil tag and wire number is unique', JSON.stringify(tags));

  // the untrusted read
  const good = DB.read(JSON.stringify(saved[0]));
  ok(good && good.entities.length === saved[0].entities.length && good.blocks.length === saved[0].blocks.length, 'read(): a saved design block reads back whole');
  ok(DB.read('{"format":"other"}') === null && DB.read('not json') === null && DB.read({ ...saved[0], entities: [] }) === null && DB.read({ ...saved[0], version: 2 }) === null, 'read(): another format, broken JSON, nothing in it, a newer version → refused');
  const evil = DB.read({ ...saved[0], entities: [{ type: 'script', x: 0 }, { type: 'line', x1: 0, y1: 0, x2: 'x', y2: 1 }, { type: 'line', x1: 0, y1: 0, x2: 1e300, y2: 1 }, { type: 'text', x: 0, y: 0, h: 2, s: '<b>ok</b>', onload: 'x' }] });
  ok(evil && evil.entities.length === 1 && evil.entities[0].type === 'text' && !('onload' in evil.entities[0]), 'read(): unknown types, non-numbers and huge numbers dropped; unknown fields dropped');
  ok(DB.leftOut(doc, [...doc.all().map((e) => e.id)]) === 0, 'leftOut counts what a design block cannot carry');
  await started.loader.setEnabled('electrical', false);
}
