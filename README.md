# Neon3 Example

**Neon3** — 把 UI 从应用程序里"拆出来" — 独立进程 · 声明式 · 多语言 · 跨渲染器

![Neon3 Example Logo](assets/neon3-example-logo.png)

Self-contained **inventory UI teaching case**: 16/20/24 grids, drag-and-drop, Tooltip, Nine Slice. Built with Python and the Neon3 SDK.

![Inventory Demo](assets/inventory-demo.gif)

## Project Structure

```
python/inventory.py       # Single-file working example
python/requirements.txt   # Dependencies
node/                     # TypeScript version (planned)
assets/                   # Images, logo, demo GIF
```

## Quick Start

```powershell
git clone https://github.com/unco999/Neon3-example.git
cd Neon3-example
py -m venv .venv
\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
\.venv\Scripts\python.exe python\inventory.py
```

If using a proxy:
```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"
```

Press `Ctrl+C` to exit. The SDK automatically downloads the latest Neon3 runtime. To use a local checkout:

```powershell
$env:NEON_ROOT = "D:\Neon3-CiJian"
$env:NEON_PROFILE = "release"
```

## Automated Verification

```powershell
\.venv\Scripts\python.exe python\inventory.py --probe --out inventory-check.png
```

Success outputs JSONL with resource upload, Flow submission, frame sequence, producer/consumer state, and final `pass_result`.

## Related Projects

- **[Neon3 Runtime](https://github.com/unco999/Neon3-CiJian)** — Core multi-process framework
- **[Neon3 SDK](https://github.com/unco999/Neon3Sdk)** — Python + Node.js client bindings
- **[bevy-nui-plugins](https://github.com/unco999/bevy-nui-plugins)** — Bevy game engine integration
- **[PyPI: neon3-sdk](https://pypi.org/project/neon3-sdk/)** — Python package
- **[npm: @neon3/sdk](https://www.npmjs.com/package/@neon3/sdk)** — Node.js package

## License

Dual-licensed under MIT or Apache 2.0.
