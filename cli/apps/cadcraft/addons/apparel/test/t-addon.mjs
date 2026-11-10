/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: the add-on in CadCraft — started by CadCraft's own loader (addons/cadcraft-api.js startAddons), off by
// default and switched on, its commands typed at CadCraft's command line, one undo step each, MOVE / MIRROR keeping the data,
// grips, the Properties section, and a piece saved in DWG and DXF and reopened with and without the add-on.
const { ok, section, near, nearPts, show, load, APP, ADDON, VERBOSE } = globalThis.__apTest;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { Doc } = await load('doc.js');
const G = await load('geom.js');
const Cmd = await load('commands.js');
const P = await load('propdefs.js');
const CA = await load('addons/cadcraft-api.js');
const A = await load('addons.js');
const O = await load('addons/objects.js');
const PC = await import(pathToFileURL(path.join(ADDON, 'lib/piece.js')).href);

export function harness() {
  const doc = new Doc();
  const log = [];
  const host = {
    cursor: { x: 0, y: 0 }, selection: new Set(),
    print: (s) => log.push(String(s)), prompt: () => {},
    setSelection: (s) => { host.selection = new Set(s); }, preview: () => {},
    pickAt: (p) => { let best = null, bd = 0.5; for (const e of doc.all()) { const d = G.distToEntity(e, p, doc.blocks); if (d < bd) { bd = d; best = e.id; } } return best; },
    pickWindow: (w, crossing) => doc.all().filter((e) => G.inWindow(e, w, crossing, doc.blocks)).map((e) => e.id),
    zoomExtents: () => {}, zoomWindow: () => {},
    props: { schedule: () => {} },
  };
  const eng = new Cmd.Engine(doc, host);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
  const type = async (...lines) => { for (const l of lines) { eng.text(l); await settle(); } };
  return { doc, log, host, eng, type, settle };
}

/**
 * Start CadCraft's add-ons with Apparel listed (the build's index.json may not list it yet). Commands live in one registry
 * per process (one page = one CadCraft): a harness started earlier is switched off first.
 */
let current = null;
export async function startWith(h, storage, ids = ['apparel']) {
  if (current) { for (const a of current.list()) if (a.state === 'active') await current.loader.setEnabled(a.id, false); }
  current = await CA.startAddons({
    doc: h.doc, engine: h.eng, host: h.host, print: h.host.print, redraw: () => {},
    pickFile: async () => h.picked || null, download: async (name, data, mime) => { h.downloaded = { name, data, mime }; }, openDrawing: async (drawing, name) => { h.opened = { drawing, name }; },
    base: pathToFileURL(path.join(APP, 'addons') + '/').href, storage, packages: A.packageStore(null), noGlobal: true,
    fetchJson: async (u) => (/\/index\.json$/.test(u) ? { addons: ids } : (() => { try { return JSON.parse(fs.readFileSync(fileURLToPath(u), 'utf8')); } catch { return null; } })()),
    importer: (u) => import(u),
  });
  return current;
}
export const memStorage = () => { const mem = new Map(); return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }; };

section('The add-on in CadCraft: loader, PIECE, NOTCH, GRAIN, DRILL, BUTTON, BUTTONHOLE, FOLDLINE, INTLINE, Properties');
const h = harness();
const { doc, log, host, type } = h;
const started = await startWith(h, memStorage());
const me = () => started.list().find((a) => a.id === 'apparel');
ok(me()?.state === 'off' && !Cmd.lookup('PIECE'), 'Apparel is bundled off by default ("default": "off")', JSON.stringify(me() && [me().state, me().detail]));
await started.loader.setEnabled('apparel', true);
ok(me()?.state === 'active', 'switched on in Settings › Add-ons: active', JSON.stringify(me() && [me().state, me().reason, me().detail]));
const names = ['PIECE', 'NOTCH', 'GRAIN', 'DRILL', 'BUTTON', 'BUTTONHOLE', 'FOLDLINE', 'INTLINE', 'SEAM'];
ok(names.every((n) => Cmd.lookup(n) && Cmd.commandRegistry.owner(n) === 'apparel'), 'its commands are registered, owned by the add-on', names.filter((n) => Cmd.commandRegistry.owner(n) !== 'apparel').join());
ok(names.every((n) => { const hh = Cmd.commandList().find((c) => c.name === n)?.help; return hh && !/^cmd\./.test(hh); }), 'every command has help in the add-on\'s words');
const isPiece = (e) => started.kinds.info(e)?.addonId === 'apparel' && started.kinds.info(e)?.kind === 'piece';
const pieces = () => doc.all().filter(isPiece);
const dataOf = (e) => started.kinds.info(doc.get(e.id))?.data;

