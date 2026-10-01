import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, tools } from '../data/tools';
import type { Tool } from '../data/tools';
import { Icon } from './ui';

/** Header "All tools" dropdown + mobile menu, with a filter box. Works with JS; the Astro <details> fallback (in Base.astro) covers no-JS. */
export default function ToolMenu({ mode, currentPath }: { mode: 'desktop' | 'mobile'; currentPath: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  useEffect(() => { if (!open) setQ(''); }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return tools.filter((t) => t.name.toLowerCase().includes(s) || t.short.toLowerCase().includes(s));
  }, [q]);

  const isCurrent = (slug: string) => currentPath === `/${slug}/` || currentPath.startsWith(`/${slug}-to-`);

  const grid = (list: Tool[]) => (
    <ul className="toolmenu__grid">
      {list.map((t) => (
        <li key={t.slug}>
          <a href={`/${t.slug}/`} aria-current={isCurrent(t.slug) ? 'page' : undefined} onClick={() => setOpen(false)}>
            <Icon name={t.icon} size={18} />
            <span>{t.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );

  const panel = (
    <div className={`toolmenu__panel${mode === 'mobile' ? ' toolmenu__panel--mobile' : ''}`} role="dialog" aria-label="All tools">
      <div className="toolmenu__search">
        <Icon name="search" size={18} />
        <input ref={inputRef} type="text" placeholder="Search tools…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" />
      </div>
      {filtered ? (
        filtered.length ? grid(filtered) : <p className="toolmenu__empty">No tools match “{q}”.</p>
      ) : (
        <div className="toolmenu__cats">
          {CATEGORIES.map((c) => {
            const list = tools.filter((t) => t.category === c.id);
            return (
              <div key={c.id}>
                <h3>{c.label}</h3>
                {grid(list)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (mode === 'mobile') {
    return (
      <div className="toolmenu toolmenu--mobile">
        <button type="button" className="btn btn--secondary btn--small toolmenu__trigger" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name="grid" size={16} /> All tools
        </button>
        {open && panel}
      </div>
    );
  }

  return (
    <div className="toolmenu" ref={ref}>
      <button type="button" className="navlink navlink--btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        All tools <Icon name="chevron" size={15} />
      </button>
      {open && panel}
    </div>
  );
}
