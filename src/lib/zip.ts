import { zipSync } from 'fflate';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Bundle files into a .zip (no extra compression: pictures and PDFs are already compressed). */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const used = new Map<string, number>();
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) {
    let name = e.name;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n > 0) {
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)}-${n + 1}${name.slice(dot)}` : `${name}-${n + 1}`;
    }
    files[name] = e.data;
  }
  return zipSync(files, { level: 0 });
}
