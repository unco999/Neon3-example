// Case 10: settings NUI Flow source (toggles, sliders, combos, reset).
export function flow(): string {
  const toggles = ["music", "sfx"].map((key, index) =>
    `    panel setting-${key} row w 520 h 44 gap 8 pad 6 fill #22313D line #4E6A7F radius 4
      text setting-label-${key} value "开关 ${key}" w 140
      branch setting-${key}-on when $${key}
        text on-label-${key} value "开" w 40
      branch setting-${key}-off when $${key}_off
        text off-label-${key} value "关" w 40
      button toggle-${key} h 30 w 80 value "切换" event settings.set_value.${key}`).join("\n");
  const sliders = ["gamma", "mouse_sensitivity"].map((key, index) =>
    `    panel setting-${key} row w 520 h 44 gap 8 pad 6 fill #22313D line #4E6A7F radius 4
      text setting-label-${key} value "滑块 ${key}" w 140
      text setting-value-label-${key} value "值" w 24
      text setting-value-${key} value "50" w 60
      button slider-${key}-up h 30 w 52 value "+10" event settings.set_value.${key}.up
      button slider-${key}-down h 30 w 52 value "-10" event settings.set_value.${key}.down`).join("\n");
  const combos = ["resolution", "language"].map((key, index) =>
    `    panel setting-${key} row w 520 h 44 gap 8 pad 6 fill #22313D line #4E6A7F radius 4
      text setting-label-${key} value "枚举 ${key}" w 140
      text setting-value-label-${key} value "值" w 24
      text setting-value-${key} value "1920x1080" w 116
      button combo-${key} h 30 w 80 value "切换" event settings.set_value.${key}`).join("\n");
  return `version 1
surface surface.settings-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input music bool default true
input sfx bool default true
input music_off bool default false
input sfx_off bool default false
input gamma i32 default 50
input mouse_sensitivity i32 default 30
input resolution enum:1280x720|1920x1080|2560x1440 default 1920x1080
input language enum:zh-CN|en-US|ja-JP default zh-CN
input dirty bool default false
input enabled bool default true
flow settings-lab
surface settings-demo overlay w 640 h 520 fill #17212B
  panel settings-panel column x 40 y 40 w 560 h 440 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    panel settings-header row w 520 h 40 gap 8 align center
      text settings-title value "设置" h 28
      text settings-dirty value "有未保存修改" h 20
${toggles}
${sliders}
${combos}
    button reset-button h 34 w 100 value "恢复默认" event settings.reset
`;
}
