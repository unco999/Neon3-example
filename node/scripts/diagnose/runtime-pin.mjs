// NeonApp headless full-chain trace with child-process exit hooks.
import { NeonApp } from "@neon3/sdk";
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
const procs = () => execSync("powershell -NoProfile -Command \"Get-Process | Where-Object { $_.ProcessName -like 'neon-*' } | Select-Object ProcessName,Id | ConvertTo-Json -Compress\"").toString().trim();

const app = await guard(NeonApp.start({ mode: "headless", origin: "neon3-pin-node", runtimeVersion: "v0.2.5" }), 15000, "app.start");
emit({ stage: "app.started", procs: procs() });
for (const child of app.runtime.processes) {
  child.on("exit", (code, signal) => emit({ stage: "child.exit", pid: child.pid, code, signal }));
}
try {
  const ui = app.ui.client;
  try {
    const caps = await guard(ui.capabilities({ refresh: true }), 6000, "capabilities");
    emit({ stage: "capabilities.ok", count: caps.capabilities.size });
  } catch (e) { emit({ stage: "capabilities.error", error: String(e?.message ?? e), procs: procs() }); }
  try {
    const program = await guard(app.mountFlow(APP_FLOW), 6000, "mountFlow");
    emit({ stage: "mountFlow.ok", surface_id: program.surface_id });
    app.intent("smoke.tick")(() => { app.store?.value("clicks").set((app.store.value("clicks").get()?.value ?? 0) + 1); });
    const result = await guard(app.session.dispatchIntent("smoke.tick", {}, { sourceNodeKey: "tick-button" }), 6000, "dispatchIntent");
    emit({ stage: "intent.dispatched", status: result.status });
    emit({ stage: "completed", pass_result: result.status === "accepted" });
  } catch (e) { emit({ stage: "chain.error", error: String(e?.message ?? e), name: e?.name, procs: procs() }); }
} finally {
  await app.stop();
  emit({ stage: "stopped" });
}