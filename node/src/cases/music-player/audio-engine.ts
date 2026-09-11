/**
 * Neon3 Music Player — Heavy Node Audio Engine
 *
 * Features:
 *   - WAV / MP3 decoding (ffmpeg-static for MP3)
 *   - Direct sound-card output via node-speaker
 *   - Real-time FFT analysis (radix-2 Cooley-Tukey)
 *   - 32-band logarithmic spectrum
 *   - RMS energy, spectral centroid, onset detection
 *   - Play / pause / seek / volume control
 */

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import Speaker from "speaker";
import { decodeNcm, isNcm, type NcmMetadata } from "./ncm-decoder.js";
const require = createRequire(import.meta.url);
const ffmpegPath: string = require("ffmpeg-static");

// ---------------------------------------------------------------------------
// Async ffmpeg decode: input buffer -> raw mono Int16 PCM buffer (non-blocking)
// Output is s16le mono 44100Hz — no WAV header, ready for speaker write.
// ---------------------------------------------------------------------------
function ffmpegDecodeAsync(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-i", "pipe:0",
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ar", "44100",
      "-ac", "1",
      "-nostdin",
      "-loglevel", "error",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; proc.kill("SIGKILL"); reject(new Error("ffmpeg decode timed out after 30s")); }
    }, 30000);
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (e) => { if (!settled) { settled = true; clearTimeout(timeout); reject(e); } });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`ffmpeg decode failed (code ${code}): ${Buffer.concat(errChunks).toString().slice(-400)}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    const writeAndEnd = () => {
      const ok = proc.stdin.write(input);
      if (ok) proc.stdin.end();
      else proc.stdin.once("drain", () => proc.stdin.end());
    };
    if (proc.stdin.writable) writeAndEnd();
    else proc.stdin.once("ready", writeAndEnd);
  });
}

// Convert raw mono Int16 PCM buffer -> DecodedAudio (no per-sample conversion)
function pcmBufferToAudio(pcm: Buffer): DecodedAudio {
  const sampleRate = 44100;
  const totalSamples = Math.floor(pcm.length / 2);
  return { samples: pcm, sampleRate, channels: 1, duration: totalSamples / sampleRate };
}

// ---------------------------------------------------------------------------
// FFT (radix-2 Cooley-Tukey, in-place)
// ---------------------------------------------------------------------------

function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenR = Math.cos(ang);
    const wlenI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wR = 1, wI = 0;
      for (let k = 0; k < len / 2; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + len / 2] * wR - imag[i + k + len / 2] * wI;
        const vI = real[i + k + len / 2] * wI + imag[i + k + len / 2] * wR;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + len / 2] = uR - vR;
        imag[i + k + len / 2] = uI - vI;
        const nwR = wR * wlenR - wI * wlenI;
        wI = wR * wlenI + wI * wlenR;
        wR = nwR;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// WAV decoder
// ---------------------------------------------------------------------------

export interface DecodedAudio {
  samples: Buffer;       // mono Int16 raw PCM (s16le), ready for speaker write
  sampleRate: number;
  channels: number;
  duration: number; // seconds
}

function decodeWav(buffer: Buffer): DecodedAudio {
  if (buffer.toString("ascii", 0, 4) !== "RIFF") throw new Error("not a WAV file");
  let offset = 12;
  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let pcmData: Buffer | null = null;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkId === "fmt ") {
      channels = buffer.readUInt16LE(offset + 2);
      sampleRate = buffer.readUInt32LE(offset + 4);
      bitsPerSample = buffer.readUInt16LE(offset + 14);
    } else if (chunkId === "data") {
      pcmData = buffer.subarray(offset, offset + chunkSize);
    }
    offset += chunkSize + (chunkSize % 2);
  }
  if (!pcmData) throw new Error("WAV has no data chunk");
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(pcmData.length / bytesPerSample / channels);
  // Fast path: already 16-bit mono → return raw buffer directly
  if (bitsPerSample === 16 && channels === 1) {
    return { samples: pcmData, sampleRate, channels: 1, duration: totalSamples / sampleRate };
  }
  // Downmix to 16-bit mono Int16
  const mono = Buffer.alloc(totalSamples * 2);
  for (let i = 0; i < totalSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const idx = (i * channels + ch) * bytesPerSample;
      if (bitsPerSample === 16) sum += pcmData.readInt16LE(idx);
      else if (bitsPerSample === 8) sum += (pcmData[idx] - 128) * 256;
      else if (bitsPerSample === 24) sum += (pcmData[idx] | (pcmData[idx + 1] << 8) | (pcmData[idx + 2] << 16)) / 256;
    }
    mono.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / channels))), i * 2);
  }
  return { samples: mono, sampleRate, channels: 1, duration: totalSamples / sampleRate };
}

// ---------------------------------------------------------------------------
// MP3 decoder (ffmpeg → raw mono Int16 PCM)
// ---------------------------------------------------------------------------

async function decodeMp3(buffer: Buffer): Promise<DecodedAudio> {
  const pcm = await ffmpegDecodeAsync(buffer);
  return pcmBufferToAudio(pcm);
}

// ---------------------------------------------------------------------------
// Generic audio buffer decode (MP3 / FLAC / etc.) via ffmpeg → raw mono Int16
// ---------------------------------------------------------------------------

async function decodeAudioBuffer(buffer: Buffer, format: string): Promise<DecodedAudio> {
  try {
    const pcm = await ffmpegDecodeAsync(buffer);
    return pcmBufferToAudio(pcm);
  } catch (e) {
    throw new Error(`ffmpeg decode (${format}, ${buffer.length} bytes) failed: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// MP3 ID3v2 tag parsing (title / artist / album / cover APIC)
