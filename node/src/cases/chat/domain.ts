// Case 6: chat — message append, channel filter, sender coloring, input commit.
export interface ChatMessage { id: number; channel: string; sender: string; text: string; timestamp: number }
export interface ChatState { messages: ChatMessage[]; channels: string[]; active_channel: string; next_id: number; enabled: boolean }

export const CHANNELS = ["world", "party", "whisper"];
export function initialState(): ChatState {
  return {
    messages: [
      { id: 1, channel: "world", sender: "system", text: "欢迎来到世界频道", timestamp: 0 },
    ],
    channels: [...CHANNELS],
    active_channel: "world",
    next_id: 2,
    enabled: true,
  };
}
export function send(state: ChatState, channel: string, sender: string, text: string): ChatState {
  if (!state.enabled) throw new Error("chat is disabled");
  if (!state.channels.includes(channel)) throw new Error(`unknown channel: ${channel}`);
  if (!text.trim()) throw new Error("empty message");
  return {
    ...state,
    messages: [...state.messages, { id: state.next_id, channel, sender, text, timestamp: state.messages.length }],
    next_id: state.next_id + 1,
  };
}
export function switchChannel(state: ChatState, channel: string): ChatState {
  if (!state.enabled) throw new Error("chat is disabled");
  if (!state.channels.includes(channel)) throw new Error(`unknown channel: ${channel}`);
  return { ...state, active_channel: channel };
}
export function visibleMessages(state: ChatState): ChatMessage[] {
  return state.messages.filter((m) => m.channel === state.active_channel || m.channel === "world");
}
export function apply(intent: string, payload: Record<string, unknown>, state: ChatState): ChatState {
  switch (intent) {
    case "chat.send": return send(state, String(payload.channel ?? "world"), String(payload.sender ?? "player"), String(payload.text));
    case "chat.switch_channel": return switchChannel(state, String(payload.channel));
    default:
      if (intent.startsWith("chat.switch_channel.")) return switchChannel(state, intent.slice("chat.switch_channel.".length));
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "chat.switch_channel.party", payload: { channel: "party" }, source_node_key: "channel-party", label: "switch to party channel" },
    { intent: "chat.send", payload: { channel: "party", sender: "player", text: "集合开团" }, source_node_key: "chat-input-send", label: "send party message" },
    { intent: "chat.send", payload: { channel: "world", sender: "system", text: "世界公告：维护完成" }, source_node_key: "chat-input-send", label: "world broadcast arrives" },
    { intent: "chat.switch_channel.world", payload: { channel: "world" }, source_node_key: "channel-world", label: "switch back to world" },
    { intent: "chat.send", payload: { channel: "whisper", sender: "friend", text: "私聊你好" }, source_node_key: "chat-input-send", label: "whisper arrives" },
  ];
}
export function expectedFinal() {
  return {
    active_channel: "world",
    visible_ids: [1, 3],
    world_count: 2,
    party_count: 1,
    whisper_count: 1,
  };
}
export function stateOf(state: ChatState) {
  const count = (channel: string) => state.messages.filter((m) => m.channel === channel).length;
  return {
    active_channel: state.active_channel,
    visible_ids: visibleMessages(state).map((m) => m.id),
    world_count: count("world"),
    party_count: count("party"),
    whisper_count: count("whisper"),
  };
}
