# Neon3 音乐播放器 — 启动页过渡动画方案

> 版本：v1.0 | 日期：2026-09-09
> 目标：从启动页（Splash）通过高科技扫光 + Clip 反转过渡，平滑进入播放界面



***

## 一、现状能力盘点

### 1.1 NUI Motion / Transition 系统（已验证可用）

从 `inventory/flow.ts` 和 `state-motion.nui` 测试用例确认：



```
motion \<key> duration \<ms> easing \<linear|ease\_in|ease\_out|ease\_in\_out>

machine \<name> initial \<state>

state \<name> \<state>

on \<machine> \<event> -> \<target\_state> \[emit \<intent>]

transition \<machine> \<from> -> \<to> motion \<motion\_key>

style \<machine>.\<state>.\<node\_key> x \<n> y \<n> w \<n> h \<n>
```

**支持动画的属性**（`UiTransitionState`）：



| 属性                              | 说明                  |
| ------------------------------- | ------------------- |
| `bounds` (x/y/w/h)              | 位置和大小               |
| `opacity`                       | 透明度                 |
| `background_color`              | 背景色                 |
| `border_color` / `border_width` | 边框                  |
| `corner_radius`                 | 圆角                  |
| `numeric_value`                 | 数值（slider/progress） |

**不支持**：clip-path、transform (scale/rotate/translate 独立于 bounds)、filter (blur 等)

### 1.2 Shader 系统（已验证可用）



* 自定义 WGSL material，`time_seconds` 驱动动画

* `NEON_CONTINUOUS_RENDER=1` 实现持续渲染（已编译进 runtime）

* 现有 4 个 shader：pulse-glass /pulse-flow-light/pulse-neon-edge /pulse-neon-ring

* material 可挂在任意 panel 上，overlay 层可叠加

### 1.3 状态与事件



* store 输入驱动 UI（`$position` / `$volume` 等）

* button 事件 → domain 逻辑 → store 更新

* case-window.ts 可做定时器 / 状态机编排



***

## 二、启动页组件拆解（用实际组件拼，非 PNG）

根据设计稿，启动页由以下组件构成：



```
┌──────────────────────────────────┐

│  \[全屏 shader 背景]               │  ← pulse-splash：荧光绿晶体斜面+扫光

│                                  │

│         ░░░░░░░░░░░              │  ← 晶体几何（shader绘制）

│       ░░░░░░░░░░░░░░            │

│      ░░░░░  手  ░░░░░           │  ← 手剪影：PNG图片（唯一需要的图片）

│      ░░░░░ 剪影 ░░░░░           │

│       ░░░░░░░░░░░░░░            │

│         ░░░░░░░░░░░              │

│                                  │

│  ── MUSIC PLAYER ──              │  ← text + 发光下划线shader

│  LISTEN TO WHAT YOU CAN'T SEE    │  ← text

│                                  │

│  \[底部进度条/加载指示]            │  ← slider 或 panel 动画

└──────────────────────────────────┘
```



| 组件                | 实现方式                               | 说明                    |
| ----------------- | ---------------------------------- | --------------------- |
| 背景晶体 + 扫光         | `pulse-splash` shader              | 程序化生成荧光绿斜面晶体，扫光动画     |
| 手剪影               | PNG 图片资源                           | 从设计稿切出，唯一静态图          |
| 标题 "MUSIC PLAYER" | NUI text                           | 字体 + 颜色，可加发光 material |
| 标题下划线             | `pulse-neon-ring` 类 shader 或 panel | 荧光绿发光线                |
| 副标题               | NUI text                           | 小字，低亮度                |
| 加载进度              | NUI slider 或 panel bounds 动画       | 底部细条，motion 驱动        |



***

## 三、动画设计

### 3.1 阶段一：启动页展示（0 \~ 2.5s）



```
时间轴：

0.0s  启动页出现，晶体从暗到亮（shader内fade-in）

0.5s  扫光第一次扫过晶体（shader内scan-line）

1.0s  标题文字渐显（NUI opacity motion）

1.5s  下划线发光动画开始（shader呼吸）

2.0s  扫光第二次扫过，强度增加

2.5s  触发过渡
```

**pulse-splash shader 核心效果**：



* 多组斜向矩形晶体（类似现有 pulse-glass 的斜矩形，但更大更复杂）