// a rectangle 200 × 300 (mm), made into a piece with 10 mm allowance
await type('RECTANG', '0,0', '200,300');
const rect = doc.all().find((e) => e.type === 'poly');
const u0 = doc.undoStack.length;
host.setSelection(new Set([rect.id]));   // noun-verb: the selection is the outline
await type('PIECE', '10', 'Front');
if (VERBOSE) console.log(log.slice(-6).join('\n'));
let pc = pieces()[0];
ok(pc && !doc.get(rect.id) && doc.undoStack.length === u0 + 1, 'PIECE: the polyline becomes a piece, one undo step', log.slice(-3).join(' | '));
let d = pc && dataOf(pc);
ok(d && d.name === 'Front' && d.sa.w === 10 && d.pts.length === 4 && d.u === 'mm' && d.grain && d.grain.s === 'both', 'its data: name, 10 mm allowance, four corners, an automatic grain line', JSON.stringify(d));
const blk = pc && doc.blocks.get(pc.block);
ok(blk && blk.entities.some((e) => e.type === 'poly' && e.closed && nearPts(e.pts, [[210, -10], [210, 310], [-10, 310], [-10, -10]])), 'it draws its cut line 10 mm out', show(blk?.entities.find((e) => e.type === 'poly')?.pts || []));
ok(blk && blk.entities.some((e) => e.lt === 'DASHED') && blk.entities.some((e) => e.type === 'text' && e.s === 'Front') && !blk.entities.some((e) => 'role' in e), 'and its sew line dashed and its label (no helper fields in the drawing)');
ok(pc && pc.xd && pc.xd.CC_APPAREL && pc.xd.CC_APPAREL[1][1] === 'piece', 'stored as xdata under CC_APPAREL, kind piece');

// NOTCH: three notches, then remove one; the whole command = one step
const u1 = doc.undoStack.length;
host.setSelection(new Set([pc.id]));
await type('NOTCH', '100,0', 'K', 'V', '200,150', '0,150', 'R', '0,150', '');
pc = doc.get(pc.id); d = dataOf(pc);
ok(d.notches.length === 2 && d.notches[0].k === 'slit' && near(d.notches[0].d, 100) && d.notches[1].k === 'v' && doc.undoStack.length === u1 + 1, 'NOTCH: a slit at 100 along the bottom, a V on the right; one removed again; one step', JSON.stringify(d.notches));
// GRAIN with one arrowhead
host.setSelection(new Set([pc.id]));
await type('GRAIN', 'A', 'O', '100,50', '100,250');
d = dataOf(doc.get(pc.id));
ok(d.grain && d.grain.s === 'one' && near(d.grain.a[1], 50) && near(d.grain.b[1], 250), 'GRAIN: a grain line with one arrowhead', JSON.stringify(d.grain));
host.setSelection(new Set([pc.id]));
await type('DRILL', '50,200', '150,200', '');
host.setSelection(new Set([pc.id]));
await type('BUTTON', 'D', '15', '170,100', '170,60', '');
host.setSelection(new Set([pc.id]));
await type('BUTTONHOLE', '160,240', '180,240', '');
host.setSelection(new Set([pc.id]));
await type('FOLDLINE', '1,150');
host.setSelection(new Set([pc.id]));
await type('INTLINE', 'C', '40,300', '60,220', '80,300', '');
d = dataOf(doc.get(pc.id));
ok(d.drills.length === 2 && d.buttons.length === 2 && d.buttons[0][2] === 15 && d.holes.length === 1 && near(d.holes[0][2], 20) && near(d.holes[0][0], 170), 'DRILL, BUTTON (15 mm), BUTTONHOLE (20 long, centred)', JSON.stringify([d.drills, d.buttons, d.holes]));
ok(d.fold && near(d.fold.a[0], 0) && near(d.fold.b[0], 0) && d.lines.length === 1 && d.lines[0].p[1][2] === 1, 'FOLDLINE on the left edge; INTLINE as a curve (a dart)', JSON.stringify([d.fold, d.lines]));
const labels = doc.blocks.get(doc.get(pc.id).block).entities.filter((e) => e.type === 'text').map((e) => e.s);
ok(labels.includes('Cut 1 on fold'), 'the label says the piece is cut on the fold', labels.join(' | '));

