// Watch when neon-ui-runtime dies inside the NeonApp path and capture exit code.
import { NeonApp } from "@neon3/sdk";
import { execSync } from "node:child_process";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const procs = () => execSync("powershell -NoProfile -Command \"Get-Process | Where-Object { $_.ProcessName -like 'neon-*' } | Select-Object ProcessName,Id | ConvertTo-Json -Compress\"").toString().trim();
const ports = () => execSync("powershell -NoProfile -Command \"Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 39101,39102,39103,39104 } | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress\"").toString().trim();

emit({ stage: "pre.start", procs: procs(), ports: ports() });
const app = await NeonApp.start({ mode: "windowed", origin: "neon3-watch-node", runtimeVersion: "v0.2.3" });
emit({ stage: "app.started", procs: procs(), ports: ports() });
// Hook the raw child processes so we can see exit codes.
for (const child of app.runtime.processes) {
  child.on("exit", (code, signal) => emit({ stage: "child.exit", pid: child.pid, code, signal, name: "unknown" }));
}
try {
  for (let i = 1; i <= 8; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    emit({ stage: "tick", ms: i * 500, procs: procs(), ports: ports() });
  }
} finally {
  await app.stop();
  emit({ stage: "stopped" });
}