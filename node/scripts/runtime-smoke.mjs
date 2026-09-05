// Minimal real-runtime smoke probe with stage tracing to locate hang points.
import { NeonApp, NeonClient } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const APP_FLOW = `version 1
surface surface.smoke revision 1
budget nodes=64 bindings=8 instances=64 text=32 glyphs=256 events=16 clips=8
input clicks i32 default 0
flow smoke-lab
surface smoke overlay w 320 h 200 fill #102030
  text title value "smoke"
  button tick-button h 32 value "tick" event smoke.tick
`;

const started = Date.now();
const mode = process.argv.includes("--windowed") ? "windowed" : "headless";
emit({ stage: "boot", mode, runtime_version: process.env.NEON3_RUNTIME_VERSION ?? "latest" });
const app = await NeonApp.start({ mode, origin: "neon3-smoke-node" });
emit({ stage: "runtime.started", elapsed_ms: Date.now() - started });
try {
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-smoke-node" });
  const desc = await client.describe("ui-runtime");
  emit({ stage: "runtime.described", service: desc.service, epoch: desc.epoch, capabilities: desc.capabilities, pass_result: true });

  emit({ stage: "flow.submitting" });
  let program;
  try {
    program = await app.mountFlow(APP_FLOW, { validate: true });
    emit({ stage: "flow.submitted", surface_id: program.surface_id, revision: program.program_revision.revision, pass_result: true });
  } catch (error) {
    emit({ stage: "flow.submit_failed", error: String(error?.message ?? error), name: error?.name });
    throw error;
  }

  let accepted = 0;
  app.intent("smoke.tick")(() => { app.store?.value("clicks").set((app.store.value("clicks").get()?.value ?? 0) + 1); });
  for (let i = 1; i <= 3; i += 1) {
    emit({ stage: "intent.dispatched", sequence: i, dispatching: true });
    const result = await app.session.dispatchIntent("smoke.tick", {}, { sourceNodeKey: "tick-button" });
    if (result.status === "accepted") accepted += 1;
    emit({ stage: "intent.dispatched", sequence: i, status: result.status, input_revision: result.input_revision, pass_result: result.status === "accepted" });
  }
  const clicks = app.store?.value("clicks").get()?.value ?? 0;
  const passed = accepted === 3 && clicks === 3;
  emit({ stage: "completed", elapsed_ms: Date.now() - started, accepted, clicks, result: passed ? "passed" : "failed", pass_result: passed });
  process.exitCode = passed ? 0 : 1;
} finally {
  emit({ stage: "stopping" });
  await app.stop();
  emit({ stage: "stopped", elapsed_ms: Date.now() - started });
}
