/* qpdf runner: a plain (classic) Web Worker.
 *
 * qpdf (Apache-2.0) edits the structure of a PDF directly (merge, split, rotate, delete pages,
 * lock, unlock) without re-drawing anything, so the content is never degraded.
 *
 * Messages in:   { id, op, payload }
 *   load: { files: [{ name, data: ArrayBuffer }] }   keep these files for the runs that follow
 *   run:  { args: string[], prefix: string }         run qpdf; return every file whose name starts with `prefix`
 * Messages out:  { id, kind: 'progress' | 'done' | 'error', ... }
 */
importScripts('qpdf.js'); // defines a global `Module` factory (Emscripten)

var wasmModule = null;
var store = {};

function send(id, kind, extra, transfer) {
  var msg = { id: id, kind: kind };
  for (var k in extra) msg[k] = extra[k];
  self.postMessage(msg, transfer || []);
}

async function ensureWasm(id) {
  if (wasmModule) return;
  send(id, 'progress', { progress: 0.1, note: 'Getting ready…' });
  var res = await fetch('qpdf.wasm');
  if (!res.ok) throw new Error('Could not load the tool (error ' + res.status + '). Check your connection and try again.');
  wasmModule = await WebAssembly.compile(await res.arrayBuffer());
}

async function run(args, prefix) {
  var logs = [];
  var q = await Module({
    noInitialRun: true,
    print: function (t) { logs.push(t); },
    printErr: function (t) { logs.push(t); },
    instantiateWasm: function (imports, receive) {
      WebAssembly.instantiate(wasmModule, imports).then(function (inst) { receive(inst, wasmModule); });
      return {};
    },
  });
  for (var name in store) q.FS.writeFile('/' + name, store[name]);
  var code = 0;
  try {
    code = q.callMain(args);
  } catch (e) {
    code = e && typeof e.status === 'number' ? e.status : -1;
    logs.push(String((e && e.message) || e));
  }
  var outs = [];
  var names = q.FS.readdir('/');
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (n === '.' || n === '..' || n.indexOf(prefix) !== 0) continue;
    try { outs.push({ name: n, bytes: q.FS.readFile('/' + n) }); } catch (e) { /* not a file */ }
  }
  return { code: code, logs: logs, outs: outs };
}

self.onmessage = async function (e) {
  var id = e.data.id;
  try {
    if (e.data.op === 'load') {
      await ensureWasm(id);
      store = {};
      e.data.payload.files.forEach(function (f) { store[f.name] = new Uint8Array(f.data); });
      send(id, 'done', { result: { ok: true } });
    } else if (e.data.op === 'run') {
      if (!wasmModule) throw new Error('The tool is not ready yet.');
      var r = await run(e.data.payload.args, e.data.payload.prefix || 'out');
      var transfer = r.outs.map(function (o) { return o.bytes.buffer; });
      send(id, 'done', { result: r }, transfer);
    } else {
      throw new Error('Unknown operation: ' + e.data.op);
    }
  } catch (err) {
    send(id, 'error', { message: err && err.message ? err.message : String(err) });
  }
};