// ---------------------------------------------------------------------------
interface Id3Tags { title?: string; artist?: string; album?: string; cover?: Buffer; }

function syncsafeInt(n: number): number {
  return ((n & 0x7f000000) >>> 3) | ((n & 0x007f0000) >>> 2) | ((n & 0x00007f00) >>> 1) | (n & 0x0000007f);
}

function decodeId3Text(data: Buffer): string {
  if (data.length === 0) return "";
  const enc = data[0];
  const body = data.subarray(1);
  try {
    if (enc === 0) return body.toString("latin1").replace(/\u0000+$/g, "");
    if (enc === 1 || enc === 2) return body.toString("utf16le").replace(/\u0000+$/g, "");
    return body.toString("utf8").replace(/\u0000+$/g, "");
  } catch { return body.toString("utf8").replace(/\u0000+$/g, ""); }
}

function parseApic(data: Buffer): Buffer | null {
  if (data.length < 5) return null;
  const enc = data[0];
  let pos = 1;
  const mimeEnd = data.indexOf(0, pos);
  if (mimeEnd < 0) return null;
  pos = mimeEnd + 2; // skip mime null + picture type byte
  if (enc === 0) {
    const descEnd = data.indexOf(0, pos);
    if (descEnd < 0) return null;
    pos = descEnd + 1;
  } else {
    while (pos < data.length - 1) {
      if (data[pos] === 0 && data[pos + 1] === 0) { pos += 2; break; }
      pos += 2;
    }
  }
  const img = data.subarray(pos);
  return img.length > 0 ? img : null;
}

function parseId3v2(buffer: Buffer): Id3Tags {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "ID3") return {};
  const version = buffer[3];
  const tagSize = syncsafeInt(buffer.readUInt32BE(6));
  const tags: Id3Tags = {};
  let off = 10;
  const end = Math.min(10 + tagSize, buffer.length);
  while (off < end - 10) {
    const fid = buffer.toString("ascii", off, off + 4);
    if (!/^[A-Z0-9]{4}$/.test(fid)) break;
    const fsize = version === 4 ? syncsafeInt(buffer.readUInt32BE(off + 4)) : buffer.readUInt32BE(off + 4);
    if (fsize <= 0 || off + 10 + fsize > buffer.length) break;
    const fdata = buffer.subarray(off + 10, off + 10 + fsize);
    if (fid === "TIT2") tags.title = decodeId3Text(fdata);
    else if (fid === "TPE1") tags.artist = decodeId3Text(fdata);
    else if (fid === "TALB") tags.album = decodeId3Text(fdata);
    else if (fid === "APIC") { const c = parseApic(fdata); if (c) tags.cover = c; }
    off += 10 + fsize;
  }
  return tags;
}

