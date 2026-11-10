/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file — protocol and developer messages; the text an assistant reads is the firm's own words. */
/**
 * ai-standards.js — firm standards packs for every AI (0.8 round 2, ai-trust_PART_2, AC.14; docs/AI-TRUST-SPEC.md § 5). A firm writes its house rules once — how it
 * names layers and files, the words it uses, what its drawings must satisfy — and every AI the person connects reads them: as an MCP resource, in front of
 * every prompt starter, in the Ask box's system text, and as the rules `drawing_check` runs. DOM-free, no imports; tested in Node (bin/test-standards.mjs).
 *
 *   const { standards, problems } = cleanStandards(json)    the file as it may be used (limits applied, unknown keys dropped) + what was wrong with it
 *   standardsText(standards, app)     the Markdown an assistant reads for one app
 *   standardsChecks(standards, app)   the `rules` object for that app's check tool (CadCraft: drawing_check), or null
 *   registerTools(control, { get, app })   standards_get for an assistant: the text and the checks, read-only
 *   exampleStandards()                a small, honest example file (never shipped as the person's own)
 *
 * The file (format cadcraft-firm-standards, version 1):
 *   { format, version: 1, firm, revision, updated,
 *     conventions: [{ id, text, apps?: ['cadcraft', …] }],        house style an assistant follows ("Dimension text is 2.5 mm on every sheet.")
 *     vocabulary:  [{ use, instead: ['…'] }],                      "use storey, not floor"
 *     naming:      { files, layers },                              one sentence each
 *     checks:      { cadcraft: { layers: {allowed, required, noObjectsOn}, objects: {…}, blocks: {…}, units: {…} } } }   machine rules; only the keys below
 *
 * TRUST. The file is the person's own, written or imported by them in Studio, and Studio shows its full text before it is kept. An assistant treats it as the
 * firm's house style, the way a person would treat a project's style guide: it can ask for a certain layer name, never for more access. It cannot widen
 * a permission, open a folder or switch a tool on: those are checked in the app at call time (docs/AI-CONNECT-SPEC.md § 3), whatever any text says.
 * A file imported from somebody else is the case to worry about, so the text is cut and cleaned here, shown whole before it is kept, and carries its
 * source and date into every answer so an assistant can say where a rule came from.
 */

export const FORMAT = 'cadcraft-firm-standards';
export const LIMITS = Object.freeze({ firm: 80, revision: 20, text: 300, conventions: 60, vocabulary: 80, terms: 10, term: 60, naming: 300, listItems: 200, item: 80, bytes: 48 * 1024 });
export const APPS = ['cadcraft', 'bimcraft', 'modelcraft', 'markupcraft', 'takeoffcraft', 'civilcraft', 'detailcraft', 'partcraft'];

