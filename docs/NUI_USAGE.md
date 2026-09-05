# Neon3 NUI 使用说明

## 基本结构

NUI Flow 只写声明，不写业务代码：

```text
version 1
surface surface.demo revision 1
input enabled bool default true
input count i32 default 0
flow demo
surface demo overlay w 640 h 360
  panel main column x 24 y 24 w 592 h 312
    text title value "标题"
    text value value $count
    button add value "+" enabled $enabled event demo.add
```

业务状态放在 domain，按钮只发送 intent。domain 返回新状态，再发布 inputs。

## 五条规则

1. 动态文字用绑定：`value $count`。不要把变化中的数字写死在 `value "0"`。
2. 可编辑文字用 `input`，并绑定 `text` 类型 input：
   `input message text default text:empty`。
3. 多个对象不要共用一个无参数 intent。使用稳定且唯一的 intent，例如
   `equipment.equip.iron_sword`、`quest.accept.q_herbs`。
4. 行、按钮和文字使用固定宽度，给文字预留空间。不要让长文本决定按钮位置。
5. Flow 重挂会恢复默认 inputs。重挂后必须重新发布完整当前状态，不能只发布本次变化。

## 输入与发送

输入框提交使用 `text_edit_commit`。发送按钮是独立的 `activate` intent；输入草稿和发送动作应分开：

```text
input compose text default text:empty
surface chat column
  input compose-box w 500 h 32 value $compose event chat.draft
  button send h 32 w 96 value "发送" event chat.send
```

不要把原始字符串放进任意 JSON。使用现有 semantic event 和 typed text commit；domain host 负责把草稿交给业务规则。

## 分支与状态

分支条件必须是已声明的 bool 或 enum：

```text
input empty bool default true
branch empty-state when $empty
  text hint value "暂无内容"
```

状态变化要同时更新 domain、store 和画面。分支只控制显示，不承担业务判断。

## 验证

先跑离线和静态检查：

```powershell
npm test
npm run cases
```

涉及真实 runtime 的改动还要跑：

```powershell
npm run cases:runtime
```

窗口交互必须检查实际输入、事件 response、input revision 和变化后的 snapshot。`accepted` 只表示协议接收，不等于屏幕已经正确刷新。