// ---------------------------------------------------------------------------
// FLAC Vorbis comment + picture parsing
// ---------------------------------------------------------------------------
function parseFlacTags(buffer: Buffer): Id3Tags {
  if (buffer.length < 4 || buffer.toString("ascii", 0, 4) !== "fLaC") return {};
  const tags: Id3Tags = {};
  let off = 4;
  while (off < buffer.length - 4) {
    const hdr = buffer.readUInt32BE(off);
    const isLast = (hdr & 0x80000000) !== 0;
    const btype = (hdr & 0x7f000000) >>> 24;
    const bsize = hdr & 0x00ffffff;
    off += 4;
    if (off + bsize > buffer.length) break;
    const blk = buffer.subarray(off, off + bsize);
    if (btype === 4) {
      // VORBIS_COMMENT
      let p = 0;
      const vendorLen = blk.readUInt32LE(p); p += 4 + vendorLen;
      const count = blk.readUInt32LE(p); p += 4;
      for (let i = 0; i < count && p < blk.length - 4; i++) {
        const clen = blk.readUInt32LE(p); p += 4;
        const comment = blk.toString("utf8", p, p + clen); p += clen;
        const eq = comment.indexOf("=");
        if (eq > 0) {
          const k = comment.substring(0, eq).toUpperCase();
          const v = comment.substring(eq + 1);
          if (k === "TITLE") tags.title = v;
          else if (k === "ARTIST") tags.artist = v;
          else if (k === "ALBUM") tags.album = v;
        }
      }
    } else if (btype === 6) {
      // PICTURE: type(4) mimeLen(4)+mime descLen(4)+desc w(4) h(4) depth(4) colors(4) dataLen(4)+data
      let p = 4; // skip picture type
      const mimeLen = blk.readUInt32BE(p); p += 4 + mimeLen;
      const descLen = blk.readUInt32BE(p); p += 4 + descLen;
      p += 16; // width, height, depth, colors
      const dataLen = blk.readUInt32BE(p); p += 4;
      if (p + dataLen <= blk.length) tags.cover = blk.subarray(p, p + dataLen);
    }
    off += bsize;
    if (isLast) break;
  }
  return tags;
}

// ---------------------------------------------------------------------------
// AudioPlayer class
// ---------------------------------------------------------------------------

export interface AudioFrame {
  spectrum: Float32Array; // 32-band, 0..1
  energy: number;         // RMS, 0..1
  centroid: number;       // spectral centroid, 0..1 (normalized)
  bass: number;           // low-frequency energy 0..1
  mid: number;            // mid-frequency energy 0..1
  treble: number;         // high-frequency energy 0..1
  onset: number;          // onset pulse 0..1 (decays)
  beat: number;           // beat pulse 0..1 (decays, triggered on regular intervals)
  mode: number;           // current visual mode 0..4 (auto-switches on beat)
}

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: Buffer | null;  // raw image bytes (jpeg/png)
  format: string;
}

// ---------------------------------------------------------------------------
// AudioPlayer
// ---------------------------------------------------------------------------

const FFT_SIZE = 2048;
const SPECTRUM_BANDS = 32;
const CHUNK_SAMPLES = 512; // samples per write chunk (~11.6ms at 44.1kHz), drain-scheduled

export class AudioPlayer {
  private audio: DecodedAudio | null = null;
  private speaker: Speaker | null = null;
  private positionSamples = 0;
  private playing = false;
  private volume = 0.8;
  private playTimer: NodeJS.Timeout | null = null;
  private startTime = 0; // wall-clock time when playback (re)started
  private lastEnergy = 0;
  private onsetDecay = 0;
  private beatDecay = 0;
  private lastBeatTime = 0;
  private beatCount = 0;
  private currentMode = 0;
  private modeTransition = 0; // 0..1 smooth transition between modes
  public trackMeta: TrackMeta | null = null;

  // Latest analysis frame
  public frame: AudioFrame = {
    spectrum: new Float32Array(SPECTRUM_BANDS),
    energy: 0,
    centroid: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    onset: 0,
    beat: 0,
    mode: 0,
  };

