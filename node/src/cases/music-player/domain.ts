export interface Track { key: string; title: string; artist: string; album: string; duration: number; cover: string; liked: boolean }
export interface MusicPlayerState { active_view: string; active_tab: string; current_track: string; is_playing: boolean; position: number; duration: number; volume: number; shuffle: boolean; repeat: string; tracks: Track[]; enabled: boolean }

export function initialState(): MusicPlayerState {
  return { active_view: "home", active_tab: "recent", current_track: "astral-crown", is_playing: false, position: 34, duration: 248, volume: 72, shuffle: false, repeat: "all", tracks: [
    { key: "astral-crown", title: "The Last Light", artist: "Moonchild", album: "Neon Pulse", duration: 248, cover: "album-hero-green", liked: true },
    { key: "violet-orbit", title: "Violet Orbit", artist: "Noctis Array", album: "Night Geometry", duration: 312, cover: "album-purple", liked: false },
    { key: "golden-passage", title: "Golden Passage", artist: "Astra Forma", album: "Beyond the Gate", duration: 286, cover: "album-hero", liked: false },
    { key: "monument-zero", title: "Monument Zero", artist: "North Frame", album: "Obsidian Rooms", duration: 195, cover: "album-architecture", liked: false },
  ], enabled: true };
}
export function play(state: MusicPlayerState, key: string): MusicPlayerState { const track = state.tracks.find((item) => item.key === key); if (!track) throw new Error(`unknown track: ${key}`); return { ...state, current_track: key, duration: track.duration, position: 0, is_playing: true }; }
export function toggle(state: MusicPlayerState): MusicPlayerState { return { ...state, is_playing: !state.is_playing }; }
export function like(state: MusicPlayerState, key: string): MusicPlayerState { return { ...state, tracks: state.tracks.map((item) => item.key === key ? { ...item, liked: !item.liked } : item) }; }
export function setVolume(state: MusicPlayerState, value: number): MusicPlayerState { if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("volume out of range"); return { ...state, volume: value }; }
export function seek(state: MusicPlayerState, position: number): MusicPlayerState { if (!Number.isInteger(position) || position < 0 || position > state.duration) throw new Error("seek position out of range"); return { ...state, position }; }
export function moveTrack(state: MusicPlayerState, direction: -1 | 1): MusicPlayerState {
  const index = state.tracks.findIndex((track) => track.key === state.current_track);
  if (index < 0) throw new Error("current track is missing");
  const next = (index + direction + state.tracks.length) % state.tracks.length;
  return play(state, state.tracks[next].key);
}
export function setView(state: MusicPlayerState, active_view: string): MusicPlayerState {
  if (!["home", "library", "playlists", "favorites"].includes(active_view)) throw new Error("unknown player view");
  return { ...state, active_view };
}
export function cycleRepeat(state: MusicPlayerState): MusicPlayerState {
  const repeat = state.repeat === "off" ? "one" : state.repeat === "one" ? "all" : "off";
  return { ...state, repeat };
}
export function apply(intent: string, payload: Record<string, unknown>, state: MusicPlayerState): MusicPlayerState {
  if (intent.startsWith("player.track.play.")) return play(state, intent.slice("player.track.play.".length));
  if (intent.startsWith("player.track.like.")) return like(state, intent.slice("player.track.like.".length));
  if (intent === "player.transport.play_pause") return toggle(state);
  if (intent === "player.transport.previous") return moveTrack(state, -1);
  if (intent === "player.transport.next") return moveTrack(state, 1);
  if (intent === "player.transport.shuffle") return { ...state, shuffle: !state.shuffle };
  if (intent === "player.transport.repeat") return cycleRepeat(state);
  if (intent === "player.transport.seek") return seek(state, Number(payload.value));
  if (intent === "player.volume.commit") return setVolume(state, Number(payload.value ?? state.volume));
  if (intent === "player.track.play") return play(state, String(payload.track_id));
  if (intent.startsWith("player.view.select.")) return setView(state, intent.slice("player.view.select.".length));
  throw new Error(`unhandled intent: ${intent}`);
}
export function sequence() { return [{ intent: "player.track.play.violet-orbit", payload: { track_id: "violet-orbit" }, source_node_key: "play-violet-orbit", label: "play Violet Orbit" }, { intent: "player.track.like.violet-orbit", payload: { track_id: "violet-orbit" }, source_node_key: "like-violet-orbit", label: "like Violet Orbit" }, { intent: "player.transport.seek", payload: { value: 42 }, source_node_key: "now-progress", label: "seek" }, { intent: "player.transport.next", payload: {}, source_node_key: "next", label: "next" }, { intent: "player.transport.previous", payload: {}, source_node_key: "previous", label: "previous" }, { intent: "player.transport.play_pause", payload: {}, source_node_key: "play-pause", label: "pause" }, { intent: "player.transport.shuffle", payload: {}, source_node_key: "shuffle", label: "shuffle" }, { intent: "player.transport.repeat", payload: {}, source_node_key: "repeat", label: "repeat" }]; }
export function expectedFinal() { return { current_track: "violet-orbit", is_playing: false, position: 0, volume: 72, shuffle: true, repeat: "off", violet_liked: true }; }
export function stateOf(state: MusicPlayerState) { return { current_track: state.current_track, is_playing: state.is_playing, position: state.position, volume: state.volume, shuffle: state.shuffle, repeat: state.repeat, violet_liked: Boolean(state.tracks.find((item) => item.key === "violet-orbit")?.liked) }; }
