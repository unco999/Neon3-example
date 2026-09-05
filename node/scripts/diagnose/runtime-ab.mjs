// A/B: spawn wgpu from target/release copy vs root, both windowed mode.
import { spawn } from "node:child_process";
import { NeonClient } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const V025 = "C:/Users/10540/AppData/Local/Neon3Sdk/runtime/v0.2.5";
const rootExe = `${V025}/neon-wgpu-runtime.exe`;
const releaseExe = `${V025}/target/release/neon-wgpu-runtime.exe`;

const health = async (endpoint, target, label) => {
  const deadline = Date.now() + 12000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const c = new NeonClient(endpoint, { timeoutMs: 800 });
      const r = await c.call(target, "service.health", {}, { raiseForStatus: false });
      if (r.status === "accepted") { emit({ stage: "health.ok", label, status: r.result?.status }); return; }
      lastError = `status=${r.status}`;
    } catch (e) { lastError = String(e?.message ?? e); }
    await new Promise((r) => setTimeout(r, 200));
  }
  emit({ stage: "health.fail", label, lastError });
};

const run = async (name, exe) => {
  emit({ stage: "ab.start", name, exe });
  const child = spawn(exe, ["--window-server", "127.0.0.1:39403", "127.0.0.1:39402", "--eventd", "127.0.0.1:39401"], { cwd: V025, stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
  child.stdout.on("data", (d) => emit({ stage: "ab.stdout", name, line: d.toString().trim().split("\n").slice(0, 6) }));
  child.stderr.on("data", (d) => emit({ stage: "ab.stderr", name, line: d.toString().trim().split("\n").slice(0, 6) }));
  child.on("exit", (code, signal) => emit({ stage: "ab.exit", name, code, signal }));
  await health("127.0.0.1:39403", "wgpu-runtime", `${name}-wgpu`);
  child.kill();
  await new Promise((r) => setTimeout(r, 2000));
};

await run("root", rootExe);
await run("release", releaseExe);
emit({ stage: "ab.done" });