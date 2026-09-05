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

### Node 多案例测试套件

库按案例分类放在 `node/src/cases/`，覆盖 10 种实际游戏 UI 场景（背包、商店、技能树、
任务日志、角色属性、聊天、装备栏、合成、组队、设置）：

```powershell
Set-Location node
npm run cases           # L0 领域规则 + L1 静态 Flow 校验（无需 runtime）
npm run cases:runtime   # + L2 真实 runtime（headless，SDK 0.1.5 + runtime v0.2.5）
```

- 案例矩阵：`CASE_MATRIX.md`
- 测试报告（实现问题与底层断点）：`TEST_REPORT.md`
- 输出为 JSONL：`l0.offline` / `l1.static` / `l2.runtime` / `l0.completed` / `summary`

### Node 打开案例窗口

先安装依赖，然后直接将案例 ID 作为参数启动窗口。入口会自动启动本地 Neon3
v0.2.5 的 eventd、WGPU、UI 服务和案例 domain host：

```powershell
Set-Location node
npm ci
$env:NEON_ROOT = "D:\Neon3"
$env:NEON3_RUNTIME_VERSION = "v0.2.5"
$env:NEON_PROFILE = "release"
npm run case:window -- shop
```

不写参数默认打开背包。可用案例 ID：`inventory`、`shop`、`skill-tree`、`quest-log`、
`character`、`chat`、`equipment`、`crafting`、`party`、`settings`。窗口运行期间按 `Ctrl+C` 关闭。
窗口入口默认使用 `v0.2.3`；如本机已准备其他版本，可先设置
`$env:NEON3_RUNTIME_VERSION = "v0.2.5"` 再启动。

### 本批案例

```powershell
npm run case:window -- shop
npm run case:window -- skill-tree
npm run case:window -- quest-log
npm run case:window -- character
npm run case:window -- chat
npm run case:window -- equipment
npm run case:window -- crafting
npm run case:window -- party
npm run case:window -- settings
```

每个窗口都是独立案例：商店、技能树、任务日志、角色属性、聊天、装备栏、合成、组队和设置。
NUI 写法与常见问题请看 [`docs/NUI_USAGE.md`](docs/NUI_USAGE.md)。

## Runtime

默认使用 Neon3 SDK 解析并下载 GitHub Releases 的最新 runtime，不需要手动填写版本号。

```powershell
# 可选：代理
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"

# 可选：固定版本，用于复现问题
$env:NEON3_RUNTIME_VERSION = "v0.2.5"
$env:NEON_PROFILE = "release"
```

也可以设置 `NEON_ROOT` 使用本地 runtime checkout。`debug` runtime 可用于 capture；`release`
环境中 capture 不可用时只会产生 warning，不影响状态和交互验收。

> 注意：runtime v0.2.5 的发行包把二进制放在 zip 根目录，而 SDK 0.1.5 仍按
> `target/release/` 查找——使用 v0.2.5 前需要把三个 exe 复制进
> `%LOCALAPPDATA%\Neon3Sdk\runtime\v0.2.5\target\release\`（详见 `TEST_REPORT.md` §3.1）。
> 另外 v0.2.5 windowed 模式要求 DX12 HAL adapter（远程/虚拟化会话会崩溃），多案例
> L2 探针使用 headless 模式。

## 目录

```text
CASE_MATRIX.md                  # 多案例测试矩阵（10 个游戏 UI 场景表格）
TEST_REPORT.md                  # 测试报告：实现问题与底层断点
fixtures/inventory-contract.json  # Python / Node 共用业务契约
python/inventory.py               # Python 窗口与真实 runtime probe
python/domain.py                  # Python 领域规则
node/src/cases/<case>/            # Node 多案例：inventory/shop/skill-tree/quest-log/character/chat/equipment/crafting/party/settings
node/src/run.ts                   # 三层运行器（L0 领域 / L1 静态 / L2 真实 runtime）
node/src/inventory.ts             # 单案例窗口入口（保留）
node/test/                        # node:test 测试（32 项，含全部案例 L0/L1）
node/scripts/diagnose/            # 环境诊断脚本（runtime 冒烟/挂起定位/version 对比）
assets/                           # 图片与演示素材
```

## 依赖

- Python: `neon3-sdk==0.1.5`
- Node.js: `@neon3/sdk==0.1.5`（npm 最新；多案例套件按此版本测试）
- Node.js: `>=18`

## 相关项目

- [Neon3 Runtime](https://github.com/unco999/Neon3-CiJian)
- [Neon3 SDK](https://github.com/unco999/Neon3Sdk)
- [PyPI: neon3-sdk](https://pypi.org/project/neon3-sdk/)
- [npm: @neon3/sdk](https://www.npmjs.com/package/@neon3/sdk)
