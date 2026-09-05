// Case 6: chat NUI Flow source (channel tabs, message list, input).
export function flow(): string {
  const channels = CHANNELS.map((channel, index) =>
    `      button channel-${channel} h 28 w 80 value "频道 ${channel}" event chat.switch_channel.${channel}`).join("\n");
  return `version 1
surface surface.chat-demo revision 1
budget nodes=256 bindings=40 instances=256 text=256 glyphs=2048 events=600 clips=256
input active_channel enum:world|party|whisper default world
input message_count i32 default 1
input world_count i32 default 1
input party_count i32 default 0
input whisper_count i32 default 0
input has_messages bool default true
input chat_empty bool default false
input chat_compose text default text:empty
input enabled bool default true
flow chat-lab
surface chat-demo overlay w 720 h 520 fill #17212B
  panel chat-panel column x 40 y 40 w 640 h 440 gap 8 pad 12 fill #1C2A35 line #4E6A7F radius 6
    panel chat-header row w 616 h 36 gap 6 align center
      text chat-title value "聊天" h 26
${channels}
      text chat-world-label value "世界" h 22
      text chat-world-count value "0" h 22
      text chat-party-label value "队伍" h 22
      text chat-party-count value "0" h 22
      text chat-whisper-label value "私聊" h 22
      text chat-whisper-count value "0" h 22
    panel chat-list column w 616 h 300 gap 4 pad 8 fill #22313D line #4E6A7F radius 4
      branch chat-empty when $chat_empty
        text chat-empty-label value "暂无消息" h 22
      branch chat-has when $has_messages
        text chat-sample-label value "消息区" h 22
        text chat-sample-count value "0" h 22
        text chat-sample-suffix value "条" h 22
    panel chat-input-row row w 616 h 40 gap 8 align center
      input chat-compose w 500 h 32 value $chat_compose event chat.draft
      button chat-input-send h 32 w 96 value "发送" event chat.send
`;
}
export const CHANNELS = ["world", "party", "whisper"];