* 扫光：一条高亮度斜线从左上向右下移动，`scan_pos = fract(t * 0.3)`，经过晶体时亮度暴增

* 晶体内部有流动的能量线

* 整体颜色：深黑底 + 荧光绿晶体，越亮越偏黄

### 3.2 阶段二：Clip 反转过渡（2.5 \~ 4.0s）

**核心创意**：启动页不是简单淡出，而是用一个**扫描 Clip**把启动页 "切掉"，同时播放器从切口中 "反转出现"。



```
视觉过程：

2.5s  一条垂直扫描线从左边缘开始向右移动

&#x20;     扫描线左侧：启动页开始碎裂/消散（shader dissolve）

&#x20;     扫描线右侧：播放器界面开始显现（opacity从0→1）

3.0s  扫描线经过中间，启动页剩右半，播放器左半已显

3.5s  扫描线到达右边缘，启动页完全消失

4.0s  播放器完全显现，过渡结束
```

**实现方式（两种可选，推荐组合）**：

#### 方案 A：Shader Clip（推荐，视觉最连贯）



* 启动页和播放器在同一个 shader 中渲染

* shader 内用 `clip_x = t * speed` 控制扫描位置

* `if (p.x < clip_x)` 渲染播放器，`else` 渲染启动页

* 扫描线位置加一条高亮光带

* 启动页侧加 dissolve 效果（噪声 + 透明度衰减）

**缺点**：需要把播放器 UI 也画进 shader，不现实。

#### 方案 B：双层 + NUI Motion + Shader 扫描线（实际可行）



```
Layer 1 (底)：播放器界面，opacity 0→1（motion驱动）

Layer 2 (中)：启动页界面，opacity 1→0，但用bounds动画做clip效果

Layer 3 (顶)：pulse-scanline shader，全屏overlay，绘制扫描线+光带
```



* **启动页 clip 效果**：用 `style` 改变启动页 panel 的 bounds，从 `w=360` 动画到 `w=0`（x 保持 0），模拟从左到右被切掉

* **播放器显现**：opacity 从 0→1，或者也用 bounds 从 `w=0,x=360` 到 `w=360,x=0`

* **扫描线**：pulse-scanline shader 绘制一条垂直高亮光带，位置随时间从左到右

* **反转感**：启动页被切掉的边缘加一个 "反转" 色（白色 / 亮绿闪光），由 shader 在扫描线位置绘制

#### 方案 C：扩展 NUI 支持 clip-path 动画（长期）



* 在 `UiTransitionState` 中增加 `clip_rect` 字段

* runtime 渲染时对 panel 做裁剪

* 这需要改 runtime 源码，工作量大，暂不推荐

**推荐方案 B**，不需要改 runtime，纯 NUI+shader 实现。

### 3.3 阶段三：播放器保持（4.0s+）



* 启动页和扫描线 overlay 移除

* 播放器界面保持现有效果（pulse-glass + pulse-neon-edge + 左侧光带）

* 播放按钮的 pulse-neon-ring 开始呼吸动画



***

## 四、需要实现的东西清单

### 4.1 新增 Shader（2 个）



| Shader           | 用途            | 关键参数                                 |
| ---------------- | ------------- | ------------------------------------ |
| `pulse-splash`   | 启动页背景：晶体 + 扫光 | time\_seconds, 晶体数量，扫光速度，dissolve 进度 |
| `pulse-scanline` | 过渡扫描线 overlay | time\_seconds, 扫描方向，光带宽度，颜色          |

### 4.2 新增 NUI 结构



```
surface music-player-demo

&#x20; ├── panel player-shell (现有，material pulse-glass)

&#x20; │     └── ... 现有播放界面 ...

&#x20; │

&#x20; ├── panel splash-overlay (新增，全屏overlay)

&#x20; │     material pulse-splash

&#x20; │     ├── image splash-hand (手剪影PNG)

&#x20; │     ├── text splash-title "MUSIC PLAYER"

&#x20; │     ├── panel splash-underline (发光下划线)

&#x20; │     └── text splash-subtitle "LISTEN TO WHAT YOU CAN'T SEE"

&#x20; │

&#x20; └── panel scanline-overlay (新增，全屏overlay，仅过渡期间)

&#x20;       material pulse-scanline
```

