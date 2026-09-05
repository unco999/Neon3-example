// Case registry: every case in the multi-case suite, with its live wiring.
import type { CaseDef, LiveContext } from "./types.js";
import * as inventoryDomain from "./inventory/domain.js";
import { flow as inventoryFlow } from "./inventory/flow.js";
import * as shopDomain from "./shop/domain.js";
import { flow as shopFlow } from "./shop/flow.js";
import * as skillTreeDomain from "./skill-tree/domain.js";
import { flow as skillTreeFlow } from "./skill-tree/flow.js";
import * as questLogDomain from "./quest-log/domain.js";
import { flow as questLogFlow } from "./quest-log/flow.js";
import * as characterDomain from "./character/domain.js";
import { flow as characterFlow } from "./character/flow.js";
import * as chatDomain from "./chat/domain.js";
import { flow as chatFlow } from "./chat/flow.js";
import * as equipmentDomain from "./equipment/domain.js";
import { flow as equipmentFlow } from "./equipment/flow.js";
import * as craftingDomain from "./crafting/domain.js";
import { flow as craftingFlow } from "./crafting/flow.js";
import * as partyDomain from "./party/domain.js";
import { flow as partyFlow } from "./party/flow.js";
import * as settingsDomain from "./settings/domain.js";
import { flow as settingsFlow } from "./settings/flow.js";

