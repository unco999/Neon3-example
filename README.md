# Neon3 背包案例

<p align="center">
  <img src="assets/neon3-example-logo.png" width="88" alt="Neon3" />
</p>

<p align="center">
  <a href="README.md"><strong>中文</strong></a> ·
  <a href="README.en.md">English</a>
</p>

<p align="center"><strong>可直接运行的 Python / Node.js 背包交互案例</strong><br />
16 / 20 / 24 格 · 苹果与维修锤 · 拖拽移动 · 占用交换 · Tooltip · Nine Slice</p>

<p align="center"><img src="readme.png" width="920" alt="Neon3 项目总览" /></p>

## 快速开始

### Python 窗口

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
.\.venv\Scripts\python.exe python\inventory.py
```

操作：将苹果或维修锤拖到空格；拖到已占用格时会交换；使用右侧按钮切换容量。

### Python 自动验收

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

Node probe 输出固定事件序列和 JSONL 验收结果。

## Runtime

默认使用 Neon3 SDK 解析并下载 GitHub Releases 的最新 runtime，不需要手动填写版本号。

```powershell
# 可选：代理
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"

# 可选：固定版本，用于复现问题
$env:NEON3_RUNTIME_VERSION = "vX.Y.Z"
$env:NEON_PROFILE = "release"
```

也可以设置 `NEON_ROOT` 使用本地 runtime checkout。`debug` runtime 可用于 capture；`release`
环境中 capture 不可用时只会产生 warning，不影响状态和交互验收。

## 目录

```text
fixtures/inventory-contract.json  # Python / Node 共用业务契约
python/inventory.py               # Python 窗口与真实 runtime probe
python/domain.py                  # Python 领域规则
node/src/                         # Node TypeScript 案例
assets/                           # 图片与演示素材
```

## 依赖

- Python: `neon3-sdk==0.1.4`
- Node.js: `@neon3/sdk==0.1.4`
- Node.js: `>=18`

## 相关项目

- [Neon3 Runtime](https://github.com/unco999/Neon3-CiJian)
- [Neon3 SDK](https://github.com/unco999/Neon3Sdk)
- [PyPI: neon3-sdk](https://pypi.org/project/neon3-sdk/)
- [npm: @neon3/sdk](https://www.npmjs.com/package/@neon3/sdk)
