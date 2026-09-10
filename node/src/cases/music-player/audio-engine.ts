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
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import Speaker from "speaker";
const require = createRequire(import.meta.url);
const ffmpegPath: string = require("ffmpeg-static");

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

interface DecodedAudio {
  samples: Float32Array; // mono, interleaved down-mix if stereo
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
  const totalSamples = pcmData.length / (bitsPerSample / 8) / channels;
  const mono = new Float32Array(totalSamples);
  const bytesPerSample = bitsPerSample / 8;
  for (let i = 0; i < totalSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const idx = (i * channels + ch) * bytesPerSample;
      let v: number;
      if (bitsPerSample === 16) v = pcmData.readInt16LE(idx) / 32768;
      else if (bitsPerSample === 8) v = (pcmData[idx] - 128) / 128;
      else if (bitsPerSample === 24) {
        v = (pcmData[idx] | (pcmData[idx + 1] << 8) | (pcmData[idx + 2] << 16)) / 8388608;
      } else v = 0;
      sum += v;
    }
    mono[i] = sum / channels;
  }
  return { samples: mono, sampleRate, channels, duration: totalSamples / sampleRate };
}

// ---------------------------------------------------------------------------
// MP3 decoder (lamejs)
// ---------------------------------------------------------------------------

function decodeMp3(buffer: Buffer): DecodedAudio {
  // Use ffmpeg-static to decode MP3 -> WAV (PCM s16le) via stdout pipe
  const result = spawnSync(ffmpegPath, [
    "-i", "pipe:0",        // read MP3 from stdin
    "-f", "wav",           // output WAV format
    "-acodec", "pcm_s16le", // 16-bit PCM
    "-ar", "44100",        // resample to 44.1kHz
    "-ac", "2",            // stereo
    "pipe:1",              // write WAV to stdout
  ], {
    input: buffer,
    encoding: null,        // return Buffer
    maxBuffer: 200 * 1024 * 1024, // 200MB max for long tracks
  });

  if (result.status !== 0) {
    throw new Error(`ffmpeg decode failed: ${result.stderr?.toString()?.slice(-500) || "unknown"}`);
  }

  const wavBuffer = result.stdout as Buffer;
  // Parse WAV header to find PCM data offset
  // WAV: "RIFF" (4) + size (4) + "WAVE" (4) + "fmt " (4) + fmtSize (4) + fmtData (16+) + "data" (4) + dataSize (4) + PCM
  let offset = 12; // skip RIFF header
  while (offset < wavBuffer.length - 8) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      offset += 8;
      break;
    }
    offset += 8 + chunkSize;
  }

  const pcmData = wavBuffer.subarray(offset);
  const channels = 2;
  const sampleRate = 44100;
  const bytesPerSample = 2;
  const totalSamples = Math.floor(pcmData.length / (channels * bytesPerSample));
  const mono = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const idx = (i * channels + ch) * bytesPerSample;
      sum += pcmData.readInt16LE(idx) / 32768;
    }
    mono[i] = sum / channels;
  }
  return { samples: mono, sampleRate, channels, duration: totalSamples / sampleRate };
}

// ---------------------------------------------------------------------------
// Audio analysis results
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
  private lastEnergy = 0;
  private onsetDecay = 0;
  private beatDecay = 0;
  private lastBeatTime = 0;
  private beatCount = 0;
  private currentMode = 0;
  private modeTransition = 0; // 0..1 smooth transition between modes

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

  async loadFile(path: string): Promise<void> {
    this.stop();
    const buffer = await readFile(path);
    const ext = path.toLowerCase().split(".").pop();
    if (ext === "mp3") this.audio = decodeMp3(buffer);
    else if (ext === "wav") this.audio = decodeWav(buffer);
    else throw new Error(`unsupported format: ${ext}`);
    this.positionSamples = 0;
    console.log(`[audio] loaded ${path}: ${this.audio.duration.toFixed(1)}s, ${this.audio.sampleRate}Hz`);
  }

  get duration(): number { return this.audio?.duration ?? 0; }
  get position(): number { return this.audio ? this.positionSamples / this.audio.sampleRate : 0; }
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
    this.tick();
  }

  private static _active: AudioPlayer | null = null;
  private static _exitHandlerInstalled = false;

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
    if (this.speaker) { this.speaker.end(); this.speaker = null; }
  }

  stop(): void {
    this.pause();
    this.positionSamples = 0;
  }

  seek(seconds: number): void {
    if (!this.audio) return;
    this.positionSamples = Math.max(0, Math.min(this.audio.samples.length - 1, Math.floor(seconds * this.audio.sampleRate)));
  }

  private tick(): void {
    if (!this.playing || !this.audio || !this.speaker) return;
    const audio = this.audio;
    const start = this.positionSamples;
    const end = Math.min(start + CHUNK_SAMPLES, audio.samples.length);
    if (start >= audio.samples.length) {
      this.stop();
      return;
    }
    const chunk = audio.samples.subarray(start, end);
    const pcm = Buffer.alloc(chunk.length * 2);
    for (let i = 0; i < chunk.length; i++) {
      const v = Math.max(-1, Math.min(1, chunk[i] * this.volume));
      pcm.writeInt16LE(Math.round(v * 32767), i * 2);
    }
    this.analyze(chunk);
    this.positionSamples = end;
    // Write and schedule next chunk via drain event for smooth playback
    const written = this.speaker.write(pcm);
    if (written) {
      // Buffer not full, schedule next with slight delay to avoid tight loop
      this.playTimer = setTimeout(() => this.tick(), 5);
    } else {
      // Buffer full, wait for drain
      this.speaker.once("drain", () => this.tick());
    }
  }

  private analyze(chunk: Float32Array): void {
    // Apply Hann window
    const real = new Float32Array(FFT_SIZE);
    const imag = new Float32Array(FFT_SIZE);
    const win = 2 * Math.PI / (chunk.length - 1);
    let rms = 0;
    for (let i = 0; i < chunk.length && i < FFT_SIZE; i++) {
      const w = 0.5 * (1 - Math.cos(win * i));
      real[i] = chunk[i] * w;
      rms += chunk[i] * chunk[i];
    }
    rms = Math.sqrt(rms / chunk.length);
    // FFT
    fft(real, imag);
    // Magnitude spectrum (first half)
    const mag = new Float32Array(FFT_SIZE / 2);
    let totalMag = 0;
    let weightedFreq = 0;
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (FFT_SIZE / 4);
      totalMag += mag[i];
      weightedFreq += mag[i] * i;
    }
    // 32-band logarithmic spectrum
    const spectrum = new Float32Array(SPECTRUM_BANDS);
    const nyquist = (this.audio?.sampleRate ?? 44100) / 2;
    const minFreq = 20;
    const maxFreq = nyquist;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    let peak = 0.001;
    for (let band = 0; band < SPECTRUM_BANDS; band++) {
      const f0 = Math.pow(10, logMin + (logMax - logMin) * (band / SPECTRUM_BANDS));
      const f1 = Math.pow(10, logMin + (logMax - logMin) * ((band + 1) / SPECTRUM_BANDS));
      const i0 = Math.max(0, Math.floor((f0 / nyquist) * (FFT_SIZE / 2)));
      const i1 = Math.min(FFT_SIZE / 2 - 1, Math.ceil((f1 / nyquist) * (FFT_SIZE / 2)));
      let sum = 0;
      for (let i = i0; i <= i1; i++) sum += mag[i];
      spectrum[band] = sum / Math.max(1, i1 - i0 + 1);
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
