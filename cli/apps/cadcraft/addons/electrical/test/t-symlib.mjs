/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: other symbol libraries (0.5 WL.36) — a made-up third-party block library (drawn in inches, with its
// own attribute names) written as DXF and DWG with CadCraft's writers, read by lib/symlib.js, then imported by typing
// ELIMPORTSYM and placed with ELSYMBOL › Imported, with the add-on started by CadCraft's own loader.
const { ok, section, load, APP } = globalThis.__elTest;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { Doc } = await load('doc.js');
const G = await load('geom.js');
const Cmd = await load('commands.js');
const CA = await load('addons/cadcraft-api.js');
const A = await load('addons.js');
const { writeDxf, readDxf } = await load('dxf.js');
const { saveDwg } = await load('dwg-save.js');
const { readDwg } = await load('dwg/read.js');
const { importDwg } = await load('dwg-import.js');
const M = await import(pathToFileURL(path.join(APP, 'addons/electrical/lib/model.js')).href);
const SL = await import(pathToFileURL(path.join(APP, 'addons/electrical/lib/symlib.js')).href);
const S = await import(pathToFileURL(path.join(APP, 'addons/electrical/lib/symbols.js')).href);

section('WL.36 other symbol libraries: DWG/DXF blocks → Electrical symbols');
// ---- the library, as another program might have drawn it (inches, current top to bottom, base point in the middle)
const att = (tag, x, y, def = '', extra = {}) => ({ tag, prompt: tag, def, x, y, h: 0.08, rot: 0, ha: 'left', va: 'baseline', wf: 1, layer: '0', color: null, ...extra });
const lib = new Doc();
lib.change('library', () => {
  lib.defineBlock({ name: 'RELAY_COIL', base: { x: 0, y: 0 }, entities: [
    { type: 'poly', pts: [{ x: -0.2, y: -0.1 }, { x: 0.2, y: -0.1 }, { x: 0.2, y: 0.1 }, { x: -0.2, y: 0.1 }], closed: true, layer: '0', color: null },
    { type: 'line', x1: 0, y1: 0.1, x2: 0, y2: 0.25, layer: '0', color: null },
    { type: 'line', x1: 0, y1: -0.1, x2: 0, y2: -0.25, layer: '0', color: null },
    { type: 'text', x: 0.3, y: 0.3, h: 0.08, rot: 0, s: 'CR', layer: '0', color: null },
  ], attdefs: [att('TAG1', -0.4, 0.05), att('MFG', -0.4, -0.2, 'Acme', { invisible: true }), att('CAT', -0.4, -0.3, 'R-24', { invisible: true }), att('RATING', -0.4, -0.4, '24 V DC', { invisible: true })] });
  lib.defineBlock({ name: 'PB_NO', base: { x: 0, y: 0 }, entities: [
    { type: 'line', x1: 0, y1: 0.25, x2: 0, y2: 0.05, layer: '0', color: null },
    { type: 'line', x1: 0, y1: -0.05, x2: 0, y2: -0.25, layer: '0', color: null },
    { type: 'line', x1: -0.1, y1: 0.05, x2: 0.1, y2: -0.05, layer: '0', color: null },
  ], attdefs: [att('X1TERM01', 0, 0.25), att('X1TERM02', 0, -0.25), att('TAG1', -0.3, 0)] });
  lib.defineBlock({ name: 'TITLE_BOX', base: { x: 0, y: 0 }, entities: [{ type: 'poly', pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 0, y: 1 }], closed: true, layer: '0', color: null }] });
  lib.add({ type: 'insert', block: 'RELAY_COIL', x: 1, y: 1, sx: 1, sy: 1, rot: 0, layer: '0', attrs: {} });
});
lib.meta.units = 'inches';
const dxfText = writeDxf(lib).text;
const dwgBytes = saveDwg(lib, { version: '2018' }).bytes;

