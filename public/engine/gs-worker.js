/* Ghostscript runner: a plain (classic) Web Worker.
 *
 * This is deliberately a static file, not bundled: the Ghostscript engine
 * (gs.js + gs.wasm, AGPL-3.0) is served untouched, and this small file only
 * feeds it a PDF and a list of options, then hands back the smaller PDF.
 *
 * Messages in:   { id, op: 'load' | 'run', payload }
 *   load: { pdf: ArrayBuffer }   keep this PDF in memory for the runs that follow
 *   run:  { args: string[] }     run Ghostscript with these command-line arguments
 * Messages out:  { id, kind: 'progress' | 'done' | 'error', ... }
 */
importScripts('gs.js'); // defines a global `Module` factory (Emscripten)

var WASM_APPROX_BYTES = 16177271;
var wasmModule = null;
var input = null;

function send(id, kind, extra, transfer) {
  var msg = { id: id, kind: kind };
  for (var k in extra) msg[k] = extra[k];
  self.postMessage(msg, transfer || []);
}

async function ensureWasm(id) {
  if (wasmModule) return;
  send(id, 'progress', { progress: 0, note: 'Loading the compressor (one time only)…' });
  var res = await fetch('gs.wasm');
  if (!res.ok) throw new Error('Could not load the compressor (error ' + res.status + '). Check your connection and try again.');
  var reader = res.body.getReader();
  var chunks = [];
  var got = 0;
  for (;;) {
    var step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    got += step.value.length;
    send(id, 'progress', { progress: Math.min(0.99, got / WASM_APPROX_BYTES), note: 'Loading the compressor (one time only)…' });
  }
  var bytes = new Uint8Array(got);
  var offset = 0;
  for (var i = 0; i < chunks.length; i++) {
    bytes.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  wasmModule = await WebAssembly.compile(bytes);
}

function explain(logs, code) {
  var text = logs.join('\n');
  if (/password/i.test(text)) return 'This PDF is protected with a password. Remove the password first, then try again.';
  if (/memory|enlarge|allocat/i.test(text)) return 'This PDF is too big for your device to handle. Try a smaller file, or use a computer instead of a phone.';
  if (/error/i.test(text) || code) return 'We couldn’t read this PDF. The file may be damaged.';
  return 'The compressor didn’t produce a file. Please try again.';
}

async function run(args) {
  var logs = [];
  // A fresh engine per run keeps every attempt clean; reusing the compiled
  // module makes creating one fast.
  var gs = await Module({
    noInitialRun: true,
    print: function (t) { logs.push(t); },
    printErr: function (t) { logs.push(t); },
    instantiateWasm: function (imports, receive) {
      WebAssembly.instantiate(wasmModule, imports).then(function (inst) { receive(inst, wasmModule); });
      return {};
    },
  });
  var code = 0;
  try {
    gs.FS.writeFile('/in.pdf', input);
    code = gs.callMain(args);
  } catch (e) {
    code = e && typeof e.status === 'number' ? e.status : -1;
    logs.push(String((e && e.message) || e));
  }
  var out = null;
  try { out = gs.FS.readFile('/out.pdf'); } catch (e) { /* no output */ }
  gs = null;
  if (!out || out.length === 0) throw new Error(explain(logs, code));
  return out;
}

self.onmessage = async function (e) {
  var id = e.data.id;
  try {
    if (e.data.op === 'load') {
      await ensureWasm(id);
      input = new Uint8Array(e.data.payload.pdf);
      send(id, 'done', { result: { ok: true } });
    } else if (e.data.op === 'run') {
      if (!wasmModule || !input) throw new Error('The compressor is not ready yet.');
      var bytes = await run(e.data.payload.args);
      send(id, 'done', { result: { bytes: bytes } }, [bytes.buffer]);
    } else {
      throw new Error('Unknown operation: ' + e.data.op);
    }
  } catch (err) {
    send(id, 'error', { message: err && err.message ? err.message : String(err) });
  }
};
