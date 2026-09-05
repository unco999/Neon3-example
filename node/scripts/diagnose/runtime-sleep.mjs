// Does ui-runtime die during NeonApp.start itself, or only on first RPC?
import { NeonApp } from "@neon3/sdk";
import { execSync } from "node:child_process";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const procs = () => execSync("powershell -NoProfile -Command \"Get-Process | Where-Object { $_.ProcessName -like 'neon-*' } | Select-Object ProcessName,Id | ConvertTo-Json -Compress\"").toString().trim();

const app = await NeonApp.start({ mode: "headless", origin: "neon3-sleep-node", runtimeVersion: "v0.2.5" });
emit({ stage: "app.started", procs: procs() });
for (const child of app.runtime.processes) {
  child.on("exit", (code, signal) => emit({ stage: "child.exit", pid: child.pid, code, signal }));
}
for (let i = 1; i <= 8; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  emit({ stage: "tick", ms: i * 500, procs: procs() });
}
await app.stop();
emit({ stage: "stopped" });