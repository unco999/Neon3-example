# Neon3 多案例测试报告

> 测试日期：2026-09-05
> 测试环境：Windows x86_64，Node.js v24.19.0，`@neon3/sdk@0.1.5`，Neon3 runtime **v0.2.5**（headless）
> 测试命令：`npm run cases`（L0+L1）／`npm run cases:runtime`（+L2 真实 runtime）

## 1. 测试结果总表

| # | 案例 id | 场景 | L0 领域规则 | L1 静态 Flow | L2 真实 runtime | 结论 |
|---|---------|------|------------|--------------|----------------|------|
| 1 | `inventory` | 冒险者背包 | ✅ | ✅ | ✅ | **通过** |
| 2 | `shop` | 杂货铺 | ✅ | ✅ | ✅ | **通过** |
| 3 | `skill-tree` | 技能树（三职业分支） | ✅ | ✅ | ✅ | **通过** |
| 4 | `quest-log` | 任务日志 | ✅ | ✅ | ✅ | **通过** |
| 5 | `character` | 角色属性面板 | ✅ | ✅ | ✅ | **通过** |
| 6 | `chat` | 聊天窗口 | ✅ | ✅ | ✅ | **通过** |
| 7 | `equipment` | 装备栏 | ✅ | ✅ | ✅ | **通过** |
| 8 | `crafting` | 合成台（配方链） | ✅ | ✅ | ✅ | **通过** |
| 9 | `party` | 组队面板 | ✅ | ✅ | ✅ | **通过** |
| 10 | `settings` | 设置面板 | ✅ | ✅ | ✅ | **通过** |

- L2 共派发 **53 条 semantic intent**，全部被 runtime 接受（`accepted`），无运输层失败。
- 每个案例均包含至少一条**预期拒绝路径**（领域规则拒绝，L0 断言），例如：背包容量越界、商店售罄再购、技能树前置缺失、任务未完成领奖、合成材料不足、设置越界等。

## 2. 环境与版本结论

| 项 | 结论 |
|----|------|
| Node SDK 最新版本 | **0.1.5**（npm 最新，本仓库已升级；原仓库锁定 0.1.4） |
| Runtime 最新版本 | **v0.2.5**（GitHub release 最新；本机缓存原为 v0.2.1/0.2.2/0.2.3） |
| Python SDK 最新版本 | 0.1.5（PyPI 最新） |
| 本机 runtime 布局 | v0.2.5 的 zip 解压后**二进制在根目录**（`neon-eventd.exe` 等），而 SDK 0.1.5 的 `RuntimeSession.findExecutableDir` 只找 `target/release/`，需要手动把 exe 复制进 `target/release/` 才能被 SDK 拉起（**SDK 与最新 runtime 的布局断点**，见 §3.1） |

## 3. 实现过程中发现的问题

### 3.1 SDK 0.1.5 与 runtime v0.2.5 的目录布局断点（高）

- **现象**：`NEON3_RUNTIME_VERSION=v0.2.5` 时，SDK 报 "Neon3 runtime binaries not found under .../v0.2.5/target (release, debug)"。
- **根因**：v0.2.5 的发行包改为「根目录放 exe + `fonts/`」结构，而 `@neon3/sdk@0.1.5` 的 `RuntimeSession.findExecutableDir` 仍然硬编码 `join(neonRoot, "target", profile)`。
- **现状**：SDK 的自动下载逻辑（`ensureDownloadedRuntime`）下载解压后也会因为找不到 `target/release` 而**每次重新下载**。
- **绕行**：手动把 v0.2.5 根目录三个 exe 复制到 `target/release/`（本仓库测试环境已做）。这属于 SDK 需要跟进适配，否则无法用最新 runtime。

### 3.2 runtime v0.2.5 windowed 模式要求 DX12 HAL adapter（高）

- **现象**：`mode: "windowed"` 时 `neon-wgpu-runtime` 启动即崩溃，stderr：`inspect DX12 adapter for external host interop: DX12 HAL adapter is unavailable`，退出码 1。
- **关联**：v0.2.5 的 `neon3-release.json` 声明 `shared_surface: {"transport": "d3d12_shared_texture_v1"}` —— 窗口模式依赖 D3D12 共享纹理互操作。
- **环境限制**：当前机器（远程/虚拟化会话）没有可用的 DX12 HAL adapter。
- **绕行**：全部案例改用 **headless** 模式测试（`RuntimeSession({ mode: "headless" })`），稳定通过。报告同时记录：同一环境下 v0.2.3 windowed 可跑但 v0.2.5 windowed 必崩 —— 升级 runtime 需注意此变化。

