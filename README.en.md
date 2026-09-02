# Neon3 Inventory Example

<p align="center">
  <img src="assets/neon3-example-logo.png" width="88" alt="Neon3" />
</p>

<p align="center">
  <a href="README.md">中文</a> ·
  <a href="README.en.md"><strong>English</strong></a>
</p>

<p align="center"><strong>Runnable Python / Node.js inventory interaction example</strong><br />
16 / 20 / 24 slots · Apple and repair hammer · Drag and drop · Occupied-slot swap · Tooltip · Nine Slice</p>

<p align="center"><img src="readme.png" width="920" alt="Neon3 overview" /></p>

## Quick Start

### Python Window

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
.\.venv\Scripts\python.exe python\inventory.py
```

Drag the apple or repair hammer to an empty slot. Dropping on an occupied slot swaps the items.
Use the controls on the right to change capacity.

### Python Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s python -v
.\.venv\Scripts\python.exe python\inventory.py --probe
```

### Node.js

```powershell
Set-Location node
npm ci
npm test
npm run probe
```

The Node probe prints the fixed event sequence and structured JSONL results.

## Runtime

The Neon3 SDK resolves and downloads the latest runtime from GitHub Releases by default.
No version needs to be hard-coded.

```powershell
# Optional proxy
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"

# Optional pin for reproducible debugging
$env:NEON3_RUNTIME_VERSION = "vX.Y.Z"
$env:NEON_PROFILE = "release"
```

Set `NEON_ROOT` to use a local runtime checkout. The `debug` runtime can be used for capture;
when capture is unavailable in `release`, it is reported as a warning and does not invalidate
state or interaction verification.

## Layout

```text
fixtures/inventory-contract.json  # Shared Python / Node contract
python/inventory.py               # Python window and real runtime probe
python/domain.py                  # Python domain rules
node/src/                         # Node TypeScript example
assets/                           # Images and demo media
```

## Dependencies

- Python: `neon3-sdk==0.1.4`
- Node.js: `@neon3/sdk==0.1.4`
- Node.js: `>=18`

## Links

- [Neon3 Runtime](https://github.com/unco999/Neon3-CiJian)
- [Neon3 SDK](https://github.com/unco999/Neon3Sdk)
- [PyPI: neon3-sdk](https://pypi.org/project/neon3-sdk/)
- [npm: @neon3/sdk](https://www.npmjs.com/package/@neon3/sdk)