// ---- the module on its own
ok(SL.suggest('RELAY_COIL') === 'coil' && SL.suggest('PB_NO') === 'pushbutton.no' && SL.suggest('PB-NC') === 'pushbutton.nc' && SL.suggest('FUSE_2A') === 'fuse' && SL.suggest('MOTOR3PH') === 'motor.3ph' && SL.suggest('TITLE_BOX') === null && SL.suggest('NC_CONTACT') === 'contact.nc', 'suggest(): types from block names (and none for a title box)');
for (const [label, d] of [['DXF R12', (() => { const x = new Doc(); x.load(readDxf(dxfText)); return x; })()], ['DWG 2018', (() => { const x = new Doc(); x.load(importDwg(readDwg(dwgBytes))); return x; })()]]) {
  const cands = SL.candidates(d).map((x) => x.name);
  ok(cands.join() === 'PB_NO,RELAY_COIL,TITLE_BOX', label + ': candidates are the named blocks with drawing in them', JSON.stringify(cands));
  ok(SL.unitScale(d.meta.units) === 25.4, label + ': the file says inches', d.meta.units);
  const coil = SL.convert(d.blocks.get('RELAY_COIL'), 'coil', { scale: 25.4, name: 'RELAY_COIL' });
  const lab = (tag) => coil.block.attdefs.find((a) => a.tag === tag)?.def;
  ok(coil.pins.length === 2 && coil.pins[0].tag === 'P1' && Math.abs(coil.pins[0].y - 6.35) < 1e-6 && Math.abs(coil.pins[1].y + 6.35) < 1e-6 && lab('P1') === 'A1' && lab('P2') === 'A2', label + ': coil pins from its lead ends, in millimetres, named and labelled like ours (P1 = A1 top, P2 = A2 bottom)', JSON.stringify(coil.pins));
  ok(coil.mapped.TAG1 === 'TAG' && coil.mapped.MFG === 'MFR' && coil.mapped.CAT === 'PART' && coil.kept.join() === 'RATING', label + ': attributes mapped (TAG1 → TAG, MFG → MFR, CAT → PART), others kept', JSON.stringify([coil.mapped, coil.kept]));
  const meta = S.readMeta(coil.block);
  ok(meta.sym === 'coil' && meta.role === 'coil' && meta.std === 'lib' && meta.lib === 'RELAY_COIL' && coil.block.name === 'EL_LIB_RELAY_COIL', label + ': an Electrical symbol (EL attribute: sym coil, std lib)');
  ok(coil.block.attdefs.find((a) => a.tag === 'MFR').def === 'Acme' && coil.block.attdefs.find((a) => a.tag === 'RATING').invisible, label + ': their defaults kept, their own attribute invisible');
  const pb = SL.convert(d.blocks.get('PB_NO'), 'pushbutton.no', { scale: 25.4 });
  ok(pb.pins.length === 2 && Math.abs(pb.pins[0].y - 6.35) < 1e-6, label + ': pushbutton pins from its terminal attributes (X1TERM01, X1TERM02)', JSON.stringify(pb.pins));
}