  // Pre-allocated buffers — reused every tick to avoid GC pauses.
  // (Allocating 5 arrays per tick × 43 ticks/sec = ~215 allocs/sec, which
  //  triggers GC every ~0.5s and causes audible stutter.)
  private readonly _fftReal = new Float32Array(FFT_SIZE);
  private readonly _fftImag = new Float32Array(FFT_SIZE);
  private readonly _fftMag = new Float32Array(FFT_SIZE / 2);
  private readonly _analyzeWindow = new Float32Array(FFT_SIZE);
  private readonly _hannWindow = (() => {
    const w = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    return w;
  })();
  private readonly _bandBounds: Array<[number, number]> = (() => {
    const nyquist = 44100 / 2;
    const logMin = Math.log10(20);
    const logMax = Math.log10(nyquist);
    const bounds: Array<[number, number]> = [];
    for (let band = 0; band < SPECTRUM_BANDS; band++) {
      const f0 = Math.pow(10, logMin + (logMax - logMin) * (band / SPECTRUM_BANDS));
      const f1 = Math.pow(10, logMin + (logMax - logMin) * ((band + 1) / SPECTRUM_BANDS));
      const i0 = Math.max(0, Math.floor((f0 / nyquist) * (FFT_SIZE / 2)));
      const i1 = Math.min(FFT_SIZE / 2 - 1, Math.ceil((f1 / nyquist) * (FFT_SIZE / 2)));
      bounds.push([i0, i1]);
    }
    return bounds;
  })();

  /** Swap PCM data without closing the speaker — next tick() plays the new track instantly. */
  swapAudio(audio: DecodedAudio, meta: TrackMeta): void {
    this.audio = audio;
    this.trackMeta = meta;
    this.positionSamples = 0;
    this.startTime = Date.now();
    this.frame.energy = 0; this.frame.onset = 0; this.frame.beat = 0;
    this.lastEnergy = 0; this.onsetDecay = 0; this.beatDecay = 0;
    console.log(`[audio] swapAudio: data swapped, new track=${meta.title}`);
  }

  async loadFile(path: string): Promise<void> {
    // Intentionally NOT calling stop() here: keep the speaker running during
    // decode so the old track keeps playing, then swapAudio cuts over instantly.
    const buffer = await readFile(path);
    const ext = path.toLowerCase().split(".").pop();
    if (ext === "ncm" || isNcm(buffer)) {
      const result = decodeNcm(buffer);
      this.audio = await decodeAudioBuffer(result.audio, result.format);
      this.trackMeta = {
        title: result.metadata.title,
        artist: result.metadata.artist,
        album: result.metadata.album,
        duration: this.audio.duration,
        cover: result.cover,
        format: result.format,
      };
    } else if (ext === "mp3") {
      const id3 = parseId3v2(buffer);
      this.audio = await decodeMp3(buffer);
      const fname = path.split("\\").pop() ?? path;
      this.trackMeta = {
        title: id3.title || fname.replace(/\.mp3$/i, ""),
        artist: id3.artist || "Unknown",
        album: id3.album || "Unknown",
        duration: this.audio.duration,
        cover: id3.cover || null,
        format: "mp3",
      };
    } else if (ext === "wav") {
      this.audio = decodeWav(buffer);
      this.trackMeta = { title: path.split("\\").pop() ?? path, artist: "Unknown", album: "Unknown", duration: this.audio.duration, cover: null, format: "wav" };
    } else if (ext === "flac" || ext === "m4a" || ext === "ogg") {
      const flacTags = ext === "flac" ? parseFlacTags(buffer) : {};
      this.audio = await decodeAudioBuffer(buffer, ext);
      const fname = path.split("\\").pop() ?? path;
      this.trackMeta = {
        title: flacTags.title || fname.replace(/\.(flac|m4a|ogg)$/i, ""),
        artist: flacTags.artist || "Unknown",
        album: flacTags.album || "Unknown",
        duration: this.audio.duration,
        cover: flacTags.cover || null,
        format: ext,
      };
    } else {
      throw new Error(`unsupported format: ${ext}`);
    }
    this.positionSamples = 0;
    console.log(`[audio] loaded ${path}: ${this.audio.duration.toFixed(1)}s, ${this.audio.sampleRate}Hz, meta=${this.trackMeta.title} / ${this.trackMeta.artist}`);
  }

