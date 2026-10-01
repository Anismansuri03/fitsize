import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../../lib/pdf/pdfjs';
import { emptyHistory, historyReducer } from '../../lib/editor/history';
import type { Annot, BoxAnn, Doc, FontKey, PageRef, TextAnn, VectorAnn } from '../../lib/editor/types';
import { pageSize } from '../../lib/editor/types';
import { MARK_PATHS, arrowPaths, pointsBBox, thin } from '../../lib/editor/geometry';
import type { Pt } from '../../lib/editor/geometry';
import { measureText } from '../../lib/editor/canvasPaint';
import { ensureFontReady, isGoogleFont } from '../../lib/editor/googleFonts';
import { exportPdf } from '../../lib/editor/exportPdf';
import { baseName, bytesToBlob, downloadBlob } from '../../lib/download';
import { formatBytes } from '../../lib/fit/units';
import { friendlyError, isAbort } from '../../lib/worker-rpc';
import type { IconName } from '../../data/icons';
import { ACCEPT_PDF, Dropzone, Icon, Notice, PrivacyNote, ProgressBar, Segmented } from '../ui';
import PageView from './PageView';
import Sidebar from './Sidebar';
import SignModal from './SignModal';
import type { Signature } from './SignModal';
import { HIGHLIGHT_COLORS, INK_COLORS, SHAPES, Stepper, Swatches, TextControls } from './Options';
import type { Ctl, DragState, ShapeKind, TextStyle, ToolId } from './ctl';

interface Source {
  name: string;
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
}

let counter = 0;
const uid = (p: string) => `${p}${++counter}${Math.random().toString(36).slice(2, 6)}`;

type ToolDef = { id: ToolId | 'image' | 'sign'; label: string; icon: IconName };
const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', icon: 'cursor' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'image', label: 'Picture', icon: 'photo' },
  { id: 'sign', label: 'Sign', icon: 'sign' },
  { id: 'draw', label: 'Draw', icon: 'draw' },
  { id: 'highlight', label: 'Highlight', icon: 'highlight' },
  { id: 'shape', label: 'Shapes', icon: 'shapes' },
  { id: 'stamp', label: 'Tick / cross', icon: 'check' },
  { id: 'whiteout', label: 'Whiteout', icon: 'eraser' },
  { id: 'redact', label: 'Redact', icon: 'redact' },
];

const HINTS: Record<ToolId, string> = {
  select: 'Click or tap anything to move it or change it. Double-click text to edit it.',
  text: 'Click or tap the page where you want to type.',
  draw: 'Press and drag on the page to draw.',
  highlight: 'Drag over the part you want to highlight.',
  shape: 'Drag on the page to draw your shape.',
  stamp: 'Click or tap where you want the mark.',
  whiteout: 'Drag over anything you want to cover in white. The hidden text is still inside the file: use Redact for private details.',
  redact: 'Drag over private details to remove them for good.',
};

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

async function prepareImage(file: File) {
  const bmp = await createImageBitmap(file); // also applies the photo's rotation
  const bw = bmp.width, bh = bmp.height;
  const k = Math.min(1, 2400 / Math.max(bw, bh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bw * k));
  c.height = Math.max(1, Math.round(bh * k));
  const ctx = c.getContext('2d')!;
  const jpeg = /jpe?g/i.test(file.type);
  if (jpeg) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('picture'))), jpeg ? 'image/jpeg' : 'image/png', 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: (jpeg ? 'image/jpeg' : 'image/png') as 'image/jpeg' | 'image/png', ratio: c.height / c.width, widthPt: bw * 0.75 };
}

