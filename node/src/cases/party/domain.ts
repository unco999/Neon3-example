// Case 9: party — member roster, class assignment, invite/kick, ready gates.
export interface PartyMember { key: string; name: string; class_name: string; ready: boolean; leader: boolean }
export interface PartyState { members: PartyMember[]; max_size: number; enabled: boolean }

export const CLASSES = ["warrior", "mage", "priest", "rogue"];
export function initialState(): PartyState {
  return {
    max_size: 5,
    enabled: true,
    members: [
      { key: "p1", name: "阿凯", class_name: "warrior", ready: true, leader: true },
      { key: "p2", name: "莉莉", class_name: "mage", ready: false, leader: false },
    ],
  };
}
export function invite(state: PartyState, memberKey: string, name: string, class_name: string): PartyState {
  if (!state.enabled) throw new Error("party is disabled");
  if (state.members.length >= state.max_size) throw new Error(`party full (${state.max_size})`);
  if (state.members.some((m) => m.key === memberKey)) throw new Error(`member exists: ${memberKey}`);
  if (!CLASSES.includes(class_name)) throw new Error(`unknown class: ${class_name}`);
  return { ...state, members: [...state.members, { key: memberKey, name, class_name, ready: false, leader: false }] };
}
export function kick(state: PartyState, memberKey: string): PartyState {
  if (!state.enabled) throw new Error("party is disabled");
  const member = state.members.find((m) => m.key === memberKey);
  if (!member) throw new Error(`unknown member: ${memberKey}`);
  if (member.leader) throw new Error("cannot kick the leader");
  return { ...state, members: state.members.filter((m) => m.key !== memberKey) };
}
export function setReady(state: PartyState, memberKey: string, ready: boolean): PartyState {
  if (!state.enabled) throw new Error("party is disabled");
  if (!state.members.some((m) => m.key === memberKey)) throw new Error(`unknown member: ${memberKey}`);
  return { ...state, members: state.members.map((m) => (m.key === memberKey ? { ...m, ready } : m)) };
}
export function canStart(state: PartyState): boolean {
  return state.members.length >= 2 && state.members.every((m) => m.ready);
}
export function apply(intent: string, payload: Record<string, unknown>, state: PartyState): PartyState {
  switch (intent) {
    case "party.invite": return invite(state, String(payload.member_id), String(payload.name), String(payload.class_name));
    case "party.kick": return kick(state, String(payload.member_id));
    case "party.set_ready": return setReady(state, String(payload.member_id), Boolean(payload.ready));
    default:
      if (intent.startsWith("party.kick.")) return kick(state, intent.slice("party.kick.".length));
      if (intent.startsWith("party.set_ready.")) return setReady(state, intent.slice("party.set_ready.".length), Boolean(payload.ready ?? true));
      if (intent.startsWith("party.invite.")) return invite(state, intent.slice("party.invite.".length), String(payload.name ?? intent.slice("party.invite.".length)), String(payload.class_name ?? "warrior"));
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "party.invite.p3", payload: { member_id: "p3", name: "石头", class_name: "priest" }, source_node_key: "invite-p3", label: "invite priest 石头" },
    { intent: "party.set_ready.p2", payload: { member_id: "p2", ready: true }, source_node_key: "ready-p2", label: "莉莉 ready" },
    { intent: "party.set_ready.p3", payload: { member_id: "p3", ready: true }, source_node_key: "ready-p3", label: "石头 ready -> can start" },
    { intent: "party.kick.p3", payload: { member_id: "p3" }, source_node_key: "kick-p3", label: "kick 石头 (drops below all-ready)" },
    { intent: "party.invite.p4", payload: { member_id: "p4", name: "影刃", class_name: "rogue" }, source_node_key: "invite-p4", label: "invite rogue 影刃" },
  ];
}
export function expectedFinal() {
  return {
    member_keys: ["p1", "p2", "p4"],
    ready_flags: [true, true, false],
    can_start: false,
    size: 3,
  };
}
export function stateOf(state: PartyState) {
  return {
    member_keys: state.members.map((m) => m.key),
    ready_flags: state.members.map((m) => m.ready),
    can_start: canStart(state),
    size: state.members.length,
  };
}