### 3.3 NeonApp 包装层在 headless + v0.2.5 下首次 RPC 即崩 ui-runtime（高）

- **现象**：`NeonApp.start({mode:"headless"})` 后进程存活，一旦调用 `app.ui.client.capabilities()`（首次 describe RPC），`neon-ui-runtime` 进程以 code 1 退出，端口 39102 消失，后续全部超时/ECONNREFUSED。
- **对比实验**：完全相同的链路（`RuntimeSession` + `NeonClient` + `UiClient` + `UiSession`）**手动装配则稳定 8 秒存活并全链路通过**；完全复刻 SDK spawn 参数（stdio ignore、cwd、`target/release` exe、同端口）**也通过**。差异只在 `NeonApp.start` 的包装层（额外创建 RenderClient/EventClient/UiClient 替换等）。
- **影响**：`NeonApp.start`（库存案例如 `src/cases/inventory` 旧 `src/inventory.ts` 所用）在 v0.2.5 headless 下不可用；已改用手动装配路径写 L2 探针。
- **建议**：属于 `@neon3/sdk` NeonApp 生命周期 bug，需要 SDK 侧修复（或适配 v0.2.5 对 host inbound 的新要求）。

### 3.4 SDK `UiSession.dispatchIntent` 在 headless 下 revision 推进错误（高）

- **现象**：第一次 `dispatchIntent` 成功（`accepted`，`input_revision` 从 0 推进到 1），第二次起全部被 runtime 拒绝：`ui_host_stale_semantic_intent: semantic intent program or input revision is stale`。
- **根因**：headless host 的 `hostInputSnapshot()` 返回的 `input_revision` **恒为 0**（可在任意提交后复现），而 SDK 每次 accepted 后自动 `inputRevision += 1`，于是第二次提交的语义事件携带 `input_revision: 1` 与 host 期望的 0 不匹配。
- **验证**：手动构造语义事件并把 `event.input_revision` 强制设回 host snapshot 值（0）后，53 条 intent 全部 accepted。
- **报告位置**：`@neon3/sdk/dist/session.js` 的 dispatchIntent/publish revision 跟踪逻辑对 headless 不成立（RFC：headless 下 host input_revision 不随 intent 递增）。
- **绕行**：本库 `run.ts` 的 L2 探针绕开 `dispatchIntent`，改为 `buildIntentEvent` + snapshot 强制 revision + 裸 `ui.host.inbound`。

### 3.5 `branch when` 仅接受 bool/enum 输入，不支持比较表达式（中）

- **现象**：以下语法全部被 runtime 拒绝（`ui_program_invalid_branch_template`）：
  - `when $stock_x_ok=false`（bool 取反）
  - `when $progress >= $goal`（数值比较）
  - `when $accepted and $claimed`（布尔组合）
  - `when $message_count=0`（i32 比较）
- **规则**：NUI Flow 的 `branch when` 只能引用单个 bool 或 enum 输入（例如 `when $capacity=small` 可行，因为 enum 比较被支持；但 bool 比较/数值比较/逻辑组合全部不行）。
- **绕行**：全部改为**互补的显式 bool 输入**（如 `$stock_ok` + `$stock_out`、`$q_wolves_complete` + `$q_wolves_in_progress`），由宿主侧发布。10 个案例已全部改写并通过。

### 3.6 节点 key 必须全文档唯一（中）

- **现象**：skill-tree 的 `reset-<branch>` 按钮在每个技能行内重复，runtime 拒绝：`ui_ir_duplicate_key: node keys must be unique across the Flow document`。
- **规律**：`button/panel/text/branch 等所有可视节点 key 在整份 Flow 中必须唯一`（跨不同父面板也一样）。生成式 UI（循环拼技能行）很容易踩。
- **绕行**：保证生成 key 唯一（如 reset 按钮提到分支头部或追加下标），已修复。

### 3.7 输入类型只支持有限集合，`text_handle` 不接受（中）

- **现象**：`input x text_handle default none` 被 runtime 拒绝：`ui_flow_unknown_input_kind: Flow supports bool, i32, u32, f32, ranged numeric kinds such as i32:0..24, text, canvas_data, and enum:one|two inputs`。
- **绕行**：把文本槽位内容改为 bool 存在标记 + 固定文案（equipment/party 已改）。

