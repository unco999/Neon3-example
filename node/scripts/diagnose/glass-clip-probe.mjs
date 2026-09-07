// Real windowed acrylic geometric-clip probe.
// Start `case-window music-player` with NEON3_PORT_OFFSET=2400 first.
import { NeonClient, RenderClient } from "@neon3/sdk";

const uiEndpoint = process.argv[2] ?? "127.0.0.1:41502";
const wgpuEndpoint = process.argv[3] ?? "127.0.0.1:41503";
const capturePath = process.argv[4] ?? "D:\\Neon3案例\\shots\\glass-clip-music-player.png";
const emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const ui = new NeonClient(uiEndpoint, {
  timeoutMs: 5000,
  kind: "external_host",
  origin: "glass-clip-probe",
});
const wgpu = new NeonClient(wgpuEndpoint, {
  timeoutMs: 10000,
  kind: "external_host",
  origin: "glass-clip-probe",
});

async function callWindowSnapshot() {
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await wgpu.call("wgpu-runtime", "debug.window.input.snapshot", {}, { raiseForStatus: false });
      if (response.status === "accepted" && response.result) return response.result;
      lastError = response.error ?? response.status;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(250);
  }
  throw new Error(`window snapshot timeout: ${JSON.stringify(lastError)}`);
}

function closeEnough(a, b, tolerance = 1.0) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function sameArray(left, right, tolerance = 1.0) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => Array.isArray(value)
      ? sameArray(value, right[index], tolerance)
      : closeEnough(value, right[index], tolerance));
}

try {
  const [uiDescription, wgpuDescription, before] = await Promise.all([
    ui.describe("ui-runtime"),
    wgpu.describe("wgpu-runtime"),
    callWindowSnapshot(),
  ]);
  const frame = before.shell_frame;
  const producer = frame?.acrylic_bounds_physical;
  const region = frame?.consumer_region_physical;
  const clipVertices = frame?.acrylic_clip_vertices_physical;
  const pass = frame?.status === "paired"
    && Number.isInteger(frame.producer_frame)
    && frame.producer_frame === frame.consumer_frame
    && frame.consumer_coordinate_space === "window-local"
    && Array.isArray(producer) && producer.length === 4
    && Array.isArray(region) && region.length === 8
    && Array.isArray(clipVertices) && clipVertices.length === 8
    && sameArray(region, clipVertices)
    && producer.every((value) => Number.isFinite(value))
    && frame.scale_factor > 0;
  emit({
    probe: "glass-clip",
    stage: "before",
    ui_endpoint: uiEndpoint,
    wgpu_endpoint: wgpuEndpoint,
    capabilities: {
      ui_window: uiDescription.capabilities.includes("debug.window.capture.v1"),
      wgpu_window: wgpuDescription.capabilities.includes("debug.window.capture.v1"),
    },
    shell_frame: frame,
    pass,
  });

  const capture = await new RenderClient(wgpu).capture(capturePath);
  emit({
    probe: "glass-clip",
    stage: "capture",
    capture_path: capturePath,
    capture,
    pass: typeof capture?.checksum?.value === "string" || capture?.status === "accepted",
  });
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  emit({ probe: "glass-clip", stage: "error", error: String(error), pass: false });
  process.exitCode = 1;
}
