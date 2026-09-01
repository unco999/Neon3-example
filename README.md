# Neon3 案例：背包 UI

这是一个可以单独克隆运行的 Neon3 教学案例。它展示：

- 用 Python 生成声明式 NUI Flow；
- 用公开 `neon3.rpc` 协议上传图片和提交 UI；
- 用 typed input frame 驱动容量状态；
- 用 semantic intent 处理“扩大容量”；
- 用 `nine_slice` 绘制可伸缩的背包面板和格子；
- 用 JSONL probe 验证 producer/consumer、revision 和最终结果。

案例**不读取任何本地游戏资源目录**，图片素材由示例代码生成固定的 RGBA
像素数据。Neon3 runtime 由 `neon3-sdk` 按 GitHub Releases 的 latest 版本
自动下载；也可以通过 `NEON_ROOT` 指定用户自己准备的 runtime bundle。

## 快速开始

要求 Python 3.10+。建议使用虚拟环境：

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install neon3-sdk
```

运行 headless 教学探针：

```powershell
.\.venv\Scripts\python.exe -m src.inventory_probe
```

运行交互窗口案例：

```powershell
.\.venv\Scripts\python.exe -m src.inventory_demo
```

默认情况下 SDK 会在线解析并下载最新 Neon3 runtime。需要固定版本时：

```powershell
$env:NEON3_RUNTIME_VERSION = "v0.2.2"
.\.venv\Scripts\python.exe -m src.inventory_probe
```

需要使用本地 checkout 仅用于开发时，可以由用户自行设置：

```powershell
$env:NEON_ROOT = "C:\path\to\your\Neon3"
$env:NEON_PROFILE = "debug"
```

案例源码不会硬编码或扫描该路径；路径只由 SDK 的标准 runtime 配置消费。

## 代码阅读顺序

1. `src/inventory_demo.py`：素材生成、Flow 声明、领域状态和服务启动。
2. `src/inventory_probe.py`：固定输入、bounded polling、JSONL 验收。
3. `src/flow.py`：最小 Flow 字符串，适合先学习 UI 声明语法。

## 协议边界

Python 只负责领域状态和协议 client，不创建 WGPU 对象、不创建窗口、不写
Neon3 项目文件。窗口、GPU texture、buffer、pipeline 和最终合成全部由
`neon-wgpu-runtime` 所有。示例使用已有的 `neon3-sdk`、`neon3.rpc` 和
`neon3.event`/UI runtime API，不添加诊断专用 transport。

## 测试

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

成功的 probe 会输出类似 JSONL：

```json
{"event":"inventory.submit","frame_sequence":1,"producer":{"capacity":"small"},"result":"passed"}
{"event":"inventory.verify","frame_sequence":2,"producer":{"intent":"inventory.capacity.expand"},"consumer":{"capacity":"medium","revision":1},"result":"passed"}
```