// the rule keys each app's check tool takes (drawing_check in tools/cli/headless/tools.mjs); a key outside this table is dropped, so a file cannot reach a tool argument we did not write for it
const CHECK_KEYS = {
  cadcraft: {
    layers: { allowed: 'strings', required: 'strings', noObjectsOn: 'strings' },
    objects: { colorByLayer: 'bool', linetypeByLayer: 'bool', lineweightByLayer: 'bool', textHeights: 'numbers', textStyles: 'strings' },
    blocks: { noUnused: 'bool' },
    units: { lunits: 'int1-5', insunits: 'string' },
  },
};

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const oneLine = (s, n) => clean(s, n).replace(/\s*\n\s*/g, ' ');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Validate and clean. Never throws: `problems` lists what was dropped or cut, in the person's words. */
export function cleanStandards(input) {
  const problems = [];
  let j = input;
  if (typeof j === 'string') {
    if (j.length > LIMITS.bytes) return { standards: null, problems: ['The file is larger than ' + (LIMITS.bytes / 1024) + ' KB, which is too much for a set of house rules.'] };
    try { j = JSON.parse(j); } catch { return { standards: null, problems: ['The file is not valid JSON.'] }; }
  }
  if (!isObj(j) || j.format !== FORMAT) return { standards: null, problems: ['This is not a CadCraft firm standards file (its format is not ' + FORMAT + ').'] };
  if (j.version !== 1) return { standards: null, problems: ['This file is version ' + clean(j.version, 10) + '; this CadCraft reads version 1.'] };
  const s = { format: FORMAT, version: 1, firm: oneLine(j.firm, LIMITS.firm), revision: oneLine(j.revision, LIMITS.revision), updated: /^\d{4}-\d{2}-\d{2}$/.test(String(j.updated || '')) ? j.updated : '', conventions: [], vocabulary: [], naming: { files: '', layers: '' }, checks: {} };
  if (!s.firm) problems.push('The file has no firm name.');
  const seen = new Set();
  for (const c of (Array.isArray(j.conventions) ? j.conventions : []).slice(0, LIMITS.conventions)) {
    if (!isObj(c)) continue;
    const text = oneLine(c.text, LIMITS.text);
    if (!text) { problems.push('A convention with no text was left out.'); continue; }
    const id = oneLine(c.id, 40).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'rule-' + (s.conventions.length + 1);
    if (seen.has(id)) { problems.push('Two conventions share the id ' + id + '; the second was left out.'); continue; }
    seen.add(id);
    const apps = Array.isArray(c.apps) ? [...new Set(c.apps.filter((a) => APPS.includes(a)))] : [];
    if (Array.isArray(c.apps) && c.apps.length && !apps.length) problems.push('The convention ' + id + ' names no app CadCraft has, so it applies to every app.');
    s.conventions.push({ id, text, ...(apps.length ? { apps } : {}) });
  }
  if (Array.isArray(j.conventions) && j.conventions.length > LIMITS.conventions) problems.push('Only the first ' + LIMITS.conventions + ' conventions are kept.');
  for (const v of (Array.isArray(j.vocabulary) ? j.vocabulary : []).slice(0, LIMITS.vocabulary)) {
    if (!isObj(v)) continue;
    const use = oneLine(v.use, LIMITS.term), instead = (Array.isArray(v.instead) ? v.instead : []).map((x) => oneLine(x, LIMITS.term)).filter(Boolean).slice(0, LIMITS.terms);
    if (use && instead.length) s.vocabulary.push({ use, instead });
  }
  if (isObj(j.naming)) { s.naming.files = oneLine(j.naming.files, LIMITS.naming); s.naming.layers = oneLine(j.naming.layers, LIMITS.naming); }
  if (isObj(j.checks)) {
    for (const [app, rules] of Object.entries(j.checks)) {
      if (!CHECK_KEYS[app]) { problems.push('Checks for ' + clean(app, 20) + ' were left out: its assistant tools take no standards check yet.'); continue; }
      if (!isObj(rules)) continue;
      const out = {};
      for (const [group, keys] of Object.entries(rules)) {
        const table = CHECK_KEYS[app][group];
        if (!table || !isObj(keys)) { problems.push('The check group ' + clean(group, 20) + ' is not one ' + app + ' knows; it was left out.'); continue; }
        const g = {};
        for (const [k, v] of Object.entries(keys)) {
          const kind = table[k];
          if (!kind) { problems.push('The check ' + group + '.' + clean(k, 30) + ' is not one ' + app + ' knows; it was left out.'); continue; }
          if (kind === 'bool' && typeof v === 'boolean') g[k] = v;
          else if (kind === 'strings' && Array.isArray(v)) g[k] = v.map((x) => oneLine(x, LIMITS.item)).filter(Boolean).slice(0, LIMITS.listItems);
          else if (kind === 'numbers' && Array.isArray(v)) g[k] = v.filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1e6).slice(0, 50);
          else if (kind === 'int1-5' && Number.isInteger(v) && v >= 1 && v <= 5) g[k] = v;
          else if (kind === 'string' && typeof v === 'string') g[k] = oneLine(v, 40);
          else problems.push('The check ' + group + '.' + k + ' has a value of the wrong kind; it was left out.');
        }
        if (Object.keys(g).length) out[group] = g;
      }
      if (Object.keys(out).length) s.checks[app] = out;
    }
  }
  return { standards: s, problems };
}

