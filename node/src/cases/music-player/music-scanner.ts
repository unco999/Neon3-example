/**
 * Music directory scanner + cover image upload helper.
 *
 * Scans a directory for supported audio files and provides utilities
 * to upload embedded cover art to the Neon3 runtime as RGBA images.
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve, extname, basename } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ffmpegPath: string = require("ffmpeg-static");

const SUPPORTED_EXT = new Set([".mp3", ".wav", ".ncm", ".flac", ".m4a", ".ogg"]);

export interface ScannedTrack {
  key: string;       // stable identifier: track-0, track-1, ...
  path: string;      // absolute file path
  filename: string;  // base filename
  title: string;     // display title (filename without ext initially)
  artist: string;
  album: string;
  duration: number;
  cover: string;     // image resource id (uploaded dynamically, or default)
  liked: boolean;
}

export async function scanMusicDir(dir: string): Promise<ScannedTrack[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const audioFiles = files
    .filter((f) => SUPPORTED_EXT.has(extname(f).toLowerCase()))
    .sort();

  return audioFiles.map((filename, i) => {
    const ext = extname(filename);
    const title = filename.slice(0, filename.length - ext.length);
    return {
      key: `track-${i}`,
      path: resolve(dir, filename),
      filename,
      title,
      artist: "Unknown",
      album: "Unknown",
      duration: 0,
      cover: "album-hero",
      liked: false,
    };
  });
}

// ── Cover image: convert to PNG if needed, decode to RGBA, upload ──

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

async function convertToPng(input: Buffer, inputFormat: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-f", inputFormat,
      "-i", "pipe:0",
      "-vf", "scale=300:300:force_original_aspect_ratio=increase,crop=300:300",
      "-f", "image2",
      "-vcodec", "png",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; proc.kill("SIGKILL"); reject(new Error("ffmpeg cover convert timed out")); }
    }, 15000);
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (e) => { if (!settled) { settled = true; clearTimeout(timeout); reject(e); } });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`ffmpeg cover convert failed: ${Buffer.concat(errChunks).toString().slice(-200)}`));
      else resolve(Buffer.concat(chunks));
    });
    const ok = proc.stdin.write(input);
    if (ok) proc.stdin.end();
    else proc.stdin.once("drain", () => proc.stdin.end());
  });
}

function decodePngRgba(bytes: Buffer): { width: number; height: number; bytes: number[] } {
  if (!isPng(bytes)) throw new Error("cover is not a PNG");
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.toString("ascii", offset, offset + 4); offset += 4;
    const data = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") {
      width = bytes.readUInt32BE(offset - length - 4);
      height = bytes.readUInt32BE(offset - length);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = rows.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? undefined : rows.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev?.[x] ?? 0;
      const ul = x >= channels ? (prev?.[x - channels] ?? 0) : 0;
      const val = raw[src++];
      let pred = 0;
      if (filter === 1) pred = left;
      else if (filter === 2) pred = up;
      else if (filter === 3) pred = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - ul;
        pred = (Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - ul))
          ? left : (Math.abs(p - up) <= Math.abs(p - ul) ? up : ul);
      }
      row[x] = (val + pred) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < rows.length; i += channels, p += 4) {
    rgba[p] = rows[i]; rgba[p + 1] = rows[i + 1]; rgba[p + 2] = rows[i + 2];
    rgba[p + 3] = channels === 4 ? rows[i + 3] : 255;
  }
  return { width, height, bytes: [...rgba] };
}

export async function uploadCoverImage(
  client: { call: (target: string, method: string, params: any, opts?: any) => Promise<any> },
  imageId: string,
  coverBuffer: Buffer,
): Promise<boolean> {
  try {
    let pngBuf: Buffer;
    if (isPng(coverBuffer)) {
      pngBuf = coverBuffer;
    } else if (coverBuffer[0] === 0xff && coverBuffer[1] === 0xd8) {
      pngBuf = await convertToPng(coverBuffer, "mjpeg");
    } else {
      pngBuf = await convertToPng(coverBuffer, "image2");
    }
    const source = decodePngRgba(pngBuf);
    const response = await client.call("ui-runtime", "ui.image.upload", {
      source: { image_id: imageId, media_type: "application/x-neon-rgba8", ...source },
    }, { raiseForStatus: false, idempotencyKey: `cover-${imageId}` });
    return response.status === "accepted";
  } catch (err) {
    console.warn(`[cover] failed to upload ${imageId}:`, err);
    return false;
  }
}
