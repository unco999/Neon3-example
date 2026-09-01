# 更新日志

## 0.1.0 — 2026-09-01

### 新增

- 从 Neon3 UI Slicer 迁移独立背包教学案例。
- 使用声明式 NUI Flow 描述背包面板、标题、格子和容量按钮。
- 使用 Python 领域对象维护容量状态和 revision。
- 使用 Neon3 现有 `neon3.rpc` 协议提交 Flow、上传 RGBA 图片并发送 semantic intent。
- 添加 `nine_slice` 面板和格子示例，展示 source inset 与 target border 的关系。
- 添加 `src/inventory_probe.py` 真实可执行探针：固定输入、显式 frame sequence、producer/consumer 值、bounded lifecycle 和 JSONL pass/fail 输出。
- 图片素材改为代码生成的固定 RGBA8 数据，不再读取任何游戏资源目录。

### 运行方式

- 依赖来自在线 PyPI：`neon3-sdk>=0.1.2`。
- 默认由 SDK 解析 GitHub Releases latest runtime 并缓存；也支持用户通过标准 `NEON_ROOT` 环境变量自行指定 runtime。
- 案例不写死 `D:\Neon3`、`E:\game_resouce` 或其他机器路径。

### 验证

- Python 单元测试：2 passed。
- PyPI SDK 安装：`neon3-sdk==0.1.2` 成功。
- 真实 headless runtime/IPC probe：通过；提交 frame sequence 1，容量从 `small` 变为 `medium`，consumer revision 为 1。