// MOVE and MIRROR change the placement only; grips
const before = JSON.stringify(dataOf(doc.get(pc.id)));
host.setSelection(new Set([pc.id]));
await type('MOVE', '0,0', '500,0');
pc = doc.get(pc.id);
ok(pc.x === 500 && JSON.stringify(dataOf(pc)) === before, 'MOVE moves the piece; its data stays in its own frame');
host.setSelection(new Set([pc.id]));
await type('NOTCH', '600,300', '');
d = dataOf(doc.get(pc.id));
ok(d.notches.length === 3 && d.notches[2].i === 2 && near(d.notches[2].d, 100), 'a notch clicked on the moved piece lands on the right edge (top, 100 along)', JSON.stringify(d.notches[2]));
const grips = G.grips(doc.get(pc.id));
const g2 = grips.find((g) => g.key === 'cc:p2');
ok(g2 && near(g2.x, 700) && near(g2.y, 300), 'grips are placed in the drawing', JSON.stringify(g2));
const dragged = G.gripMove(doc.get(pc.id), 'cc:p2', { x: 720, y: 320 });
doc.change('GRIP EDIT', () => doc.update(pc.id, dragged));
d = dataOf(doc.get(pc.id));
ok(near(d.pts[2][0], 220) && near(d.pts[2][1], 320), 'dragging a corner grip moves the sew line point (in the piece\'s frame)', JSON.stringify(d.pts[2]));
doc.undo();
ok(near(dataOf(doc.get(pc.id)).pts[2][0], 200), 'undo puts it back');

// Properties
const pdefs = P.defsFor('insert', [doc.get(pc.id)], {});
const name = pdefs.find((x) => x.key === 'apparel:name'), qty = pdefs.find((x) => x.key === 'apparel:qty'), sa = pdefs.find((x) => x.key === 'apparel:sa');
ok(name && qty && sa && name.get(doc.get(pc.id)) === 'Front' && sa.get(doc.get(pc.id)) === 10, 'Properties: the piece\'s fields', pdefs.map((x) => x.key).join(' '));
doc.change('PROPERTIES', () => doc.update(pc.id, qty.set(doc.get(pc.id), 2)));
doc.change('PROPERTIES', () => doc.update(pc.id, sa.set(doc.get(pc.id), 15)));
const ents = doc.blocks.get(doc.get(pc.id).block).entities;
ok(dataOf(doc.get(pc.id)).qty === 2 && ents.some((e) => e.type === 'text' && e.s === 'Cut 2 on fold') && ents.some((e) => e.type === 'poly' && e.closed && e.pts.some((q) => near(q.x, -15) && near(q.y, -15))), 'a change in Properties redraws the piece (cut 2, 15 mm allowance)');
ok(!P.defsFor('line', [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], {}).some((x) => x.sec === 'apparel'), 'not shown for other objects');

