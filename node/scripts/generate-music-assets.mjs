import { readFile, writeFile } from "node:fs/promises";
import { deflateSync, inflateSync } from "node:zlib";

const root = new URL("../../assets/music-player/", import.meta.url);
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (bytes) => { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([t, data])), data.length + 8); return out; };
const png = (width, height, rgba) => {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), rgba.subarray(y * width * 4, (y + 1) * width * 4)])));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
};

function decode(bytes) {
  let p = 8, width = 0, height = 0; const ids = [];
  while (p < bytes.length) { const n = bytes.readUInt32BE(p); const type = bytes.toString("ascii", p + 4, p + 8); const data = bytes.subarray(p + 8, p + 8 + n); p += n + 12; if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); } if (type === "IDAT") ids.push(data); }
  const raw = inflateSync(Buffer.concat(ids)); const rgba = Buffer.alloc(width * height * 4); let q = 0;
  for (let y = 0; y < height; y += 1) { const filter = raw[q++]; const row = rgba.subarray(y * width * 4, (y + 1) * width * 4); const prev = y ? rgba.subarray((y - 1) * width * 4, y * width * 4) : null; for (let x = 0; x < row.length; x += 1) { const left = x >= 4 ? row[x - 4] : 0; const up = prev?.[x] ?? 0; const ul = x >= 4 ? (prev?.[x - 4] ?? 0) : 0; const value = raw[q++]; const paeth = left + up - ul; const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? (Math.abs(paeth - left) <= Math.abs(paeth - up) && Math.abs(paeth - left) <= Math.abs(paeth - ul) ? left : Math.abs(paeth - up) <= Math.abs(paeth - ul) ? up : ul) : 0; row[x] = (value + predictor) & 255; } }
  return { width, height, rgba };
}

const hero = decode(await readFile(new URL("album-hero-small.png", root)));
for (let p = 0; p < hero.rgba.length; p += 4) { const l = (hero.rgba[p] * 0.24 + hero.rgba[p + 1] * 0.68 + hero.rgba[p + 2] * 0.08) / 255; hero.rgba[p] = Math.round(l * 12); hero.rgba[p + 1] = Math.round(l * 205); hero.rgba[p + 2] = Math.round(l * 92); }
await writeFile(new URL("album-hero-green.png", root), png(hero.width, hero.height, hero.rgba));
await writeFile(new URL("pulse-control.png", root), png(1, 1, Buffer.from([0, 0, 0, 0])));

const size = 24;
const makeIcon = (draw) => { const a = Buffer.alloc(size * size * 4); const put = (x, y, on = true) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const p = (y * size + x) * 4; a[p] = 184; a[p + 1] = 255; a[p + 2] = 60; a[p + 3] = on ? 255 : 0; }; draw(put); return a; };
const line = (put, x1, y1, x2, y2) => { const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); for (let i = 0; i <= steps; i += 1) put(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps)); };
const icons = {
  "icon-menu": (p) => [6, 11, 16].forEach((y) => line(p, 5, y, 19, y)),
  "icon-heart": (p) => { line(p, 5, 8, 8, 5); line(p, 8, 5, 12, 8); line(p, 12, 8, 16, 5); line(p, 16, 5, 19, 8); line(p, 5, 8, 12, 19); line(p, 19, 8, 12, 19); },
  "icon-previous": (p) => { line(p, 6, 5, 6, 19); line(p, 18, 5, 8, 12); line(p, 8, 12, 18, 19); },
  "icon-play": (p) => { line(p, 8, 5, 18, 12); line(p, 18, 12, 8, 19); line(p, 8, 19, 8, 5); },
  "icon-next": (p) => { line(p, 18, 5, 18, 19); line(p, 6, 5, 16, 12); line(p, 16, 12, 6, 19); },
  "icon-shuffle": (p) => { line(p, 5, 7, 8, 7); line(p, 8, 7, 16, 17); line(p, 16, 17, 19, 17); line(p, 16, 14, 19, 17); line(p, 16, 20, 19, 17); line(p, 5, 17, 8, 17); line(p, 8, 17, 12, 12); line(p, 12, 12, 16, 7); line(p, 16, 7, 19, 7); line(p, 16, 4, 19, 7); },
  "icon-repeat": (p) => { line(p, 6, 8, 17, 8); line(p, 17, 8, 14, 5); line(p, 17, 8, 14, 11); line(p, 18, 16, 7, 16); line(p, 7, 16, 10, 13); line(p, 7, 16, 10, 19); },
  "icon-volume": (p) => { line(p, 5, 10, 9, 10); line(p, 9, 10, 14, 6); line(p, 14, 6, 14, 18); line(p, 14, 18, 9, 14); line(p, 9, 14, 5, 14); line(p, 18, 9, 20, 15); },
  "icon-queue": (p) => { [7, 12, 17].forEach((y) => line(p, 5, y, 19, y)); line(p, 5, 4, 5, 20); },
};
for (const [name, draw] of Object.entries(icons)) await writeFile(new URL(`${name}.png`, root), png(size, size, makeIcon(draw)));