  /** Load from pre-decoded PCM cache (skips file I/O + ffmpeg). Swaps data, keeps speaker. */
  loadFromCache(audio: DecodedAudio, meta: TrackMeta): void {
    this.swapAudio(audio, meta);
    console.log(`[audio] loaded from cache: ${meta.title} / ${meta.artist} (${audio.duration.toFixed(1)}s)`);
  }

  get duration(): number { return this.audio?.duration ?? 0; }
  get decodedAudio(): DecodedAudio | null { return this.audio; }
  get position(): number {
    if (!this.audio || !this.playing) return this.audio ? this.positionSamples / this.audio.sampleRate : 0;
    return Math.min(this.positionSamples / this.audio.sampleRate, (Date.now() - this.startTime) / 1000);
  }
  get isPlaying(): boolean { return this.playing; }

  setVolume(v: number): void { this.volume = Math.max(0, Math.min(1, v)); }

  play(): void {
    if (!this.audio || this.playing) return;
    this.playing = true;
    this.speaker = new Speaker({
      channels: 1,
      bitDepth: 16,
      sampleRate: this.audio.sampleRate,
    });
    // Ensure speaker stops when process exits
    if (!AudioPlayer._exitHandlerInstalled) {
      AudioPlayer._exitHandlerInstalled = true;
      process.on("exit", () => { if (AudioPlayer._active) AudioPlayer._active.stop(); });
      process.on("SIGINT", () => { if (AudioPlayer._active) AudioPlayer._active.stop(); process.exit(0); });
      process.on("SIGTERM", () => { if (AudioPlayer._active) AudioPlayer._active.stop(); process.exit(0); });
    }
    AudioPlayer._active = this;
    this.startTime = Date.now();
    this.tick();
  }