// ---- typed: ELIMPORTSYM, then ELSYMBOL › Imported
{
  const doc = new Doc();
  const log = [];
  const host = {
    cursor: { x: 0, y: 0 }, selection: new Set(), print: (s) => log.push(String(s)), prompt: () => {},
    setSelection: (s) => { host.selection = new Set(s); }, preview: () => {},
    pickAt: (p) => { let best = null, bd = 0.5; for (const e of doc.all()) { const dd = G.distToEntity(e, p, doc.blocks); if (dd < bd) { bd = dd; best = e.id; } } return best; },
    pickWindow: (w, crossing) => doc.all().filter((e) => G.inWindow(e, w, crossing, doc.blocks)).map((e) => e.id),
    zoomExtents: () => {}, zoomWindow: () => {}, props: { schedule: () => {} },
  };
  const eng = new Cmd.Engine(doc, host);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };
  const type = async (...lines) => { for (const l of lines) { eng.text(l); await settle(); } };
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const started = await CA.startAddons({
    doc, engine: eng, host, print: host.print, redraw: () => {}, pickFile: async () => null, download: async () => {}, openDrawing: async () => {},
    base: pathToFileURL(path.join(APP, 'addons') + '/').href, storage, packages: A.packageStore(null), noGlobal: true,
    fetchJson: async (u) => { try { return JSON.parse(fs.readFileSync(fileURLToPath(u), 'utf8')); } catch { return null; } },
    importer: (u) => import(u),
  });
  ok(Cmd.lookup('ELIMPORTSYM') && Cmd.lookup('ELIS')?.name === 'ELIMPORTSYM', 'ELIMPORTSYM (ELIS) is a command of the add-on');
  // the file picker the command opens, answered with our DWG
  const hadDoc = globalThis.document;
  globalThis.document = { createElement: () => { const h = {}; const el = { files: [new File([dwgBytes], 'third-party-library.dwg')], addEventListener: (k, fn) => { h[k] = fn; }, click: () => setTimeout(() => h.change?.(), 0) }; return el; } };
  await type('ELIMPORTSYM');
  await type('A', 'I');
  if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
  const saved = JSON.parse(storage.getItem('cc-addon:cadcraft:electrical:symbolLibrary') || '[]');
  ok(saved.length === 2 && saved.map((x) => x.key).sort().join() === 'coil,pushbutton.no', 'suggested types: the coil and the pushbutton are imported, the title box skipped', JSON.stringify(saved.map((x) => x.key)));
  ok(/2 symbols imported from third-party-library\.dwg \(1 skipped\)/.test(log.join('\n')), 'it says so', log.slice(-2).join(' | '));
  // placed like any symbol: tagged, with its maker and part
  await type('ELSHEET', 'A3', 'Control');
  const xp = (p) => Math.round((20 + 39 * (p - 0.5)) / 2.5) * 2.5;
  const coilNo = String(saved.findIndex((x) => x.key === 'coil') + 1);
  await type('ELSYMBOL', 'L', coilNo, `${xp(4)},150`);
  let m = M.scan(doc);
  const dev = m.devices.find((d) => d.meta?.std === 'lib');
  ok(dev && dev.role === 'coil' && /^-K1\d\d$/.test(dev.tag) && dev.attrs.MFR === 'Acme' && dev.attrs.PART === 'R-24' && dev.attrs.RATING === '24 V DC', 'ELSYMBOL › Imported places it: a coil, tagged from the path grid, maker and part filled in', JSON.stringify(dev && [dev.role, dev.tag, dev.attrs.MFR, dev.attrs.PART]));
  ok(dev && dev.pins.length === 2, 'its two connection points are where wires connect');
  await type('ELSTANDARD', 'A');
  await type('ELSTANDARD', 'C');
  ok(M.scan(doc).devices.find((d) => d.id === dev.id)?.e.block === 'EL_LIB_RELAY_COIL', 'ELSTANDARD convert leaves an imported symbol\'s drawing alone');
  // saved and opened without the add-on's code: still a coil
  const back = new Doc();
  back.load(readDxf(writeDxf(doc).text));
  const again = M.scan(back).devices.find((d) => d.meta?.std === 'lib');
  ok(again && again.role === 'coil' && again.tag === dev.tag, 'DXF round trip: it is still an imported coil with its tag');
  // the saved library is untrusted when read back
  ok(SL.readLibrary(saved).length === 2 && SL.readLibrary([{ ...saved[0], key: 'nonsense' }, { ...saved[1], block: { ...saved[1].block, name: '../X' } }, 'x', null]).length === 0, 'readLibrary(): a bad type, a bad block name or junk → left out');
  await started.loader.setEnabled('electrical', false);
}