const SIMPLE_CASES: CaseDef<any>[] = [
  {
    id: "inventory", title: "背包", category: "management",
    scene: "冒险者背包：16/20/24 格容量切换，物品拖拽移动与占用交换，选中态",
    behaviours: ["容量状态机 small->medium->large", "move 占用交换", "selection", "capacity 越界拒绝"],
    flowFeatures: ["panel", "text", "button", "branch", "drag/drop intents", "machine/state/transition/motion", "nine_slice frame"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1", "ui.state.animation.v1", "ui.image.upload.v1"],
    initialState: inventoryDomain.initialState,
    apply: inventoryDomain.apply,
    sequence: inventoryDomain.sequence,
    expectedFinal: inventoryDomain.expectedFinal,
    stateOf: inventoryDomain.stateOf,
    flow: inventoryFlow,
  },
  {
    id: "shop", title: "商店", category: "management",
    scene: "杂货铺：商品目录、购买扣金币、库存扣减、售罄禁用、出售回金、补货",
    behaviours: ["金币账目", "库存枯竭 sold-out", "出售半价回金", "补货重置库存"],
    flowFeatures: ["panel", "text", "button", "branch", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: shopDomain.initialState,
    apply: shopDomain.apply,
    sequence: shopDomain.sequence,
    expectedFinal: shopDomain.expectedFinal,
    stateOf: shopDomain.stateOf,
    flow: shopFlow,
  },
  {
    id: "skill-tree", title: "技能树", category: "growth",
    scene: "三职业分支技能树：前置依赖、点数预算、习得/重置分支退款",
    behaviours: ["前置依赖 gating", "点数预算", "重置分支退款", "非法习得拒绝"],
    flowFeatures: ["panel", "text", "button", "branch", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: skillTreeDomain.initialState,
    apply: skillTreeDomain.apply,
    sequence: skillTreeDomain.sequence,
    expectedFinal: skillTreeDomain.expectedFinal,
    stateOf: skillTreeDomain.stateOf,
    flow: skillTreeFlow,
  },
  {
    id: "quest-log", title: "任务日志", category: "management",
    scene: "任务列表：接受/放弃、进度推进、进度条、奖励领取防重复",
    behaviours: ["accept/abandon 状态机", "progress 封顶 goal", "claim 前置完整性检查", "奖励防重复"],
    flowFeatures: ["panel", "text", "button", "branch", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: questLogDomain.initialState,
    apply: questLogDomain.apply,
    sequence: questLogDomain.sequence,
    expectedFinal: questLogDomain.expectedFinal,
    stateOf: questLogDomain.stateOf,
    flow: questLogFlow,
  },
  {
    id: "character", title: "角色属性", category: "growth",
    scene: "属性面板：加点/减点、装备加成叠加、上限封顶、点数预算",
    behaviours: ["unspent points 预算", "equipment bonus 叠加", "cap 封顶拒绝", "deallocate 退款"],
    flowFeatures: ["panel", "text", "button", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: characterDomain.initialState,
    apply: characterDomain.apply,
    sequence: characterDomain.sequence,
    expectedFinal: characterDomain.expectedFinal,
    stateOf: characterDomain.stateOf,
    flow: characterFlow,
  },
  {
    id: "chat", title: "聊天", category: "social",
    scene: "聊天窗口：频道切换、消息追加、频道计数、输入提交",
    behaviours: ["channel switch 过滤", "消息追加 next_id", "空消息拒绝", "频道计数"],
    flowFeatures: ["panel", "text", "button", "branch", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1", "ui.text_input.commit.v1"],
    initialState: chatDomain.initialState,
    apply: chatDomain.apply,
    sequence: chatDomain.sequence,
    expectedFinal: chatDomain.expectedFinal,
    stateOf: chatDomain.stateOf,
    flow: chatFlow,
  },
  {
    id: "equipment", title: "装备栏", category: "growth",
    scene: "装备槽位：穿戴/卸下、槽位冲突、双手武器释放副手、总战力汇总",
    behaviours: ["slot 冲突", "2H weapon 释放 offhand", "unequip 置空", "total power 汇总"],
    flowFeatures: ["panel", "text", "button", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: equipmentDomain.initialState,
    apply: equipmentDomain.apply,
    sequence: equipmentDomain.sequence,
    expectedFinal: equipmentDomain.expectedFinal,
    stateOf: equipmentDomain.stateOf,
    flow: equipmentFlow,
  },
  {
    id: "crafting", title: "合成", category: "management",
    scene: "合成台：配方链、材料消耗、材料产出回流、次数限制",
    behaviours: ["材料校验", "配方链中间产物回流", "产出结算", "craft 次数限制", "材料不足拒绝"],
    flowFeatures: ["panel", "text", "button", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: craftingDomain.initialState,
    apply: craftingDomain.apply,
    sequence: craftingDomain.sequence,
    expectedFinal: craftingDomain.expectedFinal,
    stateOf: craftingDomain.stateOf,
    flow: craftingFlow,
  },
  {
    id: "party", title: "组队", category: "social",
    scene: "队伍面板：邀请/踢出、职业、就绪状态、出发门槛",
    behaviours: ["invite 满员拒绝", "kick 队长保护", "ready 全员门槛", "职业枚举校验"],
    flowFeatures: ["panel", "text", "button", "branch", "semantic intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1"],
    initialState: partyDomain.initialState,
    apply: partyDomain.apply,
    sequence: partyDomain.sequence,
    expectedFinal: partyDomain.expectedFinal,
    stateOf: partyDomain.stateOf,
    flow: partyFlow,
  },
  {
    id: "settings", title: "设置", category: "system",
    scene: "设置面板：布尔开关、整数滑块、枚举切换、恢复默认",
    behaviours: ["bool toggle", "int 范围校验", "enum 合法值校验", "reset to defaults"],
    flowFeatures: ["panel", "text", "button", "branch", "checkbox/slider/combo intents"],
    requiredCapabilities: ["ui.semantic_input.v1", "ui.intent_dispatch.v1", "ui.text_input.commit.v1"],
    initialState: settingsDomain.initialState,
    apply: settingsDomain.apply,
    sequence: settingsDomain.sequence,
    expectedFinal: settingsDomain.expectedFinal,
    stateOf: settingsDomain.stateOf,
    flow: settingsFlow,
  },
];

// Per-case live wiring: map semantic intents to domain application + store publication.
function projectState(id: string, current: any, store: LiveContext["store"]) {
  const put = (key: string, value: unknown) => {
    if (value !== undefined && (typeof value === "boolean" || typeof value === "number" || typeof value === "string")) store.value(key).set(value);
  };
  if (id === "shop") {
    put("gold", current.gold); for (const item of current.items) { put(`stock_${item.key}_ok`, item.stock > 0); put(`stock_${item.key}_out`, item.stock <= 0); }
  } else if (id === "skill-tree") {
    put("points", current.points); for (const key of ["sword_mastery","whirlwind","shield_wall","frost_bolt","blizzard","haste"]) { put(`${key}_rank`, current.learned[key] ?? 0); const skill = (SKILL_TREE_SKILLS as any)[key]; put(`${key}_can`, Boolean(skill && current.points >= skill.cost && (skill.prerequisites ?? []).every((p: string) => (current.learned[p] ?? 0) > 0) && (current.learned[key] ?? 0) < skill.max_rank)); }
  } else if (id === "quest-log") {
    put("gold", current.gold); for (const q of current.quests) { put(`${q.key}_accepted`, q.accepted); put(`${q.key}_not_accepted`, !q.accepted); put(`${q.key}_in_progress`, q.accepted && q.progress < q.goal); put(`${q.key}_complete`, q.accepted && q.progress >= q.goal && !q.claimed); put(`${q.key}_progress`, q.progress); put(`${q.key}_goal`, q.goal); put(`${q.key}_claimed`, q.claimed); }
  } else if (id === "character") {
    put("level", current.level); put("unspent_points", current.unspent_points); for (const key of ["strength","agility","intellect","vitality"]) { put(`${key}_base`, current.base[key]); put(`${key}_equip`, current.equipment_bonus[key]); put(`${key}_total`, current.base[key] + current.equipment_bonus[key] + current.invested[key]); }
  } else if (id === "settings") {
    for (const [key, value] of Object.entries(current.values)) { put(key, value); if (typeof value === "boolean") put(`${key}_off`, !value); } put("dirty", current.dirty);
  } else if (id === "crafting") {
    put("crafts_remaining", current.crafts_remaining); for (const key of ["herb","water","iron_ore","coal","wood","iron_ingot"]) put(`${key}_count`, current.materials[key]); put("health_potion_count", current.output.health_potion); put("steel_sword_count", current.output.steel_sword);
  } else if (id === "party") {
    put("party_size", current.members.length); put("can_start", current.members.length > 0 && current.members.every((m: any) => m.ready)); put("party_not_start", !(current.members.length > 0 && current.members.every((m: any) => m.ready))); for (let i = 1; i <= 4; i++) { const m = current.members[i - 1]; put(`p${i}_ready`, Boolean(m?.ready)); put(`p${i}_not_ready`, Boolean(m && !m.ready)); put(`p${i}_class`, m?.class_name ?? "warrior"); }
  } else if (id === "equipment") {
    put("total_power", Object.values(current.slots).reduce((sum: number, key: any) => sum + (current.bag.find((i: any) => i.key === key)?.power ?? 0), 0)); for (const key of ["head","chest","weapon","offhand","legs"]) { put(`${key}_item_equipped`, Boolean(current.slots[key])); put(`${key}_item_empty`, !current.slots[key]); }
  } else if (id === "chat") {
    put("active_channel", current.active_channel); put("message_count", current.messages.length); for (const channel of current.channels) put(`${channel}_count`, current.messages.filter((m: any) => m.channel === channel).length); put("has_messages", current.messages.length > 0); put("chat_empty", current.messages.length === 0);
  }
}

const SKILL_TREE_SKILLS: Record<string, any> = { sword_mastery:{cost:1,max_rank:3,prerequisites:[]}, whirlwind:{cost:2,max_rank:1,prerequisites:["sword_mastery"]}, shield_wall:{cost:2,max_rank:1,prerequisites:["sword_mastery"]}, frost_bolt:{cost:1,max_rank:3,prerequisites:[]}, blizzard:{cost:3,max_rank:1,prerequisites:["frost_bolt"]}, haste:{cost:1,max_rank:2,prerequisites:[]} };

function wireDomainCase<State>(def: CaseDef<State>) {
  return (ctx: LiveContext) => {
    const store = ctx.store;
    const router = ctx.router;
    const current = def.initialState();
    let chatDraft = "";
    const write = () => projectState(def.id, current, ctx.store);
    write();
    router.default((event: any) => {
      const intent = event.intent;
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(event.payload ?? {})) {
        payload[key] = (value as any)?.value ?? value;
      }
      const source = String(event.source_node_key ?? "");
      if (intent === "chat.draft" || intent === "chat.send") {
        chatDraft = String(payload.text ?? event.committed_text?.value ?? chatDraft);
        payload.text ??= chatDraft;
        payload.channel ??= (current as any).active_channel;
        payload.sender ??= "player";
      }
      if (intent === "chat.draft") {
        return { status: "accepted", state: current };
      }
      const match = source.match(/(?:buy|sell|equip|learn|reset|accept|progress|abandon|claim|craft|alloc|dealloc|toggle|slider|combo)-(.+)/);
      if (intent === "shop.item.buy" || intent === "shop.item.sell") { payload.item_id ??= match?.[1]; payload.quantity ??= 1; }
      else if (intent === "skilltree.learn") payload.skill_id ??= match?.[1];
      else if (intent === "skilltree.reset_branch") payload.branch ??= match?.[1];
      else if (intent.startsWith("quest.")) { payload.quest_id ??= intent.split(".").slice(2).join(".") || match?.[1]?.replace(/-2$/, ""); payload.amount ??= 1; }
      else if (["character.allocate","character.deallocate"].includes(intent)) { payload.stat ??= match?.[1]; payload.amount ??= 1; }
      else if (intent === "crafting.craft") payload.recipe_id ??= match?.[1];
      else if (intent === "equipment.equip") payload.item_id ??= match?.[1];
      else if (intent === "equipment.unequip") payload.slot ??= match?.[1];
      else if (intent === "settings.set_value") { const setting = match?.[1]?.replace(/-(up|down)$/, "") ?? ""; payload.key ??= setting; const value = (current as any).values?.[setting]; payload.value ??= typeof value === "number" ? value + (source.endsWith("-down") ? -10 : 10) : typeof value === "boolean" ? !value : value; }
      try {
        const next = def.apply(intent, payload, current) as Record<string, unknown>;
        Object.assign(current as unknown as Record<string, unknown>, next);
        write();
        ctx.onStateChanged?.(current);
        return { status: "accepted", state: next };
      } catch (error) {
        return { status: "rejected", error: (error as Error).message };
      }
    });
  };
}

export function cases(): CaseDef<any>[] {
  return SIMPLE_CASES.map((def) => ({ ...def, wire: def.wire ?? wireDomainCase(def) }));
}
export function caseById(id: string): CaseDef<any> | undefined {
  return cases().find((c) => c.id === id);
}
