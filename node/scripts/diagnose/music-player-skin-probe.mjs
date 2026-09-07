// Deterministic cross-process + final-composition skin probe.
// Start `case-window music-player` with the matching port offset first.
import { NeonClient, RenderClient } from "@neon3/sdk";

const uiEndpoint = process.argv[2] ?? "127.0.0.1:39902";
const wgpuEndpoint = process.argv[3] ?? "127.0.0.1:39903";
const capturePath = process.argv[4] ?? "D:\\Neon3SkinProbe\\music-player-skin-probe.png";
const emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const ui = new NeonClient(uiEndpoint, {
  timeoutMs: 5000,
  kind: "external_host",
  origin: "music-player-skin-probe",
});
const wgpu = new NeonClient(wgpuEndpoint, {
  timeoutMs: 10000,
  kind: "external_host",
  origin: "music-player-skin-probe",
});

async function snapshot() {
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await ui.call("ui-runtime", "debug.ui.host.snapshot", {}, { raiseForStatus: false });
      if (response.status === "accepted" && response.result?.scalar_inputs) return response.result;
      lastError = response.error;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(250);
  }
  throw new Error(`snapshot timeout: ${JSON.stringify(lastError)}`);
}

const valueOf = (state, key) => state.scalar_inputs.values?.[key]?.value?.value;

try {
  const [uiDescription, wgpuDescription, before] = await Promise.all([
    ui.describe("ui-runtime"),
    wgpu.describe("wgpu-runtime"),
    snapshot(),
  ]);
  const uiHasSkinCapability = uiDescription.capabilities.includes("ui.component_skin.v1");
  const wgpuHasSkinCapability = wgpuDescription.capabilities.includes("ui.component_skin.v1");
  emit({
    probe: "music-player-skin",
    stage: "before",
    ui_endpoint: uiEndpoint,
    wgpu_endpoint: wgpuEndpoint,
    input_revision: before.scalar_inputs.input_revision,
    program_revision: before.scalar_inputs.program_revision,
    capabilities: { ui_component_skin: uiHasSkinCapability, wgpu_component_skin: wgpuHasSkinCapability },
    consumer: { current_track: valueOf(before, "current_track"), is_playing: valueOf(before, "is_playing"), volume: valueOf(before, "volume") },
  });

  const event = {
    event_id: "music-player-skin-probe-1",
    kind: "activate",
    intent: "player.track.play.violet-orbit",
    source_node_key: "play-violet-orbit",
    payload: {},
    program_revision: before.scalar_inputs.program_revision,
    input_revision: before.scalar_inputs.input_revision,
    request_id: "music-player-skin-probe-1",
    idempotency_key: "music-player-skin-probe-1",
    interaction: { interaction_id: "music-player-skin-probe-1", sequence: 1, renderer_epoch: 1 },
  };
  const response = await ui.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, {
    requestId: event.request_id,
    idempotencyKey: event.idempotency_key,
    raiseForStatus: false,
  });
  await sleep(600);
  const [after, diagnostics, capture, windowSnapshot] = await Promise.all([
    snapshot(),
    new RenderClient(wgpu).diagnostics(),
    new RenderClient(wgpu).capture(capturePath),
    wgpu.call("wgpu-runtime", "debug.window.input.snapshot", {}, { raiseForStatus: false }),
  ]);
  const shellSnapshot = windowSnapshot.status === "accepted" ? windowSnapshot.result : null;
  const shellFrame = shellSnapshot?.shell_frame;
  const shellPass = shellFrame?.status === "paired"
    && shellFrame.consumer_coordinate_space === "window-local"
    && Array.isArray(shellFrame.consumer_region_physical)
    && shellFrame.consumer_region_physical.length === 8
    && shellFrame.producer_bounds_logical?.[0] === 8
    && shellFrame.producer_bounds_logical?.[1] === 8;
  const consumer = {
    current_track: valueOf(after, "current_track"),
    is_playing: valueOf(after, "is_playing"),
    volume: valueOf(after, "volume"),
  };
  const pass = response.status === "accepted"
    && uiHasSkinCapability
    && wgpuHasSkinCapability
    && consumer.current_track === "violet-orbit"
    && consumer.is_playing === true
     && diagnostics?.fragment_count === 1
     && shellPass
     && (typeof capture?.checksum?.value === "string" || capture?.error?.includes("capture is only available in debug builds"));
  emit({
    probe: "music-player-skin",
    stage: "after",
    producer: { intent: event.intent, source_node_key: event.source_node_key, interaction_sequence: event.interaction.sequence },
    consumer: { input_revision: after.scalar_inputs.input_revision, program_revision: after.scalar_inputs.program_revision, ...consumer },
    renderer: { diagnostics, capture, shell_frame: shellFrame },
    pass,
  });
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  emit({ probe: "music-player-skin", stage: "error", error: String(error), pass: false });
  process.exitCode = 1;
}
