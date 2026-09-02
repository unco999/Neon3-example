# Neon3 Example

**Neon3** - UI as an independent process: declarative, multi-language, and renderer-independent.

![Neon3 Example Logo](assets/neon3-example-logo.png)

Self-contained inventory UI teaching case: 16/20/24 grids, drag-and-drop, Tooltip, and Nine Slice. Python uses `neon3-sdk==0.1.4`; Node uses `@neon3/sdk@0.1.4`.

![Inventory Demo](assets/inventory-demo.gif)

## Project Structure

```text
python/inventory.py       # Python windowed app and real runtime probe
python/domain.py          # Python inventory rules
node/src/                 # Node TypeScript app, domain, Flow and probe
fixtures/inventory-contract.json
assets/                   # bundled PNG/GIF resources
```

## Python

```powershell
git clone https://github.com/unco999/Neon3-example.git
cd Neon3-example
py -m venv .venv
\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
\.venv\Scripts\python.exe python\inventory.py
```

For a proxy:

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"
```

The SDK resolves the latest available runtime by default. If your runtime checkout or cache has a specific version, select it explicitly:

```powershell
$env:NEON3_RUNTIME_VERSION = "<your-runtime-version>"
$env:NEON_PROFILE = "release"
```

Press `Ctrl+C` to exit. A local runtime checkout can be selected through `NEON_ROOT`.

## Node.js

```powershell
Set-Location node
npm ci
npm test
npm run probe
```

The Node probe emits JSONL for the same five-event domain sequence, producer/consumer values, pairing and diagnostics. `@neon3/sdk@0.1.4` does not expose a Node domain-service host lifecycle, so it emits `runtime_probe_unavailable` as a warning rather than claiming a cross-process runtime pairing was verified.

## Automated Verification

```powershell
\.venv\Scripts\python.exe -m unittest discover -s python -v
\.venv\Scripts\python.exe python\inventory.py --probe --out inventory-check.png
```

The Python probe uses a real runtime and emits JSONL for Flow submission, the fixed select/expand/move/expand/collapse sequence, producer/consumer state and final `pass_result`. Failed probes exit with code 1. Release runtime capture can be unavailable; capture is a warning and never replaces state synchronization or publication verification. `craft` and `discard` are not claimed as UI-verified features.

## Related Projects

- **[Neon3 Runtime](https://github.com/unco999/Neon3-CiJian)** - Core multi-process framework
- **[Neon3 SDK](https://github.com/unco999/Neon3Sdk)** - Python + Node.js client bindings
- **[bevy-nui-plugins](https://github.com/unco999/bevy-nui-plugins)** - Bevy game engine integration
- **[PyPI: neon3-sdk](https://pypi.org/project/neon3-sdk/)** - Python package
- **[npm: @neon3/sdk](https://www.npmjs.com/package/@neon3/sdk)** - Node.js package

## License

Dual-licensed under MIT or Apache 2.0.
