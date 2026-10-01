import { baseName } from '../../lib/download';

export const readBytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
export const base = (f: File) => baseName(f.name);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