### 4.3 状态机（NUI machine）



```
machine app\_view initial splash

state app\_view transition

state app\_view player

on app\_view app.start -> transition

on app\_view app.transition\_done -> player

transition app\_view splash -> transition motion splash-to-player

transition app\_view transition -> player motion player-reveal

style app\_view.splash.splash-overlay x 0 y 0 w 360 h 720 opacity 1.0

style app\_view.transition.splash-overlay x 0 y 0 w 0 h 720 opacity 0.8  ← clip收缩

style app\_view.player.splash-overlay x 0 y 0 w 0 h 720 opacity 0.0

style app\_view.splash.player-shell opacity 0.0

style app\_view.transition.player-shell opacity 0.5

style app\_view.player.player-shell opacity 1.0
```

### 4.4 资源



| 资源                | 来源     | 说明           |
| ----------------- | ------ | ------------ |
| `splash-hand.png` | 从设计稿切出 | 手剪影，唯一 PNG   |
| 字体                | 现有     | 标题用粗体，副标题用细体 |

### 4.5 case-window.ts 逻辑



```
1\. 启动时 \$app\_view = "splash"

2\. setTimeout 2500ms → 触发 app.start 事件 → transition状态

3\. setTimeout 1500ms → 触发 app.transition\_done → player状态

4\. 过渡完成后，可选择移除splash-overlay和scanline-overlay（或保持opacity=0）
```



***

## 五、实现步骤

### Phase 1：启动页静态搭建



1. 切出手剪影 PNG，上传资源

2. 写 `pulse-splash` shader（晶体 + 扫光，先做静态效果）

3. 在 flow.ts 中加 splash-overlay panel，包含标题、下划线、副标题、手剪影

4. 确认启动页视觉效果

### Phase 2：启动页动画



1. pulse-splash 加扫光动画

2. 标题 / 下划线加渐显 motion

3. 底部加加载进度动画

4. 确认 2.5 秒展示效果

### Phase 3：过渡动画



1. 写 `pulse-scanline` shader（扫描线 + 光带）

2. 加 app\_view 状态机，定义 splash→transition→player

3. 定义 style：splash-overlay 的 bounds 收缩（clip 效果），player-shell 的 opacity 渐显

4. case-window.ts 加定时器触发状态切换

5. 调过渡时长和缓动

### Phase 4：打磨



1. 扫描线位置与 splash 收缩同步

2. 扫描线边缘加反转闪光

3. 播放器元素逐个渐入（可选， stagger 效果）

4. 整体节奏调试



***

## 六、技术难点与解决方案

### 难点 1：NUI motion 不支持 clip-path

**解决**：用 bounds 动画（w 从 360→0）模拟从左到右的 clip 效果。配合 scanline shader 掩盖边界，视觉上等同于 clip。

### 难点 2：启动页和播放器同时渲染的性能

**解决**：两层 overlay，启动页 opacity=0 后不消耗渲染（NEON\_CONTINUOUS\_RENDER 仍在跑，但透明像素开销小）。过渡结束后可通过 branch 条件不渲染 splash-overlay。

### 难点 3：扫描线与 clip 同步

**解决**：scanline shader 的扫描速度 = splash-overlay bounds 收缩速度 = 360px / 1500ms。shader 内用 `time_seconds` 计算位置，NUI 用 motion 控制 bounds，两者时长一致即可同步。

### 难点 4："反转" 视觉效果

**解决**：scanline shader 在扫描线位置绘制一条反色 / 白色高亮光带，宽度 2-3px，带轻微辉光。启动页被切掉的边缘看起来像 "反转" 了一下。



***

## 七、待定问题



1. **手剪影**：是否从设计稿精确切出？还是用程序化剪影？

2. **过渡触发**：自动 2.5 秒后过渡，还是点击屏幕触发？

3. **播放器元素 stagger**：过渡时播放器元素是整体渐显，还是逐个（封面→标题→控制栏）渐入？

4. **pulse-splash 晶体风格**：精确复刻设计稿的晶体形状，还是程序化生成类似风格？

5. **扫描线方向**：从左到右，还是从中心向两边？设计稿中晶体是从右上到左下，扫描线方向可以考虑斜向。



***

*文档结束。确认方案后进入 Phase 1 实现。*