// Case 3: skill-tree NUI Flow source (branch sections, learn buttons, reset).
export function flow(): string {
  const branches: Record<string, string[]> = {
    warrior: ["sword_mastery", "whirlwind", "shield_wall"],
    mage: ["frost_bolt", "blizzard"],
    rogue: ["haste"],
  };
  const labels: Record<string, string> = { sword_mastery: "剑术", whirlwind: "旋风斩", shield_wall: "盾墙", frost_bolt: "寒冰箭", blizzard: "暴风雪", haste: "迅捷" };
  const branchLabels: Record<string, string> = { warrior: "战士", mage: "法师", rogue: "游侠" };
  const sections = Object.entries(branches).map(([branch, keys], bi) => {
    const rows = keys.map((key) => `    panel skill-${key} row w 248 h 44 gap 4 pad 6 fill #22313D line #4E6A7F radius 4
      text skill-name-${key} value "${labels[key]}" w 90
      text skill-rank-label-${key} value "等级" w 40
      text skill-rank-${key} value "0 / ${SKILL_MAX[key]}" w 44
      button learn-${key} h 30 w 48 enabled $${key}_can value "习得" event skilltree.learn.${key}`).join("\n");
    return `  panel branch-${branch} column x ${20 + bi * 290} y 120 w 270 gap 8 pad 10 fill #1C2A35 line #4E6A7F radius 6
    panel branch-header-${branch} row w 248 h 32 gap 6 align center
      text branch-title-${branch} value "${branchLabels[branch]}分支" h 28
      button reset-${branch} h 26 w 48 value "重置" event skilltree.reset_branch
${rows}`;
  }).join("\n");
  return `version 1
surface surface.skilltree-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input points i32 default 5
input sword_mastery_rank i32 default 0
input whirlwind_rank i32 default 0
input shield_wall_rank i32 default 0
input frost_bolt_rank i32 default 0
input blizzard_rank i32 default 0
input haste_rank i32 default 0
input sword_mastery_can bool default true
input whirlwind_can bool default false
input shield_wall_can bool default false
input frost_bolt_can bool default true
input blizzard_can bool default false
input haste_can bool default true
input enabled bool default true
flow skilltree-lab
surface skilltree-demo overlay w 920 h 560 fill #17212B
  panel skilltree-header column x 40 y 30 w 820 h 70 gap 6 pad 10 fill #1C2A35 line #4E6A7F radius 6
    text skilltree-title value "技能树" h 28
    text skilltree-points-label value "剩余点数" h 24
    text skilltree-points value "5" h 24
${sections}
`;
}
export const SKILL_MAX: Record<string, number> = {
  sword_mastery: 3, whirlwind: 1, shield_wall: 1, frost_bolt: 3, blizzard: 1, haste: 2,
};