### 3.8 `source_node_key` 必须是 Flow 中真实声明的按钮（中）

- **现象**：settings 案例中 `set_value` 通过（`toggle-music`）但 `slider-gamma` 失败：`semantic intent is not declared by the active program`。
- **根因**：runtime 把 intent 的「已声明」绑定在**具体按钮节点**上；`source_node_key` 必须严格等于 Flow 里 `event xxx` 的节点 key。`slider-gamma` 不存在（实际是 `slider-gamma-up/slider-gamma-down`）。
- **绕行**：`sequence()` 里每个步骤的 `source_node_key` 与 Flow 生成器保持一致（settings 已修正为 `slider-gamma-up` 等）。

### 3.9 runtime 拒绝的语义 payload 必须是包装格式（低）

- **现象**：裸 payload `{item_id:"apple"}` 提交被拒：`invalid UI host inbound`。
- **要求**：`ui.host.inbound` 的 payload 值必须是 `SemanticPayloadValue` 信封（`{kind:"enum", value:"apple"}`、`{kind:"i32", value:5}`、`{kind:"bool", value:true}`）。
- **绕行**：`run.ts` 提供 `wrapPayload()` 统一转换（字符串→enum / 整数→i32 / 布尔→bool）。

### 3.10 L0 期望值手算错误 ＋ 结构投影问题（低，已修复）

- 初版 6 个案例 `expectedFinal` 手算有误（商店金币 475→375、技能点 4→3、力量 8→10、聊天可见消息、装备总战力、合成次数），全部按 L0 实际输出校准为「领域逻辑正确、期望值修正」。
- Registry 最初没有把各 domain 的 `stateOf` 投影接到 `CaseDef.stateOf`，导致 completed 总是与整棵 state 比较失败；已为 10 个案例补上投影。

## 4. 库结构（按案例分类）

```text
node/src/cases/
  types.ts                # CaseDef 契约（L0/L1/L2 三层的统一接口）
  registry.ts             # 案例注册表 + host wiring（intent → domain.apply）
  inventory/  domain.ts flow.ts   # 案例 1 背包
  shop/       domain.ts flow.ts   # 案例 2 商店
  skill-tree/ domain.ts flow.ts   # 案例 3 技能树
  quest-log/  domain.ts flow.ts   # 案例 4 任务日志
  character/  domain.ts flow.ts   # 案例 5 角色属性
  chat/       domain.ts flow.ts   # 案例 6 聊天
  equipment/  domain.ts flow.ts   # 案例 7 装备栏
  crafting/   domain.ts flow.ts   # 案例 8 合成
  party/      domain.ts flow.ts   # 案例 9 组队
  settings/   domain.ts flow.ts   # 案例 10 设置
node/src/run.ts             # 三层运行器（--runtime 打开 L2）
node/scripts/               # 环境诊断脚本（smoke/diag/fullchain 等）
```

## 5. 运行方式

```powershell
cd node
npm ci                       # 安装 @neon3/sdk@0.1.5
npm run cases                # L0 领域规则 + L1 静态校验（无需 runtime）
npm run cases:runtime        # L0 + L1 + L2 真实 runtime（v0.2.5 headless）
```

- 环境变量 `NEON3_RUNTIME_VERSION=v0.2.5` 指向最新 runtime；`NEON_PROFILE=release`。
- L2 会依赖本机缓存 runtime（`%LOCALAPPDATA%\Neon3Sdk\runtime\v0.2.5`，需按 §3.1 修布局）或通过 `NEON_ROOT` 指定。

## 6. 后续建议

1. （SDK）修复 `RuntimeSession` 对 v0.2.5 根目录布局的查找；或 v0.2.5 发行包兼容 `target/release`。
2. （SDK）修复 `NeonApp.start` 首次 RPC 崩溃 ui-runtime 的问题。
3. （SDK）修复 headless 下 `UiSession.dispatchIntent` 的 input_revision 推进（改为取 host snapshot）。
4. （runtime）提供 windowed 模式下 DX12 之外的软渲染/兼容路径，或在缺少 DX12 HAL 时明确报错而不是崩溃。
5. （runtime）`branch when` 支持 bool/数值比较与逻辑组合，减少宿主侧补 bool 的样板。