// SEAM (AP.3): a 40 mm hem on the bottom edge, turned back at both bottom corners; then the whole piece again
host.setSelection(new Set([pc.id]));
await type('SEAM', '600,0', '40', 'C', '500,0', 'R', 'C', '700,0', 'R', '');
d = dataOf(doc.get(pc.id));
ok(d.sa.e[0] === 40 && d.sa.k[0] === 'reverse' && d.sa.k[1] === 'reverse', 'SEAM: 40 mm on the bottom edge, both bottom corners turned back', JSON.stringify(d.sa));
const cutNow = doc.blocks.get(doc.get(pc.id).block).entities.find((e) => e.type === 'poly' && e.closed);
// square sides: a turned-back hem mirrors a vertical side into a vertical line, so the corners are plain (slanted sides: the seam tests)
ok(cutNow && nearPts(cutNow.pts, [[215, -40], [215, 315], [-15, 315], [-15, -40]]), 'the cut line follows: the hem 40 down, the sides 15 out (square sides: turned back = straight down)', show(cutNow.pts));
host.setSelection(new Set([pc.id]));
await type('SEAM', 'N', '');
ok(dataOf(doc.get(pc.id)).sa === null && !doc.blocks.get(doc.get(pc.id).block).entities.some((e) => e.lt === 'DASHED'), 'SEAM None: a net pattern, no sew line drawn');
doc.undo();
ok(dataOf(doc.get(pc.id)).sa?.e?.[0] === 40, 'undo brings the allowance back');

// PIECE refuses what is not an outline
const nPieces = pieces().length;
await type('LINE', '0,500', '100,500', '');
const ln = doc.all().find((e) => e.type === 'line');
host.setSelection(new Set([ln.id]));
await type('PIECE');
ok(pieces().length === nPieces && /not closed/.test(log.slice(-2).join(' ')), 'PIECE on one open line: refused with the reason', log.slice(-2).join(' | '));

// files: DWG 2018, DXF R12, DXF 2000 — with the add-on the piece comes back whole; without, a plain block reference
section('A piece in DWG and DXF, with and without the add-on');
{
  const { saveDwg } = await load('dwg-save.js');
  const { writeDxf, readDxf } = await load('dxf.js');
  const { writeDxf2000 } = await load('dxf2000.js');
  const { readDwg } = await load('dwg/read.js');
  const { importDwg } = await load('dwg-import.js');
  const want = JSON.stringify(dataOf(doc.get(pc.id)));
  for (const F of [
    { key: 'DWG 2018', write: (dd) => saveDwg(dd, { version: '2018' }).bytes, read: (b) => importDwg(readDwg(b)) },
    { key: 'DWG 2000', write: (dd) => saveDwg(dd, { version: '2000' }).bytes, read: (b) => importDwg(readDwg(b)) },
    { key: 'DXF R12', write: (dd) => writeDxf(dd).text, read: (t) => readDxf(t) },
    { key: 'DXF 2000', write: (dd) => writeDxf2000(dd).text, read: (t) => readDxf(t) },
  ]) {
    let bytes;
    try { bytes = F.write(doc); } catch (err) { ok(false, F.key + ': saves', err.message); continue; }
    const d2 = new Doc();
    started.kinds.attach(d2);
    d2.load(F.read(bytes));
    const back = d2.all().find((e) => started.kinds.info(e)?.kind === 'piece');
    ok(back && JSON.stringify(started.kinds.info(back).data) === want && back.x === 500 && d2.blocks.get(back.block)?.entities.length > 10, F.key + ': saved and reopened with the add-on, the piece is whole', back ? '' : 'no piece');
    started.kinds.attach(doc);
  }
  // without the add-on: a plain block reference that still draws; its data passes through a save
  await started.loader.setEnabled('apparel', false);
  ok(!Cmd.lookup('PIECE') && !P.addedSections().includes('apparel'), 'switched off: commands and Properties section gone');
  const plain = doc.get(pc.id);
  ok(plain && plain.type === 'insert' && doc.blocks.get(plain.block)?.entities.length > 10 && O.ObjectKinds.stored(plain)?.kind === 'piece', 'the piece stays as a plain block reference with its graphics; what it is can still be read');
  const text = writeDxf(doc).text;
  const d3 = new Doc();
  d3.load(readDxf(text));
  const again = d3.all().find((e) => e.type === 'insert' && e.xd && e.xd.CC_APPAREL);
  ok(again && O.decodeItems(again.xd.CC_APPAREL)?.data && JSON.stringify(O.decodeItems(again.xd.CC_APPAREL).data) === want, 'saved without the add-on: its data passes through untouched');
  await started.loader.setEnabled('apparel', true);
  ok(Cmd.lookup('PIECE') && isPiece(doc.get(pc.id)), 'switched on again: the piece is a piece');
}
export { started, h };
