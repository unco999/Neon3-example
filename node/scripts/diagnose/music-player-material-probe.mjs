// Deterministic Pulse material/control-plane probe. Start the music-player
// window case first; this script never creates a GPU device outside Neon3.
import { NeonClient, RenderClient } from "@neon3/sdk";

const uiEndpoint = process.argv[2] ?? "127.0.0.1:39102";
const wgpuEndpoint = process.argv[3] ?? "127.0.0.1:39103";
const capturePath = process.argv[4] ?? "D:\\Neon3SkinProbe\\pulse-material-probe.png";
const emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const ui = new NeonClient(uiEndpoint, { timeoutMs: 5000, kind: "external_host", origin: "pulse-material-probe" });
const wgpu = new NeonClient(wgpuEndpoint, { timeoutMs: 10000, kind: "external_host", origin: "pulse-material-probe" });

async function hostSnapshot() {
  let lastError = null;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await ui.call("ui-runtime", "debug.ui.host.snapshot", {}, { raiseForStatus: false });
      if (response.status === "accepted" && response.result?.scalar_inputs) return { attempt, snapshot: response.result };
      lastError = response.error;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(250);
  }
  throw new Error(`host snapshot timeout: ${JSON.stringify(lastError)}`);
}

const valueOf = (snapshot, key) => snapshot.scalar_inputs.values?.[key]?.value?.value;

try {
  const [uiDescription, wgpuDescription, before] = await Promise.all([
    ui.describe("ui-runtime"),
    wgpu.describe("wgpu-runtime"),
    hostSnapshot(),
  ]);
  const renderer = new RenderClient(wgpu);
  const shaderState = await renderer.shaderState();
  const packages = shaderState?.packages ?? [];
  const packageIds = packages.map((item) => item.package_id).sort();
  const capabilities = {
    geometry: wgpuDescription.capabilities.includes("ui.geometry.cut.v1"),
    shaderPackage: wgpuDescription.capabilities.includes("ui.shader.package.v1"),
    material: wgpuDescription.capabilities.includes("ui.shader.material.v1"),
    semanticInput: uiDescription.capabilities.includes("ui.semantic_input.v1"),
  };
  emit({
    probe: "pulse-material.v1",
    stage: "registered",
    input: { ui_endpoint: uiEndpoint, wgpu_endpoint: wgpuEndpoint, expected_packages: ["pulse-glass", "pulse-neon-edge"] },
    frame_sequence: null,
    producer: { registration_packages: packageIds, shader_state: shaderState },
    consumer: { program_revision: before.snapshot.scalar_inputs.program_revision, input_revision: before.snapshot.scalar_inputs.input_revision, current_track: valueOf(before.snapshot, "current_track") },
    capabilities,
  });

  const event = {
    event_id: "pulse-material-probe-play-1",
    kind: "activate",
    intent: "player.transport.play_pause",
    source_node_key: "play-pause",
    payload: {},
    program_revision: before.snapshot.scalar_inputs.program_revision,
    input_revision: before.snapshot.scalar_inputs.input_revision,
    request_id: "pulse-material-probe-play-1",
    idempotency_key: "pulse-material-probe-play-1",
    interaction: { interaction_id: "pulse-material-probe-play-1", sequence: 1, renderer_epoch: 1 },
  };
  const dispatch = await ui.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, { requestId: event.request_id, idempotencyKey: event.idempotency_key, raiseForStatus: false });
  await sleep(500);
  const [after, diagnostics, capture, windowSnapshot] = await Promise.all([
    hostSnapshot(), renderer.diagnostics(), renderer.capture(capturePath)
      .then((value) => ({ available: true, value }))
      .catch((error) => ({ available: false, error: String(error) })),
    wgpu.call("wgpu-runtime", "debug.window.input.snapshot", {}, { raiseForStatus: false })
      .then((response) => response.status === "accepted" ? response.result : { error: response.error })
      .catch((error) => ({ error: String(error) })),
  ]);
  const shellFrame = windowSnapshot?.shell_frame;
  const shellPass = shellFrame?.status === "paired"
    && shellFrame.consumer_coordinate_space === "window-local"
    && Array.isArray(shellFrame.consumer_region_physical)
    && shellFrame.consumer_region_physical.length === 8
    && shellFrame.producer_bounds_logical?.[0] === 8
    && shellFrame.producer_bounds_logical?.[1] === 8;
  const pass = dispatch.status === "accepted"
    && capabilities.geometry && capabilities.shaderPackage && capabilities.material && capabilities.semanticInput
    && packageIds.join(",") === "pulse-glass,pulse-neon-edge"
    && valueOf(after.snapshot, "current_track") === "astral-crown"
    && valueOf(after.snapshot, "is_playing") === true
     && diagnostics?.fragment_count === 1
     && shellPass
     && (capture.available || shellPass);
  emit({
    probe: "pulse-material.v1",
    stage: "rendered",
    input: { intent: event.intent, source_node_key: event.source_node_key, interaction_sequence: event.interaction.sequence },
    frame_sequence: capture.available ? capture.value?.frame_sequence ?? null : null,
    producer: { dispatch_status: dispatch.status, packages: packageIds },
    consumer: { input_revision: after.snapshot.scalar_inputs.input_revision, current_track: valueOf(after.snapshot, "current_track"), is_playing: valueOf(after.snapshot, "is_playing") },
    renderer: {
      fragment_count: diagnostics?.fragment_count,
      surface_alpha_mode: windowSnapshot?.window_backdrop?.surface_alpha_mode ?? diagnostics?.surface_alpha_mode,
      window_backdrop: windowSnapshot?.window_backdrop ?? null,
      shell_frame: shellFrame,
      diagnostics,
      capture,
    },
    result: pass ? "passed" : "failed",
    pass,
  });
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  emit({ probe: "pulse-material.v1", stage: "error", input: { ui_endpoint: uiEndpoint, wgpu_endpoint: wgpuEndpoint }, result: "failed", pass: false, error: String(error) });
  process.exitCode = 1;
}
