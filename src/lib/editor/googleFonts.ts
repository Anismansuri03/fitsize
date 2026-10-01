// The "More fonts" list in the PDF editor: real Google Fonts, embedded for real in the saved PDF
// (not just pictures of text). Each is a plain .woff file under /fonts/, small enough to fetch on demand.

export interface GoogleFontDef {
  key: string;
  label: string;
  cssFamily: string;
  group: 'handwriting' | 'sans' | 'serif';
  hasItalic: boolean;
}

export const GOOGLE_FONTS: GoogleFontDef[] = [
  { key: 'inter', label: 'Inter', cssFamily: 'Fitsize Inter', group: 'sans', hasItalic: true },
  { key: 'roboto', label: 'Roboto', cssFamily: 'Fitsize Roboto', group: 'sans', hasItalic: true },
  { key: 'poppins', label: 'Poppins', cssFamily: 'Fitsize Poppins', group: 'sans', hasItalic: true },
  { key: 'playfair', label: 'Playfair Display', cssFamily: 'Fitsize Playfair', group: 'serif', hasItalic: true },
  { key: 'merriweather', label: 'Merriweather', cssFamily: 'Fitsize Merriweather', group: 'serif', hasItalic: true },
  { key: 'caveat', label: 'Caveat (handwriting)', cssFamily: 'Fitsize Caveat', group: 'handwriting', hasItalic: false },
];

export const isGoogleFont = (key: string): boolean => GOOGLE_FONTS.some((f) => f.key === key);
export const googleFontDef = (key: string) => GOOGLE_FONTS.find((f) => f.key === key);

/** The .woff file to use for a given weight/style, falling back sensibly when a style is missing. */
export function fontFileFor(key: string, bold: boolean, italic: boolean): string {
  const def = googleFontDef(key);
  const useItalic = italic && !!def?.hasItalic;
  const weight = bold ? '700' : '400';
  return `/fonts/${key}-${weight}${useItalic ? 'i' : ''}.woff`;
}

let loaded: Promise<void> | null = null;

/** Makes the @font-face rules available; safe to call many times. */
export function loadGoogleFontStylesheet(): Promise<void> {
  loaded ??= new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/fonts/fonts.css';
    link.onload = () => resolve();
    link.onerror = () => resolve(); // don't block editing if this ever 404s
    document.head.appendChild(link);
  });
  return loaded;
}

/** Waits until the browser can actually draw this weight/style, so on-screen sizing is correct immediately. */
export async function ensureFontReady(key: string, bold: boolean, italic: boolean): Promise<void> {
  await loadGoogleFontStylesheet();
  const def = googleFontDef(key);
  if (!def) return;
  const style = italic && def.hasItalic ? 'italic ' : '';
  try {
    await document.fonts.load(`${style}${bold ? '700' : '400'} 32px "${def.cssFamily}"`);
  } catch { /* best effort */ }
}