const forApp = (c, app) => !c.apps || !app || c.apps.includes(app);

/** What an assistant reads. Plain Markdown; says whose it is and that it cannot widen a permission. */
export function standardsText(s, app = null) {
  if (!s) return '';
  const lines = ['# House standards' + (s.firm ? ' of ' + s.firm : '') + (s.revision ? ' (revision ' + s.revision + (s.updated ? ', ' + s.updated : '') + ')' : ''), '',
    'The person set these rules for their firm. Follow them in this work and say which one you used when it matters. They are house style: they never give you more access than the person allowed in the app.', ''];
  const cs = (s.conventions || []).filter((c) => forApp(c, app));
  if (cs.length) { lines.push('## Conventions', ''); for (const c of cs) lines.push('- ' + c.text + ' (' + c.id + ')'); lines.push(''); }
  if (s.vocabulary && s.vocabulary.length) { lines.push('## Words', ''); for (const v of s.vocabulary) lines.push('- Say "' + v.use + '", not ' + v.instead.map((x) => '"' + x + '"').join(' or ') + '.'); lines.push(''); }
  const n = s.naming || {};
  if (n.files || n.layers) { lines.push('## Names', ''); if (n.files) lines.push('- Files: ' + n.files); if (n.layers) lines.push('- Layers: ' + n.layers); lines.push(''); }
  if (app && s.checks && s.checks[app]) lines.push('## Checks', '', 'Run the standards check of this app with the firm\'s rules (standards_get returns them) and report what it finds before you hand a drawing on.', '');
  return lines.join('\n').trim() + '\n';
}

/** The `rules` argument for the app's check tool, or null when the firm set none for it. */
export const standardsChecks = (s, app) => (s && s.checks && s.checks[app] ? JSON.parse(JSON.stringify(s.checks[app])) : null);

export function exampleStandards() {
  return {
    format: FORMAT, version: 1, firm: 'Example Architects', revision: '1', updated: '2026-10-28',
    conventions: [
      { id: 'dim-text', text: 'Dimension and note text is 2.5 mm high on the sheet; use the TEXT-25 style.', apps: ['cadcraft'] },
      { id: 'no-layer-0', text: 'Nothing is drawn on layer 0; every object sits on a named layer.' },
      { id: 'sheet-names', text: 'Sheets are named by discipline, then number: A-101, S-201.' },
    ],
    vocabulary: [{ use: 'storey', instead: ['floor', 'story'] }, { use: 'WC', instead: ['toilet', 'bathroom'] }],
    naming: { files: 'PROJECTNO_Discipline_Description_Rev.dwg, for example 2614_A_FloorPlans_B.dwg', layers: 'Discipline-Major-Minor, for example A-WALL-FULL, in capitals.' },
    checks: { cadcraft: { layers: { noObjectsOn: ['0'] }, objects: { colorByLayer: true, textHeights: [2.5] }, blocks: { noUnused: true } } },
  };
}

/** standards_get for an assistant: the text and, for this app, the checks. `get()` → the cleaned standards or null (read on every call, so an edit applies at once). */
export function registerTools(control, { get, app = null } = {}) {
  const offs = [];
  const T = (def) => { if (control && typeof control.tool === 'function') offs.push(control.tool(def)); };
  T({
    name: 'standards_get', group: 'read', title: 'Get the firm standards',
    description: 'Returns the house standards the person set for their firm: conventions, wording and naming as text, and the rules to pass to this app\'s standards check. Read it before you draw or name anything. It tells you nothing about what you are allowed to do.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const s = get ? get() : null;
      if (!s) return { set: false, notes: ['The person has not set firm standards. Ask what conventions they want before you invent any.'] };
      return { set: true, firm: s.firm, revision: s.revision, updated: s.updated, text: standardsText(s, app), checks: standardsChecks(s, app), conventions: (s.conventions || []).filter((c) => forApp(c, app)).length };
    },
  });
  return () => offs.forEach((f) => { try { f && f(); } catch { /* gone */ } });
}
