// The built-in PDF fonts (Helvetica, Times, Courier) can only draw "WinAnsi" characters:
// basic Latin, Western European accents and a few symbols. Anything else (Hindi, the rupee sign,
// Arabic, emoji...) is saved as a picture of the text so it looks exactly right.

const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

export function canEncodeWinAnsi(text: string): boolean {
  for (const ch of text) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) continue;
    if (EXTRA.has(ch)) continue;
    return false;
  }
  return true;
}

/** Tabs are not drawable in a PDF text line; swap them for spaces. */
export const cleanForPdf = (text: string) => text.replace(/\r/g, '').replace(/\t/g, '    ');
