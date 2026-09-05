// Case 10: settings — toggles, slider values, enum switching, reset-to-default.
export interface SettingDef { key: string; kind: "bool" | "int" | "enum"; default: boolean | number | string; min?: number; max?: number; options?: string[] }
export interface SettingsState { values: Record<string, boolean | number | string>; dirty: boolean; enabled: boolean }

export const SETTINGS: SettingDef[] = [
  { key: "music", kind: "bool", default: true },
  { key: "sfx", kind: "bool", default: true },
  { key: "gamma", kind: "int", default: 50, min: 0, max: 100 },
  { key: "mouse_sensitivity", kind: "int", default: 30, min: 1, max: 100 },
  { key: "resolution", kind: "enum", default: "1920x1080", options: ["1280x720", "1920x1080", "2560x1440"] },
  { key: "language", kind: "enum", default: "zh-CN", options: ["zh-CN", "en-US", "ja-JP"] },
];
export function initialState(): SettingsState {
  const values: Record<string, boolean | number | string> = {};
  for (const setting of SETTINGS) values[setting.key] = setting.default;
  return { values, dirty: false, enabled: true };
}
export function settingByKey(key: string): SettingDef {
  const setting = SETTINGS.find((s) => s.key === key);
  if (!setting) throw new Error(`unknown setting: ${key}`);
  return setting;
}
export function setValue(state: SettingsState, key: string, value: boolean | number | string): SettingsState {
  if (!state.enabled) throw new Error("settings is disabled");
  const setting = settingByKey(key);
  if (setting.kind === "bool" && typeof value !== "boolean") throw new Error(`bool expected: ${key}`);
  if (setting.kind === "int") {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(`int expected: ${key}`);
    if (number < (setting.min ?? -Infinity) || number > (setting.max ?? Infinity)) throw new Error(`out of range: ${key}`);
    value = number;
  }
  if (setting.kind === "enum" && !setting.options?.includes(String(value))) throw new Error(`invalid enum value: ${key}=${value}`);
  return { ...state, values: { ...state.values, [key]: value }, dirty: true };
}
export function resetToDefaults(state: SettingsState): SettingsState {
  if (!state.enabled) throw new Error("settings is disabled");
  const values: Record<string, boolean | number | string> = {};
  for (const setting of SETTINGS) values[setting.key] = setting.default;
  return { ...state, values, dirty: false };
}
export function apply(intent: string, payload: Record<string, unknown>, state: SettingsState): SettingsState {
  switch (intent) {
    case "settings.set_value": return setValue(state, String(payload.key), payload.value as boolean | number | string);
    case "settings.reset": return resetToDefaults(state);
    default:
      if (intent.startsWith("settings.set_value.")) {
        const parts = intent.split(".");
        const key = parts[2];
        const setting = SETTINGS.find((candidate) => candidate.key === key);
        if (!setting) throw new Error(`unknown setting: ${key}`);
        const value = payload.value ?? (parts[3] === "up" ? Number(state.values[key]) + 10 : parts[3] === "down" ? Number(state.values[key]) - 10 : typeof setting.default === "boolean" ? !Boolean(state.values[key]) : setting.default);
        return setValue(state, key, value as boolean | number | string);
      }
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "settings.set_value.music", payload: { key: "music", value: false }, source_node_key: "toggle-music", label: "music off" },
    { intent: "settings.set_value.gamma.up", payload: { key: "gamma", value: 70 }, source_node_key: "slider-gamma-up", label: "gamma 50 -> 70" },
    { intent: "settings.set_value.resolution", payload: { key: "resolution", value: "2560x1440" }, source_node_key: "combo-resolution", label: "resolution -> 2560x1440" },
    { intent: "settings.set_value.mouse_sensitivity.up", payload: { key: "mouse_sensitivity", value: 60 }, source_node_key: "slider-mouse_sensitivity-up", label: "sensitivity 30 -> 60" },
    { intent: "settings.reset", payload: {}, source_node_key: "reset-button", label: "reset to defaults" },
    { intent: "settings.set_value.language", payload: { key: "language", value: "ja-JP" }, source_node_key: "combo-language", label: "language -> ja-JP" },
  ];
}
export function expectedFinal() {
  return {
    music: true,
    sfx: true,
    gamma: 50,
    mouse_sensitivity: 30,
    resolution: "1920x1080",
    language: "ja-JP",
    dirty: true,
  };
}
export function stateOf(state: SettingsState) {
  return { ...state.values, dirty: state.dirty };
}
