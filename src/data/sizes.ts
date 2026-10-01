import type { Unit } from '../lib/fit/units';

export interface SizeLanding {
  slug: string; // "200kb"
  value: number;
  unit: Unit;
  label: string; // "200 KB"
}

const make = (value: number, unit: Unit): SizeLanding => ({
  slug: `${value}${unit.toLowerCase()}`,
  value,
  unit,
  label: `${value} ${unit}`,
});

export const PDF_SIZES: SizeLanding[] = [
  make(50, 'KB'), make(100, 'KB'), make(150, 'KB'), make(200, 'KB'), make(300, 'KB'),
  make(500, 'KB'), make(1, 'MB'), make(2, 'MB'), make(5, 'MB'),
];

export const IMAGE_SIZES: SizeLanding[] = [
  make(20, 'KB'), make(50, 'KB'), make(100, 'KB'), make(150, 'KB'), make(200, 'KB'),
  make(300, 'KB'), make(500, 'KB'), make(1, 'MB'), make(2, 'MB'),
];
