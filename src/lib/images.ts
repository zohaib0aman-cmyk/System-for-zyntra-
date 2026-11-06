/** Detects common raster image formats from their first bytes (never trust Content-Type). */
export type ImageInfo = { mime: string; ext: string; width: number | null; height: number | null };

export function sniffImage(b: Uint8Array): ImageInfo | null {
  if (b.length < 12) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { mime: "image/png", ext: "png", width: b.length >= 24 ? dv.getUint32(16) : null, height: b.length >= 24 ? dv.getUint32(20) : null };
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg", ...jpegSize(b) };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { mime: "image/gif", ext: "gif", width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  // WEBP: "RIFF....WEBP"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp", width: null, height: null };
  }
  // ICO
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    return { mime: "image/x-icon", ext: "ico", width: b[6] || 256, height: b[7] || 256 };
  }
  return null;
}

function jpegSize(b: Uint8Array): { width: number | null; height: number | null } {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return { width: null, height: null };
}
