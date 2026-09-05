// Case 9: party NUI Flow source (member rows, ready toggles, invite/kick, start gate).
export function flow(): string {
const members = ["p1", "p2", "p3", "p4"].map((key, index) =>
    `    panel member-${key} row w 520 h 44 gap 6 pad 6 fill #22313D line #4E6A7F radius 4
      text member-name-${key} value "成员 ${key}" w 100
      text member-class-label-${key} value "职业" w 34
      text member-class-${key} value "empty" w 50
      branch member-ready-${key} when $${key}_ready
        text ready-label-${key} value "已就绪" w 60
      branch member-notready-${key} when $${key}_not_ready
        text notready-label-${key} value "未就绪" w 60
      button ready-${key} h 28 w 52 value "就绪" event party.set_ready.${key}
      button kick-${key} h 28 w 52 value "踢出" event party.kick.${key}
      button invite-${key} h 28 w 52 value "邀请" event party.invite.${key}`).join("\n");
  return `version 1
surface surface.party-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input party_size i32 default 2
input p1_ready bool default true
input p1_not_ready bool default false
input p2_ready bool default false
input p2_not_ready bool default true
input p3_ready bool default false
input p3_not_ready bool default true
input p4_ready bool default false
input p4_not_ready bool default true
input p1_class enum:warrior|mage|priest|rogue default warrior
input p2_class enum:warrior|mage|priest|rogue default mage
input p3_class enum:warrior|mage|priest|rogue default warrior
input p4_class enum:warrior|mage|priest|rogue default warrior
input can_start bool default false
input party_not_start bool default true
input enabled bool default true
flow party-lab
surface party-demo overlay w 640 h 480 fill #17212B
  panel party-panel column x 40 y 40 w 560 h 400 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    panel party-header row w 520 h 40 gap 8 align center
      text party-title value "队伍" h 28
      text party-size-label value "人数" h 24
      text party-size value "2" h 24
      text party-size-limit value "/ 5" h 24
${members}
    branch party-can-start when $can_start
      text party-start-ok value "可以出发！" h 24
    branch party-no-start when $party_not_start
      text party-start-wait value "等待全员就绪…" h 24
    text party-hint value "队长不能被踢出；就绪状态决定出发" h 22
`;
}
