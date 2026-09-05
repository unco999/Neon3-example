// Case 4: quest-log NUI Flow source (quest rows, accept/abandon/claim, progress bars).
export function flow(): string {
  const quests = ["q_wolves", "q_herbs", "q_tower"].map((key, index) => `    panel quest-${key} column w 600 h 190 gap 6 pad 8 fill #22313D line #4E6A7F radius 4
      panel quest-header-${key} row w 580 gap 8 align center
        text quest-name-${key} value "任务 ${key}" w 180
        text quest-status-label-${key} value "任务状态" w 80
      branch quest-not-accepted-${key} when $${key}_not_accepted
        button accept-${key} h 30 w 64 value "接受" event quest.accept.${key}
      branch quest-in-progress-${key} when $${key}_in_progress
        button progress-${key} h 30 w 64 value "推进" event quest.progress.${key}
        button abandon-${key} h 30 w 64 value "放弃" event quest.abandon.${key}
      branch quest-complete-${key} when $${key}_complete
        button claim-${key} h 30 w 64 value "领奖" event quest.claim.${key}
        button abandon-${key}-2 h 30 w 64 value "放弃" event quest.abandon.${key}`).join("\n");
  return `version 1
surface surface.questlog-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input gold i32 default 0
input q_wolves_accepted bool default false
input q_wolves_not_accepted bool default true
input q_wolves_in_progress bool default false
input q_wolves_complete bool default false
input q_wolves_progress i32 default 0
input q_wolves_goal i32 default 5
input q_wolves_claimed bool default false
input q_herbs_accepted bool default false
input q_herbs_not_accepted bool default true
input q_herbs_in_progress bool default false
input q_herbs_complete bool default false
input q_herbs_progress i32 default 0
input q_herbs_goal i32 default 3
input q_herbs_claimed bool default false
input q_tower_accepted bool default false
input q_tower_not_accepted bool default true
input q_tower_in_progress bool default false
input q_tower_complete bool default false
input q_tower_progress i32 default 0
input q_tower_goal i32 default 1
input q_tower_claimed bool default false
input enabled bool default true
flow questlog-lab
surface questlog-demo overlay w 720 h 760 fill #17212B
  panel questlog-panel column x 40 y 30 w 640 h 700 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    panel questlog-header row w 600 h 40 gap 8 align center
      text questlog-title value "任务日志" h 28
      text questlog-gold-label value "金币" h 24
      text questlog-gold value "0" h 24
${quests}
`;
}
