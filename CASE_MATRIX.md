# 多案例测试矩阵（Case Matrix）

> 环境：Node.js + TypeScript，SDK `@neon3/sdk@0.1.5`，runtime `v0.2.5`
> 运行方式：`node dist/src/run.js`（离线领域验证）／`node dist/src/run.js --runtime`（真实 runtime probe）

## 案例总表

| # | 案例 id | 游戏 UI 场景 | 分类 | 复杂点 / 被测特性 | Flow 特性 | runtime 能力依赖 | 状态 |
|---|---------|--------------|------|-------------------|-----------|------------------|------|
| 1 | `inventory` | 背包 | 管理类 | 网格格子、物品移动、占用交换、容量收缩/扩张、选中 | panel/text/button/branch/drag/drop | semantic_input, intent_dispatch | ✅ 通过 |
| 2 | `shop` | 商店 | 管理类 | 商品列表、购买结算、金币扣减、库存联动、售罄禁用 | panel/text/button/repeat | semantic_input, intent_dispatch | ✅ 通过 |
| 3 | `skill-tree` | 技能树 | 成长类 | 多分支、前置依赖解锁、加点/洗点、点数预算 | panel/text/button/branch | semantic_input, intent_dispatch | ✅ 通过 |
| 4 | `quest-log` | 任务日志 | 管理类 | 任务列表、接受/放弃、进度更新、奖励领取 | panel/text/button/branch | semantic_input, intent_dispatch | ✅ 通过 |
| 5 | `character` | 角色属性面板 | 成长类 | 属性复数加点、装备加成叠加、上限封顶 | panel/text/button | semantic_input, intent_dispatch | ✅ 通过 |
| 6 | `chat` | 聊天窗口 | 社交类 | 消息追加、频道过滤、发送者着色、输入提交 | panel/text/button/branch/repeat? | semantic_input, intent_dispatch, text_input | ✅ 通过 |
| 7 | `equipment` | 装备栏 | 成长类 | 装备槽位、穿戴/卸下、部位冲突、属性汇总 | panel/text/button | semantic_input, intent_dispatch | ✅ 通过 |
| 8 | `crafting` | 合成/锻造 | 管理类 | 配方表、材料消耗、产出结算、次数限制 | panel/text/button/branch | semantic_input, intent_dispatch | ✅ 通过 |
| 9 | `party` | 组队 | 社交类 | 成员列表、职业、邀请/踢出、状态分层 | panel/text/button | semantic_input, intent_dispatch | ✅ 通过 |
| 10 | `settings` | 设置面板 | 系统类 | 开关切换、滑块数值、枚举切换、复位 | panel/text/button/checkbox/slider | semantic_input, intent_dispatch, text_input | ✅ 通过 |

## 测试分层

- **L0 离线领域验证**（无需 runtime）：纯 TS 域规则确定性跑事件序列，输出 JSONL。
- **L1 静态 Flow 校验**（SDK 内置 `validateFlowSource` / `scanFlow`）：验证 10 个案例的 Flow 全部落在 runtime 词汇表内。
- **L2 真实 runtime probe**（`--runtime`）：用 `RuntimeSession`(v0.2.5, headless) + `UiClient`/`UiSession` 提交 Flow + 派发 intent，验证 `accepted` 与消费者 revision 推进。

## 报告

- 实现过程中遇到的问题、底层不支持的位置、SDK/runtime 断点 → 见 `TEST_REPORT.md`。
