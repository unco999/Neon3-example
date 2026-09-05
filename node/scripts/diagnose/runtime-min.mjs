// Minimal UiClient-only session (no NeonApp): capabilities -> validate -> submit -> intent.
import { RuntimeSession, NeonClient, UiClient, UiSession } from "@neon3/sdk";
import { execSync } from "node:child_process";

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
const guard = (p, ms = 6000, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`manual-timeout-${ms}ms@${label}`)), ms))]);
const liveProcs = () => execSync("powershell -NoProfile -Command \"Get-Process | Where-Object { $_.ProcessName -like 'neon-*' } | Select-Object -ExpandProperty ProcessName\"").toString().trim().split(/\s+/).filter(Boolean);

const runtime = new RuntimeSession({ mode: "windowed", runtimeVersion: "v0.2.3" });
try {
  await runtime.start();
  emit({ stage: "runtime.started", procs: liveProcs() });
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-min", timeoutMs: 3000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);

  try {
    const caps = await guard(ui.capabilities({ refresh: true }), 6000, "capabilities");
    emit({ stage: "capabilities.ok", count: caps.capabilities.size, procs: liveProcs() });
  } catch (e) { emit({ stage: "capabilities.error", error: String(e?.message ?? e), procs: liveProcs() }); }

  try {
    const program = await guard(session.mountFlow(APP_FLOW), 6000, "mountFlow");
    emit({ stage: "mountFlow.ok", surface_id: program.surface_id, revision: program.program_revision.revision });
    const result = await guard(session.dispatchIntent("smoke.tick", {}, { sourceNodeKey: "tick-button" }), 6000, "dispatchIntent");
    emit({ stage: "intent.dispatched", status: result.status, code: result.code, message: result.message, input_revision: result.input_revision });
    const snapshot = await guard(session.refresh(), 6000, "refresh");
    emit({ stage: "refresh.ok", snapshot });
  } catch (e) { emit({ stage: "chain.error", error: String(e?.message ?? e), name: e?.name, procs: liveProcs() }); }
} catch (e) {
  emit({ stage: "fatal", error: String(e?.message ?? e), name: e?.name });
} finally {
  await runtime.stop();
  emit({ stage: "stopped" });
}