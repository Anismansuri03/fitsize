// Builds the Ghostscript command line for "shrink the pictures inside this PDF".
// Text and vector drawings are left alone; only embedded pictures are
// downsampled and re-encoded as JPEG.

export interface GsOptions {
  /** Highest picture resolution to keep (dots per inch). */
  dpi: number;
  /** JPEG quality, 1-100. */
  quality: number;
  /** Turn colour pictures into grey. */
  gray?: boolean;
}

/** Ghostscript's JPEG "QFactor" is the JPEG library's quality scale factor / 100. */
export function qualityToQFactor(quality: number): number {
  const q = Math.min(100, Math.max(1, quality));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  return Math.round(scale) / 100;
}

export function buildGsArgs(o: GsOptions): string[] {
  const dpi = Math.max(30, Math.round(o.dpi));
  const qf = qualityToQFactor(o.quality);
  // Black-and-white scans need more resolution to stay readable.
  const mono = Math.min(300, Math.max(150, dpi * 2));
  // Lighter colour detail (4:2:0) saves space once quality is not top-notch.
  const sub = o.quality >= 80 ? '[1 1 1 1]' : '[2 1 1 2]';

  return [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dNOPAUSE',
    '-dBATCH',
    '-dQUIET',
    '-dSAFER',
    '-dSubsetFonts=true',
    '-dEmbedAllFonts=true',
    '-dCompressFonts=true',
    '-dDetectDuplicateImages=true',
    // Without these, pictures that are already JPEG are copied untouched.
    '-dPassThroughJPEGImages=false',
    '-dPassThroughJPXImages=false',
    '-dDownsampleColorImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    `-dColorImageResolution=${dpi}`,
    '-dColorImageDownsampleThreshold=1.0',
    '-dDownsampleGrayImages=true',
    '-dGrayImageDownsampleType=/Bicubic',
    `-dGrayImageResolution=${dpi}`,
    '-dGrayImageDownsampleThreshold=1.0',
    '-dDownsampleMonoImages=true',
    '-dMonoImageDownsampleType=/Subsample',
    `-dMonoImageResolution=${mono}`,
    '-dAutoFilterColorImages=false',
    '-dColorImageFilter=/DCTEncode',
    '-dAutoFilterGrayImages=false',
    '-dGrayImageFilter=/DCTEncode',
    ...(o.gray ? ['-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray'] : []),
    '-sOutputFile=/out.pdf',
    '-c',
    `<< /ColorImageDict << /QFactor ${qf} /Blend 1 /HSamples ${sub} /VSamples ${sub} >> ` +
      `/GrayImageDict << /QFactor ${qf} /Blend 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> >> setdistillerparams`,
    '-f',
    '/in.pdf',
  ];
}

/** Rebuild a damaged PDF: Ghostscript reads whatever it can and writes a clean file.
 *  Pictures are passed through untouched and pages are never auto-rotated. */
export function repairArgs(): string[] {
  return [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.7',
    '-dNOPAUSE',
    '-dBATCH',
    '-dQUIET',
    '-dSAFER',
    '-dAutoRotatePages=/None',
    '-dPassThroughJPEGImages=true',
    '-dPassThroughJPXImages=true',
    '-dDetectDuplicateImages=true',
    '-dColorConversionStrategy=/LeaveColorUnchanged',
    '-sOutputFile=/out.pdf',
    '-f',
    '/in.pdf',
  ];
}
