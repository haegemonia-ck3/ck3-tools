import { deflateSync } from 'zlib'

/**
 * Minimal DDS reader for CK3 icons, converting to PNG data URLs.
 * Supports uncompressed 24/32-bit (mask-based) and DXT1/3/5.
 * Returns null for anything else (e.g. BC7/DX10) — callers treat that
 * as "no icon".
 */

interface Decoded {
  width: number
  height: number
  rgba: Buffer
}

function decodeUncompressed(
  data: Buffer,
  width: number,
  height: number,
  bpp: number,
  masks: { r: number; g: number; b: number; a: number }
): Buffer | null {
  const bytes = bpp / 8
  if (data.length < width * height * bytes) return null
  const out = Buffer.alloc(width * height * 4)
  const maskToShift = (m: number): [number, number] => {
    if (m === 0) return [0, 0]
    let shift = 0
    while (((m >>> shift) & 1) === 0) shift++
    let bits = 0
    while (((m >>> (shift + bits)) & 1) === 1) bits++
    return [shift, bits]
  }
  const [rs, rb] = maskToShift(masks.r)
  const [gs, gb] = maskToShift(masks.g)
  const [bs, bb] = maskToShift(masks.b)
  const [as, ab] = maskToShift(masks.a)
  const scale = (v: number, bits: number): number =>
    bits === 0 ? 255 : bits >= 8 ? v >>> (bits - 8) : (v * 255) / ((1 << bits) - 1)
  for (let i = 0; i < width * height; i++) {
    let px = 0
    for (let b = 0; b < bytes; b++) px |= data[i * bytes + b] << (8 * b)
    px = px >>> 0
    out[i * 4] = scale((px & masks.r) >>> rs, rb)
    out[i * 4 + 1] = scale((px & masks.g) >>> gs, gb)
    out[i * 4 + 2] = scale((px & masks.b) >>> bs, bb)
    out[i * 4 + 3] = masks.a === 0 ? 255 : scale((px & masks.a) >>> as, ab)
  }
  return out
}

function decode565(c: number): [number, number, number] {
  return [((c >> 11) & 0x1f) * 8.2258, ((c >> 5) & 0x3f) * 4.0476, (c & 0x1f) * 8.2258]
}

function decodeDxt(
  data: Buffer,
  width: number,
  height: number,
  variant: 1 | 3 | 5
): Buffer | null {
  const blockSize = variant === 1 ? 8 : 16
  const bw = Math.max(1, Math.ceil(width / 4))
  const bh = Math.max(1, Math.ceil(height / 4))
  if (data.length < bw * bh * blockSize) return null
  const out = Buffer.alloc(width * height * 4)
  let off = 0
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let alphaBlock: Buffer | null = null
      if (variant !== 1) {
        alphaBlock = data.subarray(off, off + 8)
        off += 8
      }
      const c0 = data.readUInt16LE(off)
      const c1 = data.readUInt16LE(off + 2)
      const lookup = data.readUInt32LE(off + 4)
      off += 8
      const [r0, g0, b0] = decode565(c0)
      const [r1, g1, b1] = decode565(c1)
      const colors: [number, number, number, number][] = [
        [r0, g0, b0, 255],
        [r1, g1, b1, 255],
        c0 > c1 || variant !== 1
          ? [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255]
          : [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255],
        c0 > c1 || variant !== 1 ? [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255] : [0, 0, 0, 0]
      ]
      // DXT5 interpolated alpha
      let a0 = 0
      let a1 = 0
      let alphaBits = 0n
      if (variant === 5 && alphaBlock) {
        a0 = alphaBlock[0]
        a1 = alphaBlock[1]
        alphaBits = 0n
        for (let i = 7; i >= 2; i--) alphaBits = (alphaBits << 8n) | BigInt(alphaBlock[i])
      }
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px
          const y = by * 4 + py
          if (x >= width || y >= height) continue
          const idx = (lookup >>> (2 * (py * 4 + px))) & 3
          const [r, g, b, ca] = colors[idx]
          let a = ca
          if (variant === 3 && alphaBlock) {
            const nib = (alphaBlock[py * 2 + (px >> 1)] >> ((px & 1) * 4)) & 0xf
            a = nib * 17
          } else if (variant === 5) {
            const code = Number((alphaBits >> BigInt(3 * (py * 4 + px))) & 7n)
            if (code === 0) a = a0
            else if (code === 1) a = a1
            else if (a0 > a1) a = ((8 - code) * a0 + (code - 1) * a1) / 7
            else if (code === 6) a = 0
            else if (code === 7) a = 255
            else a = ((6 - code) * a0 + (code - 1) * a1) / 5
          }
          const o = (y * width + x) * 4
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
          out[o + 3] = a
        }
      }
    }
  }
  return out
}

export function decodeDds(buf: Buffer): Decoded | null {
  if (buf.length < 128 || buf.toString('ascii', 0, 4) !== 'DDS ') return null
  const height = buf.readUInt32LE(12)
  const width = buf.readUInt32LE(16)
  if (width === 0 || height === 0 || width > 4096 || height > 4096) return null
  const pfFlags = buf.readUInt32LE(80)
  const fourCC = buf.toString('ascii', 84, 88)
  const data = buf.subarray(128)
  let rgba: Buffer | null = null
  if (pfFlags & 0x4) {
    // Compressed
    if (fourCC === 'DXT1') rgba = decodeDxt(data, width, height, 1)
    else if (fourCC === 'DXT3') rgba = decodeDxt(data, width, height, 3)
    else if (fourCC === 'DXT5') rgba = decodeDxt(data, width, height, 5)
    else return null // DX10/BC7 etc.
  } else if (pfFlags & 0x40) {
    // Uncompressed RGB(A)
    const bpp = buf.readUInt32LE(88)
    if (bpp !== 24 && bpp !== 32) return null
    rgba = decodeUncompressed(data, width, height, bpp, {
      r: buf.readUInt32LE(92),
      g: buf.readUInt32LE(96),
      b: buf.readUInt32LE(100),
      a: pfFlags & 0x1 ? buf.readUInt32LE(104) : 0
    })
  }
  return rgba ? { width, height, rgba } : null
}

// ---------- PNG encoding (pure Node, zlib built-in) ----------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crcBuf])
}

export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

export function ddsToPngDataUrl(buf: Buffer): string | null {
  const decoded = decodeDds(buf)
  if (!decoded) return null
  const png = encodePng(decoded.width, decoded.height, decoded.rgba)
  return `data:image/png;base64,${png.toString('base64')}`
}