  private static _active: AudioPlayer | null = null;
  private static _exitHandlerInstalled = false;

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
    if (this.speaker) {
      this.speaker.removeAllListeners("drain");
      this.speaker.on("error", () => { /* swallow */ });
      this.speaker.destroy();
      this.speaker = null;
    }
  }

  stop(): void {
    this.pause();
    this.positionSamples = 0;
  }

  seek(seconds: number): void {
    if (!this.audio) return;
    const totalSamples = this.audio.samples.length >> 1;
    this.positionSamples = Math.max(0, Math.min(totalSamples - 1, Math.floor(seconds * this.audio.sampleRate)));
  }

  /** Write one CHUNK_SAMPLES block to the speaker. Returns false at track end. */
  private writeOneChunk(): boolean {
    if (!this.playing || !this.audio || !this.speaker) return false;
    const audio = this.audio;
    const totalSamples = audio.samples.length >> 1;
    const start = this.positionSamples;
    const end = Math.min(start + CHUNK_SAMPLES, totalSamples);
    if (start >= totalSamples) return false;
    const chunk = audio.samples.subarray(start * 2, end * 2); // raw Int16 mono

    // Apply volume (skip copy if volume ~1.0)
    let pcm: Buffer;
    if (this.volume > 0.999) {
      pcm = chunk;
    } else {
      pcm = Buffer.allocUnsafe(chunk.length);
      for (let i = 0; i < chunk.length; i += 2) {
        const s = Math.max(-32768, Math.min(32767, Math.round(chunk.readInt16LE(i) * this.volume)));
        pcm.writeInt16LE(s, i);
      }
    }

    this.positionSamples = end;
    this.speaker.write(pcm);
    // Analyze a full FFT_SIZE window ending at the newly written position
    this.analyze(end);
    return true;
  }

  private tick(): void {
    if (!this.playing || !this.audio || !this.speaker) return;
    const audio = this.audio;
    const totalSamples = audio.samples.length >> 1;

    // Write chunks until we hold ~80ms of PCM ahead of real-time playback.
    // This keeps the WASAPI buffer small (fast track swap) while never
    // underrunning (no stutter). Time-based, not timer-based.
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const playedSamples = elapsedSec * audio.sampleRate;
    const bufferTarget = playedSamples + audio.sampleRate * 0.08; // 80ms ahead

    while (this.positionSamples < bufferTarget && this.positionSamples < totalSamples) {
      if (!this.writeOneChunk()) break;
    }

    if (this.positionSamples >= totalSamples) {
      this.stop();
      return;
    }

    // Re-check in ~10ms. Short interval keeps buffer tight; the while-loop
    // above does the real work so timer precision doesn't matter.
    this.playTimer = setTimeout(() => this.tick(), 10);
  }

  /**
   * Analyze a full FFT_SIZE window ending at `positionSample`.
   * Reads directly from the audio buffer (Int16) → Float32 → Hann → FFT.
   * EMA-smoothed spectrum for stability.
   */
  private analyze(positionSample: number): void {
    if (!this.audio) return;
    const samples = this.audio.samples; // Int16 Buffer
    const totalSamples = samples.length >> 1;
    const real = this._fftReal;
    const imag = this._fftImag;
    const win = this._hannWindow;

    // Window starts FFT_SIZE samples before the current position (clamped)
    const winEnd = Math.min(positionSample, totalSamples);
    const winStart = Math.max(0, winEnd - FFT_SIZE);
    const winLen = winEnd - winStart;

    // Zero-pad and fill the analysis window
    for (let i = 0; i < FFT_SIZE; i++) { real[i] = 0; imag[i] = 0; }
    let rms = 0;
    for (let i = 0; i < winLen; i++) {
      const v = samples.readInt16LE((winStart + i) * 2) / 32768;
      real[i] = v * win[i];
      rms += v * v;
    }
    rms = Math.sqrt(rms / Math.max(1, winLen));

    // FFT (in-place)
    fft(real, imag);
    // Magnitude spectrum (first half)
    const mag = this._fftMag;
    let totalMag = 0;
    let weightedFreq = 0;
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (FFT_SIZE / 4);
      totalMag += mag[i];
      weightedFreq += mag[i] * i;
    }
    // 32-band logarithmic spectrum with EMA smoothing
    const spectrum = this.frame.spectrum;
    let peak = 0.001;
    const EMA_ALPHA = 0.35; // 0 = frozen, 1 = instant
    for (let band = 0; band < SPECTRUM_BANDS; band++) {
      const [i0, i1] = this._bandBounds[band];
      let sum = 0;
      for (let i = i0; i <= i1; i++) sum += mag[i];
      const raw = sum / Math.max(1, i1 - i0 + 1);
      spectrum[band] = spectrum[band] * (1 - EMA_ALPHA) + raw * EMA_ALPHA;
      if (spectrum[band] > peak) peak = spectrum[band];
    }
    // Normalize
    for (let i = 0; i < SPECTRUM_BANDS; i++) spectrum[i] = Math.min(1, spectrum[i] / peak * 0.9);
    // Bass / mid / treble
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      if (i < 8) bass += spectrum[i];
      else if (i < 20) mid += spectrum[i];
      else treble += spectrum[i];
    }
    bass /= 8; mid /= 12; treble /= 12;
    // Spectral centroid (normalized 0..1)
    const centroid = totalMag > 0 ? (weightedFreq / totalMag) / (FFT_SIZE / 2) : 0;
    // Onset detection (energy spike)
    const energyDelta = Math.max(0, rms - this.lastEnergy);
    if (energyDelta > 0.05) this.onsetDecay = 1;
    else this.onsetDecay *= 0.85;
    this.lastEnergy = rms;
    // Beat detection: onset with reasonable interval = beat
    const now = performance.now() / 1000;
    if (this.onsetDecay > 0.8) {
      const interval = now - this.lastBeatTime;
      if (interval > 0.25 && interval < 2.0) {
        this.beatDecay = 1;
        this.beatCount++;
        this.lastBeatTime = now;
        // Switch mode every 4 beats
        if (this.beatCount % 2 === 0) {
          this.currentMode = (this.currentMode + 1) % 5;
        }
      } else if (interval >= 2.0) {
        // Reset if too long since last beat
        this.lastBeatTime = now;
        this.beatCount = 0;
      }
    }
    this.beatDecay *= 0.9;
    // Smooth mode transition
    const targetMode = this.currentMode;
    this.modeTransition += (targetMode - this.modeTransition) * 0.05;
    // Update frame
    this.frame = {
      spectrum,
      energy: Math.min(1, rms * 3),
      centroid,
      bass: Math.min(1, bass),
      mid: Math.min(1, mid),
      treble: Math.min(1, treble),
      onset: this.onsetDecay,
      beat: this.beatDecay,
      mode: this.modeTransition,
    };
  }
}