export default function PdfEditor() {
  const [sources, setSources] = useState<Source[]>([]);
  const sourcesRef = useRef<Source[]>([]);
  const [hist, dispatch] = useReducer(historyReducer, undefined, () => emptyHistory());
  const histRef = useRef(hist);
  histRef.current = hist;
  const doc = hist.present;

  const [tool, setToolState] = useState<ToolId>('select');
  const [shape, setShape] = useState<ShapeKind>('rect');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [textStyle, setTextStyle] = useState<TextStyle>({ font: 'sans', size: 14, color: '#111827', bold: false, italic: false });
  const [pen, setPen] = useState({ color: '#111827', width: 3 });
  const [hl, setHl] = useState(HIGHLIGHT_COLORS[0]);
  const [shapeStyle, setShapeStyle] = useState({ color: '#dc2626', width: 3, fill: false });
  const [stamp, setStamp] = useState<{ kind: 'check' | 'cross'; color: string }>({ kind: 'check', color: '#15803d' });
  const [zoomMul, setZoomMul] = useState(1);
  const [avail, setAvail] = useState(700);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ p: number; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [sideOpen, setSideOpen] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ size: number } | null>(null);
  const [redactTip, setRedactTip] = useState(false);
  const savedRef = useRef<Doc | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const pendingScroll = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const dirty = sources.length > 0 && hist.present !== savedRef.current;

  const isOpen = sources.length > 0;
  useEffect(() => {
    if (!isOpen || !rootRef.current) return;
    const top = rootRef.current.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'auto' }); // the editor becomes the whole view
  }, [isOpen]);

  /* ---------- opening PDFs ---------- */

  const readPdf = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { doc: pdf, close } = await openPdf(bytes);
    const srcIndex = sourcesRef.current.length;
    const refs: PageRef[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      refs.push({ id: uid('pg'), src: srcIndex, index: i - 1, baseRot: ((p.rotate % 360) + 360) % 360, rot: 0, w: vp.width, h: vp.height });
      p.cleanup();
    }
    sourcesRef.current = [...sourcesRef.current, { name: file.name, bytes, doc: pdf, close }];
    setSources(sourcesRef.current);
    return refs;
  };

  const openFirst = async (file: File) => {
    setError(null);
    setBusy('Opening your PDF…');
    try {
      const refs = await readPdf(file);
      const d: Doc = { pages: refs, annots: [] };
      savedRef.current = d;
      dispatch({ type: 'reset', doc: d });
      setCurrentId(refs[0]?.id ?? null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const addPdf = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy('Adding pages…');
    try {
      const refs = await readPdf(file);
      dispatch({
        type: 'do',
        fn: (d) => {
          const at = d.pages.findIndex((p) => p.id === currentId);
          const pages = d.pages.slice();
          pages.splice(at < 0 ? pages.length : at + 1, 0, ...refs);
          return { ...d, pages };
        },
      });
      pendingScroll.current = refs[0].id;
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => () => { sourcesRef.current.forEach((s) => void s.close()); }, []);

  /* ---------- zoom, scrolling, current page ---------- */

  useEffect(() => {
    if (!scrollEl) return;
    const ro = new ResizeObserver(() => setAvail(Math.max(200, scrollEl.clientWidth - 40)));
    ro.observe(scrollEl);
    setAvail(Math.max(200, scrollEl.clientWidth - 40));
    return () => ro.disconnect();
  }, [scrollEl]);

  const maxW = Math.max(300, ...doc.pages.map((p) => pageSize(p).w));
  const fit = Math.min(1.25, Math.max(0.2, avail / maxW)); // 'fit width', but never bigger than 125%
  const zoom = fit * zoomMul;

  const scrollToPage = useCallback((id: string, behavior: ScrollBehavior = 'smooth') => {
    const el = els.current.get(id);
    if (el && scrollEl) scrollEl.scrollTo({ top: el.offsetTop - 16, behavior });
  }, [scrollEl]);

  useEffect(() => {
    if (pendingScroll.current) {
      const id = pendingScroll.current;
      pendingScroll.current = null;
      requestAnimationFrame(() => { scrollToPage(id, 'auto'); setCurrentId(id); });
    }
  }, [doc.pages, scrollToPage]);

  const zoomTick = useRef(0);
  useEffect(() => {
    if (zoomTick.current++ === 0) return;
    if (currentId) requestAnimationFrame(() => scrollToPage(currentId, 'auto'));
  }, [zoomMul]); // eslint-disable-line react-hooks/exhaustive-deps

  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      if (!scrollEl) return;
      const mid = scrollEl.scrollTop + scrollEl.clientHeight / 2;
      for (const p of histRef.current.present.pages) {
        const el = els.current.get(p.id);
        if (el && el.offsetTop <= mid && mid < el.offsetTop + el.offsetHeight + 8) {
          setCurrentId((c) => (c === p.id ? c : p.id));
          return;
        }
      }
    });
  };

  const stepZoom = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => Math.abs(z - zoomMul) < 0.01);
    const at = i < 0 ? ZOOMS.findIndex((z) => z > zoomMul) - (dir > 0 ? 0 : 1) : i + dir;
    setZoomMul(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at))]);
  };

  /* ---------- editing marks ---------- */

  const setTool = (t: ToolId) => {
    if (editingRef.current) finishEdit(editingRef.current.id);
    setToolState(t);
    if (t !== 'select') setSelectedId(null);
    if (t === 'redact') setRedactTip(true);
  };

  const add = (ann: Annot) => dispatch({ type: 'do', fn: (d) => ({ ...d, annots: [...d.annots, ann] }) });

  const updateAnn = (id: string, fn: (a: Annot) => Annot) =>
    dispatch({ type: 'do', fn: (d) => ({ ...d, annots: d.annots.map((a) => (a.id === id ? fn(a) : a)) }) });

  const remove = (id: string) => {
    dispatch({ type: 'do', fn: (d) => ({ ...d, annots: d.annots.filter((a) => a.id !== id) }) });
    setSelectedId(null);
  };

  const beginText = (pageId: string, x: number, y: number) => {
    if (editingRef.current) finishEdit(editingRef.current.id);
    const id = uid('t');
    const m = measureText({ text: '', ...textStyle });
    const ann: TextAnn = { id, pageId, type: 'text', x: Math.max(0, x), y: Math.max(0, y - textStyle.size * 0.6), text: '', ...textStyle, ...m };
    dispatch({ type: 'gestureStart' });
    dispatch({ type: 'live', fn: (d) => ({ ...d, annots: [...d.annots, ann] }) });
    setSelectedId(id);
    setEditing({ id, isNew: true });
    setToolState('select');
  };

  const editText = (id: string) => {
    if (editingRef.current) return;
    dispatch({ type: 'gestureStart' });
    setSelectedId(id);
    setEditing({ id, isNew: false });
  };

  const setText = (id: string, text: string) =>
    dispatch({ type: 'live', fn: (d) => ({ ...d, annots: d.annots.map((a) => (a.id === id && a.type === 'text' ? { ...a, text, ...measureText({ ...a, text }) } : a)) }) });

  function finishEdit(id: string) {
    const ed = editingRef.current;
    if (!ed || ed.id !== id) return;
    editingRef.current = null;
    const a = histRef.current.present.annots.find((x) => x.id === id);
    const empty = !a || a.type !== 'text' || a.text.trim() === '';
    if (empty) {
      if (ed.isNew) dispatch({ type: 'gestureCancel' });
      else {
        dispatch({ type: 'live', fn: (d) => ({ ...d, annots: d.annots.filter((x) => x.id !== id) }) });
        dispatch({ type: 'gestureEnd' });
      }
      setSelectedId(null);
    } else {
      dispatch({ type: 'gestureEnd' });
    }
    setEditing(null);
  }

  const placeStamp = (pageId: string, at: Pt) => {
    const size = 22;
    const ann: VectorAnn = { id: uid('s'), pageId, type: 'vector', x: at[0] - size / 2, y: at[1] - size / 2, w: size, h: size, w0: 20, h0: 20, paths: MARK_PATHS[stamp.kind].map((p) => p.map((q) => [...q] as Pt)), color: stamp.color, width: 2.6 };
    add(ann);
    setSelectedId(ann.id);
    setToolState('select');
  };

  const finishDrag = (pageId: string, d: DragState) => {
    const id = uid('a');
    const x = Math.min(d.start[0], d.cur[0]), y = Math.min(d.start[1], d.cur[1]);
    const w = Math.abs(d.cur[0] - d.start[0]), h = Math.abs(d.cur[1] - d.start[1]);
    const vector = (paths: Pt[][], color: string, width: number): VectorAnn => {
      const bb = pointsBBox(paths);
      const bw = Math.max(bb.w, 1), bh = Math.max(bb.h, 1);
      return { id, pageId, type: 'vector', x: bb.x, y: bb.y, w: bw, h: bh, w0: bw, h0: bh, paths: paths.map((p) => p.map(([px, py]) => [px - bb.x, py - bb.y] as Pt)), color, width };
    };
    const box = (variant: BoxAnn['variant'], p: Partial<BoxAnn>): BoxAnn => ({ id, pageId, type: 'box', variant, x, y, w, h, stroke: null, fill: null, strokeWidth: 0, opacity: 1, ...p });

    if (tool === 'draw') return void add(vector([thin(d.pts, 0.8)], pen.color, pen.width));
    if (tool === 'highlight') return void (w > 4 && h > 4 && add(box('highlight', { fill: hl, opacity: 0.4 })));
    if (tool === 'whiteout') return void (w > 4 && h > 4 && add(box('whiteout', { fill: '#ffffff' })));
    if (tool === 'redact') return void (w > 4 && h > 4 && add(box('redact', { fill: '#000000' })));
    if (tool === 'shape') {
      const st = shapeStyle;
      let ann: Annot | null = null;
      if (shape === 'rect' || shape === 'ellipse') {
        if (w > 4 && h > 4) ann = box(shape, { stroke: st.color, strokeWidth: st.width, fill: st.fill ? st.color : null });
      } else if (Math.hypot(w, h) > 5) {
        ann = vector(shape === 'arrow' ? arrowPaths(d.start, d.cur, st.width) : [[d.start, d.cur]], st.color, st.width);
      }
      if (ann) {
        add(ann);
        setSelectedId(ann.id);
        setToolState('select');
      }
    }
  };

  /* ---------- pages ---------- */

  const rotatePage = (id: string) => dispatch({ type: 'do', fn: (d) => ({ ...d, pages: d.pages.map((p) => (p.id === id ? { ...p, rot: (p.rot + 90) % 360 } : p)) }) });
  const deletePage = (id: string) => {
    dispatch({ type: 'do', fn: (d) => (d.pages.length < 2 ? d : { pages: d.pages.filter((p) => p.id !== id), annots: d.annots.filter((a) => a.pageId !== id) }) });
    setSelectedId(null);
  };
  const movePage = (id: string, dir: -1 | 1) => {
    dispatch({
      type: 'do',
      fn: (d) => {
        const i = d.pages.findIndex((p) => p.id === id);
        const k = i + dir;
        if (i < 0 || k < 0 || k >= d.pages.length) return d;
        const pages = d.pages.slice();
        [pages[i], pages[k]] = [pages[k], pages[i]];
        return { ...d, pages };
      },
    });
    pendingScroll.current = id;
  };
  const addBlank = () => {
    const cur = doc.pages.find((p) => p.id === currentId) ?? doc.pages[doc.pages.length - 1];
    const s = pageSize(cur);
    const ref: PageRef = { id: uid('pg'), src: -1, index: 0, baseRot: 0, rot: 0, w: s.w, h: s.h };
    dispatch({
      type: 'do',
      fn: (d) => {
        const at = d.pages.findIndex((p) => p.id === cur.id);
        const pages = d.pages.slice();
        pages.splice(at + 1, 0, ref);
        return { ...d, pages };
      },
    });
    pendingScroll.current = ref.id;
  };

  /* ---------- pictures and signatures ---------- */

  const placeImage = (bytes: Uint8Array, mime: 'image/png' | 'image/jpeg', ratio: number, widthPt: number) => {
    const page = doc.pages.find((p) => p.id === currentId) ?? doc.pages[0];
    const size = pageSize(page);
    const w = Math.min(widthPt, size.w * 0.8);
    const h = w * ratio;
    let cy = size.h / 2;
    const el = els.current.get(page.id);
    if (el && scrollEl) {
      const sr = scrollEl.getBoundingClientRect(), pr = el.getBoundingClientRect();
      cy = Math.min(size.h - h / 2, Math.max(h / 2, ((sr.top + sr.bottom) / 2 - pr.top) / zoom));
    }
    const ann: Annot = { id: uid('i'), pageId: page.id, type: 'image', x: (size.w - w) / 2, y: cy - h / 2, w, h, bytes, mime };
    add(ann);
    setSelectedId(ann.id);
    setToolState('select');
  };

  const onImageFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const im = await prepareImage(file);
      placeImage(im.bytes, im.mime, im.ratio, Math.min(im.widthPt, 240));
    } catch {
      setError('We couldn’t open that picture. Try a JPG or PNG. (iPhone HEIC photos aren’t supported by most browsers.)');
    }
  };

  const onSign = (s: Omit<Signature, 'id' | 'url'>, fresh: boolean, existing?: Signature) => {
    let use: { bytes: Uint8Array; ratio: number } = s;
    if (fresh) {
      const sig: Signature = { id: uid('sig'), bytes: s.bytes, ratio: s.ratio, url: URL.createObjectURL(new Blob([s.bytes as BlobPart], { type: 'image/png' })) };
      setSignatures((all) => [sig, ...all].slice(0, 4));
      use = sig;
    } else if (existing) use = existing;
    setSignOpen(false);
    placeImage(use.bytes, 'image/png', use.ratio, 170);
  };

  /* ---------- saving ---------- */

  const download = async () => {
    if (editingRef.current) finishEdit(editingRef.current.id);
    setError(null);
    setSavedInfo(null);
    setSaving({ p: 0, note: 'Getting ready…' });
    try {
      // let a just-finished text edit land in state
      await new Promise((r) => setTimeout(r, 30));
      const bytes = await exportPdf(histRef.current.present, sourcesRef.current.map((s) => ({ bytes: s.bytes, pdfjs: s.doc })), { onProgress: (p, note) => setSaving({ p, note }) });
      downloadBlob(bytesToBlob(bytes, 'application/pdf'), `${baseName(sourcesRef.current[0].name)}-edited.pdf`);
      savedRef.current = histRef.current.present;
      setSavedInfo({ size: bytes.byteLength });
    } catch (e) {
      if (!isAbort(e)) setError(friendlyError(e));
    } finally {
      setSaving(null);
    }
  };

  /* ---------- keyboard ---------- */

  const selected = doc.annots.find((a) => a.id === selectedId) ?? null;
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      if (t.tagName === 'TEXTAREA' || (typing && t.tagName === 'INPUT')) return;
      e.preventDefault();
      dispatch({ type: e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (typing || !sourcesRef.current.length) return;
    if (e.key === 'Escape') {
      setSelectedId(null);
      setToolState('select');
    } else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      remove(selected.id);
    } else if (selected && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      updateAnn(selected.id, (a) => ({ ...a, x: a.x + dx, y: a.y + dy }));
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /* ---------- the empty state ---------- */

  if (sources.length === 0) {
    return (
      <div className="tool-col">
        <div className="panel stack">
          <Dropzone accept={ACCEPT_PDF} onFiles={(f) => { setRejected([]); void openFirst(f[0]); }} onReject={setRejected} title="Drop your PDF here" hint="Then add text, sign, draw, highlight, hide details and rearrange pages." buttonLabel="Choose PDF" disabled={!!busy} />
          {busy && <ProgressBar note={busy} />}
          {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <PrivacyNote />
        </div>
      </div>
    );
  }

  /* ---------- the options bar ---------- */

  const applyText = (a: TextAnn, p: Partial<TextStyle>): TextAnn => {
    const n = { ...a, ...p };
    return { ...n, ...measureText(n) };
  };

  // Google Fonts are only fetched once a person actually picks one, then measurements are corrected
  // once the real letterforms are ready (a beat after the font file arrives).
  const useFont = (id: string, font: FontKey, bold: boolean, italic: boolean) => {
    if (!isGoogleFont(font)) return;
    void ensureFontReady(font, bold, italic).then(() => {
      updateAnn(id, (a) => (a.type === 'text' ? { ...a, ...measureText(a) } : a));
    });
  };

  let panel: React.ReactNode = null;
  if (tool === 'select' && selected) {
    if (selected.type === 'text') {
      panel = (
        <TextControls
          font={selected.font} size={selected.size} color={selected.color} bold={selected.bold} italic={selected.italic}
          onChange={(p) => {
            updateAnn(selected.id, (a) => applyText(a as TextAnn, p));
            setTextStyle((s) => ({ ...s, ...p }));
            const next = { ...selected, ...p };
            useFont(selected.id, next.font, next.bold, next.italic);
          }}
        />
      );
    } else if (selected.type === 'vector') {
      panel = (
        <>
          <Swatches colors={INK_COLORS} value={selected.color} label="Colour" onChange={(color) => updateAnn(selected.id, (a) => ({ ...a, color }) as Annot)} />
          <Stepper label="Thickness" value={selected.width} min={1} max={16} onChange={(width) => updateAnn(selected.id, (a) => ({ ...a, width }) as Annot)} />
        </>
      );
    } else if (selected.type === 'box' && (selected.variant === 'rect' || selected.variant === 'ellipse')) {
      panel = (
        <>
          <Swatches colors={INK_COLORS} value={selected.stroke ?? '#dc2626'} label="Colour" onChange={(c) => updateAnn(selected.id, (a) => ({ ...a, stroke: c, fill: (a as BoxAnn).fill ? c : null }) as Annot)} />
          <Stepper label="Thickness" value={selected.strokeWidth} min={1} max={16} onChange={(strokeWidth) => updateAnn(selected.id, (a) => ({ ...a, strokeWidth }) as Annot)} />
          <label className="check check--plain"><input type="checkbox" checked={!!selected.fill} onChange={(e) => updateAnn(selected.id, (a) => ({ ...a, fill: e.target.checked ? (a as BoxAnn).stroke : null }) as Annot)} />Fill</label>
        </>
      );
    } else if (selected.type === 'box' && selected.variant === 'highlight') {
      panel = <Swatches colors={HIGHLIGHT_COLORS} value={selected.fill ?? hl} label="Highlight colour" onChange={(c) => updateAnn(selected.id, (a) => ({ ...a, fill: c }) as Annot)} />;
    }
  } else if (tool === 'text') {
    panel = (
      <TextControls
        {...textStyle}
        onChange={(p) => {
          const next = { ...textStyle, ...p };
          setTextStyle(next);
          void ensureFontReady(next.font, next.bold, next.italic);
        }}
      />
    );
  } else if (tool === 'draw') {
    panel = (
      <>
        <Swatches colors={INK_COLORS} value={pen.color} label="Pen colour" onChange={(color) => setPen((s) => ({ ...s, color }))} />
        <Stepper label="Thickness" value={pen.width} min={1} max={16} onChange={(width) => setPen((s) => ({ ...s, width }))} />
      </>
    );
  } else if (tool === 'highlight') {
    panel = <Swatches colors={HIGHLIGHT_COLORS} value={hl} label="Highlight colour" onChange={setHl} />;
  } else if (tool === 'shape') {
    panel = (
      <>
        <Segmented<ShapeKind> label="Shape" value={shape} onChange={setShape} options={SHAPES} />
        <Swatches colors={INK_COLORS.slice(0, 5)} value={shapeStyle.color} label="Colour" onChange={(color) => setShapeStyle((s) => ({ ...s, color }))} />
        <Stepper label="Thickness" value={shapeStyle.width} min={1} max={16} onChange={(width) => setShapeStyle((s) => ({ ...s, width }))} />
        {(shape === 'rect' || shape === 'ellipse') && <label className="check check--plain"><input type="checkbox" checked={shapeStyle.fill} onChange={(e) => setShapeStyle((s) => ({ ...s, fill: e.target.checked }))} />Fill</label>}
      </>
    );
  } else if (tool === 'stamp') {
    panel = (
      <>
        <Segmented<'check' | 'cross'> label="Mark" value={stamp.kind} onChange={(kind) => setStamp((s) => ({ ...s, kind }))} options={[{ value: 'check', label: 'Tick' }, { value: 'cross', label: 'Cross' }]} />
        <Swatches colors={INK_COLORS.slice(0, 5)} value={stamp.color} label="Colour" onChange={(color) => setStamp((s) => ({ ...s, color }))} />
      </>
    );
  }

  const byPage = new Map<string, Annot[]>();
  for (const a of doc.annots) byPage.set(a.pageId, [...(byPage.get(a.pageId) ?? []), a]);

  const ctl: Ctl = {
    tool, shape, zoom, pen, hl, shapeStyle, selectedId: selected?.id ?? null, editing, scrollEl,
    dispatch, select: (id) => setSelectedId(id), beginText, editText, setText, finishEdit, placeStamp, finishDrag, remove,
    registerEl: (id, el) => { if (el) els.current.set(id, el); else els.current.delete(id); },
  };

  const hint = editing ? 'Type your text. Click anywhere else, or press Esc, when you are done.' : selected && tool === 'select' ? (selected.type === 'text' ? 'Double-click the text to edit it. Drag to move it.' : 'Drag to move. Drag a corner to resize.') : HINTS[tool];
  const pdfs = sources.map((s) => s.doc);

  return (
    <div ref={rootRef} className={`ed${sideOpen ? ' ed--side' : ''}`}>
      <div className="ed__top">
        <button type="button" className="icon-btn ed__sidebtn" onClick={() => setSideOpen((v) => !v)} aria-label="Show pages" aria-pressed={sideOpen}><Icon name="pages" size={20} /></button>
        <span className="ed__file" title={sources[0].name}>{sources[0].name}</span>
        <div className="ed__group">
          <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'undo' })} disabled={!hist.past.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Icon name="undo" size={20} /></button>
          <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'redo' })} disabled={!hist.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Icon name="redo" size={20} /></button>
        </div>
        <div className="ed__group ed__zoom">
          <button type="button" className="icon-btn" onClick={() => stepZoom(-1)} disabled={zoomMul <= ZOOMS[0]} aria-label="Zoom out"><Icon name="zoom-out" size={20} /></button>
          <output className="ed__pct" aria-live="polite">{Math.round(zoomMul * 100)}%</output>
          <button type="button" className="icon-btn" onClick={() => stepZoom(1)} disabled={zoomMul >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in"><Icon name="zoom-in" size={20} /></button>
        </div>
        <button type="button" className="btn btn--fern btn--small ed__save" onClick={download} disabled={!!saving || !!busy}>
          <Icon name="download" size={18} /> Download PDF
        </button>
      </div>

      <div className="ed__tools" role="toolbar" aria-label="Editing tools">
        {TOOLS.map((t) => {
          const isMode = t.id !== 'image' && t.id !== 'sign';
          return (
            <button
              key={t.id}
              type="button"
              className="tool-btn"
              aria-pressed={isMode ? tool === t.id : undefined}
              onClick={() => (t.id === 'image' ? imageInput.current?.click() : t.id === 'sign' ? setSignOpen(true) : setTool(t.id as ToolId))}
            >
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ed__options">
        <p className="ed__hint">{hint}</p>
        {panel && <div className="ed__panel">{panel}</div>}
      </div>

      {(error || savedInfo || (redactTip && tool === 'redact')) && (
        <div className="ed__notice">
          {error && <Notice tone="error"><span>{error}</span><button type="button" className="btn btn--ghost btn--small" onClick={() => setError(null)}>Dismiss</button></Notice>}
          {savedInfo && !error && (
            <Notice tone="ok">
              <span><strong>Saved: {formatBytes(savedInfo.size)}.</strong> Too big for a form? <a href="/compress-pdf/">Compress it to the size you need</a>.</span>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setSavedInfo(null)}>Dismiss</button>
            </Notice>
          )}
          {redactTip && tool === 'redact' && !error && !savedInfo && (
            <Notice>
              <span>Redacted pages are saved as pictures with the black boxes burned in, so the hidden text can’t be recovered. The rest of that page can’t be selected either.</span>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setRedactTip(false)}>Got it</button>
            </Notice>
          )}
        </div>
      )}

      <div className="ed__body">
        <Sidebar
          pages={doc.pages}
          pdfs={pdfs}
          currentId={currentId}
          onGo={(id) => { setCurrentId(id); scrollToPage(id); setSideOpen(false); }}
          onRotate={rotatePage}
          onDelete={deletePage}
          onMove={movePage}
          onAddBlank={addBlank}
          onAddPdf={() => pdfInput.current?.click()}
        />
        <div className="ed__scroll" ref={setScrollEl} onScroll={onScroll} onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ed__pages')) setSelectedId(null); }}>
          <div className="ed__pages">
            {doc.pages.map((p) => (
              <PageView key={p.id} page={p} pdf={p.src >= 0 ? pdfs[p.src] : null} annots={byPage.get(p.id) ?? []} ctl={ctl} />
            ))}
          </div>
        </div>
      </div>

      {(saving || busy) && (
        <div className="ed__busy" role="alert">
          <div className="ed__busycard">
            <ProgressBar value={saving ? saving.p : undefined} note={saving ? saving.note : busy!} />
          </div>
        </div>
      )}

      <input ref={imageInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void onImageFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pdfInput} type="file" accept={ACCEPT_PDF} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void addPdf(e.target.files?.[0]); e.target.value = ''; }} />
      {signOpen && <SignModal saved={signatures} onUse={onSign} onClose={() => setSignOpen(false)} />}
    </div>
  );
}
