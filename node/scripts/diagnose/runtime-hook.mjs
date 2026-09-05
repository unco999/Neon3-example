// SDK RuntimeSession + hook child exit codes + capture wgpu death cause.
import { RuntimeSession, NeonClient, UiClient, UiSession } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const FLOW = `version 1
surface surface.smoke revision 1
budget nodes=64 bindings=8 instances=64 text=32 glyphs=256 events=16 clips=8
input clicks i32 default 0
flow smoke-lab
surface smoke overlay w 320 h 200 fill #102030
  text title value "smoke"
  button tick-button h 32 value "tick" event smoke.tick
`;
const guard = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`manual-timeout-${ms}ms@${label}`)), ms))]);

const runtime = new RuntimeSession({ mode: "headless", runtimeVersion: "v0.2.5" });
try {
  await runtime.start();
  emit({ stage: "runtime.started", profile: runtime.activeProfile });
  for (const child of runtime.processes) {
    child.on("exit", (code, signal) => emit({ stage: "child.exit", pid: child.pid, code, signal }));
  }
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-sdk-hook", timeoutMs: 3000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);
  const caps = await guard(ui.capabilities({ refresh: true }), 6000, "capabilities");
  emit({ stage: "capabilities.ok", count: caps.capabilities.size });
  await new Promise((r) => setTimeout(r, 1000));
  emit({ stage: "post-capabilities-wait" });
  try {
    const program = await guard(session.mountFlow(FLOW), 6000, "mountFlow");
    emit({ stage: "mountFlow.ok", surface_id: program.surface_id });
    const result = await guard(session.dispatchIntent("smoke.tick", {}, { sourceNodeKey: "tick-button" }), 6000, "dispatchIntent");
    emit({ stage: "intent.dispatched", status: result.status });
    emit({ stage: "completed", pass_result: result.status === "accepted" });
  } catch (e) {
    emit({ stage: "chain.error", error: String(e?.message ?? e) });
  }
} finally {
  await runtime.stop();
  emit({ stage: "stopped" });
}