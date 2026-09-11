export interface FlowTrack { key: string; title: string; artist: string; album: string; duration: number; cover: string; liked: boolean }
export function flow(tracks?: FlowTrack[], activeKey?: string): string {
  const plTracks = tracks ?? [
    { key: "astral-crown", title: "The Last Light", artist: "Moonchild", album: "Neon Pulse", duration: 248, cover: "album-hero-green", liked: true },
    { key: "violet-orbit", title: "Violet Orbit", artist: "Noctis Array", album: "Night Geometry", duration: 312, cover: "album-purple", liked: false },
    { key: "golden-passage", title: "Golden Passage", artist: "Astra Forma", album: "Beyond the Gate", duration: 286, cover: "album-hero", liked: false },
    { key: "monument-zero", title: "Monument Zero", artist: "North Frame", album: "Obsidian Rooms", duration: 195, cover: "album-architecture", liked: false },
  ];
  const defaultTrack = plTracks[0]?.key ?? "";
  // Helper: build a flow-DSL rich-text JSON span array with inner quotes
  // escaped as \" so the tokenizer keeps it inside the outer double quotes.
  const rich = (spans: Array<{ value: string; color: [number, number, number, number]; scale?: number }>) =>
    JSON.stringify(spans).replace(/"/g, '\\"');
  return `version 1
resource album-purple image
resource album-gold image
resource album-hero image
resource album-hero-green image
resource album-architecture image
resource pulse-slider-track image
resource pulse-slider-fill image
resource pulse-slider-thumb image
resource pulse-control image
resource pulse-control-hover image
resource icon-menu image
resource icon-heart image
resource icon-previous image
resource icon-play image
resource icon-pause image
resource icon-next image
resource icon-shuffle image
resource icon-repeat image
resource icon-volume image
resource icon-queue image
resource icon-equalizer image
resource icon-home image
resource icon-settings image
resource icon-music-play image
${plTracks.map((t) => `resource track-cover-${t.key} image`).join("\n")}
shader pulse-glass version 27 fallback standard_ui
shader pulse-neon-edge version 24 fallback standard_ui
shader pulse-neon-ring version 12 fallback standard_ui
shader pulse-flow-light version 20 fallback standard_ui
shader pulse-splash version 2 fallback standard_ui
shader pulse-scanline version 1 fallback standard_ui
shader pulse-audio-viz version 7 fallback standard_ui
shader pulse-audio-bg version 2 fallback standard_ui
shader pulse-page-transition version 1 fallback standard_ui
skin pulse-primary button
  slot body idle resource pulse-control fit contain
  slot body hover resource pulse-control-hover fit contain
skin pulse-volume slider
  slot track idle resource pulse-slider-track nine_slice 4 4 4 4 border 4 4 4 4
  slot fill active resource pulse-slider-fill nine_slice 4 4 4 4 border 4 4 4 4
  slot thumb idle resource pulse-slider-thumb fit contain
surface surface.music-player-demo revision 3
budget nodes=256 bindings=48 instances=256 text=192 glyphs=3072 events=128 clips=192
input active_view enum:home|library|playlists|favorites default home
input current_track enum:${plTracks.map(t => t.key).join("|")} default ${defaultTrack}
input is_playing bool default false
input is_paused bool default true
input position i32:0..600 default 108
input duration i32:1..600 default 272
input volume i32:0..100 default 72
input shuffle bool default false
input repeat enum:off|one|all default all
input enabled bool default true
input _anim_tick i32:0..1000000 default 0
input app_view enum:splash|transition|player default splash
input show_splash bool default true
input show_transition bool default false
input player_visible bool default true
input playlist_visible bool default false
input page_transition bool default false
${plTracks.map((t) => `input pl_active_${t.key.replace(/-/g, "_")} bool default false`).join("\n")}
flow music-player-lab
surface music-player-demo overlay w 360 h 720 fill #00000000
  panel flow-light-layer overlay x 0 y 0 w 360 h 720 fill #00000000 radius 0 composition_layer behind_glass
    material pulse-audio-bg
  panel player-shell column x 0 y 0 w 360 h 720 gap 4 pad 14 fill #00000000 radius 0 clip bounds visible $player_visible
    geometry cut 36 36 36 36
    material pulse-glass

    panel status-row row w 332 h 16 justify between
      text time value "9:41" w 48 h 16
      text signal value "NeonMusicPlayer" w 140 h 16
    panel nav-row row w 332 h 32 gap 4 align center
      button nav-home h 30 w 62 skin pulse-primary value "Music" event player.view.select.home
      button nav-library h 30 w 78 skin pulse-primary value "Podcasts" event player.view.select.library
      button nav-playlists h 30 w 54 skin pulse-primary value "Radio" event player.view.select.playlists
      panel nav-space grow 1
      panel menu-hit overlay w 36 h 36
        button menu h 36 w 36 value " " fill #00000000 line #00000000 border_width 0 event player.view.select.favorites
        image equalizer-icon resource icon-equalizer x 0 y 0 w 36 h 36 fit contain
    panel cover-frame overlay w 332 h 280 fill #00000000 line #00000000 border_width 0 radius 0 clip bounds
      geometry cut 20 20 20 20
      button play-violet-orbit x 0 y 0 w 1 h 1 skin pulse-primary value " " event player.track.play.violet-orbit
      image now-art resource album-hero x 32 y 0 w 268 h 280 fit cover clip bounds radius 0 opacity 1.0
    panel track-row row w 332 h 44 align center
      panel track-copy column w 280 h 44 gap 0
        text now-title value "The Last Light" w 280 h 24
        text now-artist value "Moonchild" w 280 h 18
      panel favorite-hit overlay w 36 h 36
        button favorite h 36 w 36 value " " fill #00000000 line #00000000 border_width 0 event player.track.like.astral-crown
        image heart-icon resource icon-heart x 8 y 8 w 20 h 20 fit contain
    slider now-progress skin pulse-volume numeric $position enabled $enabled w 332 h 10 event player.transport.seek
    panel time-row row w 332 h 16 justify between
      text elapsed value "1:48" w 50 h 16
      text total value "4:32" w 50 h 16
    panel transport row w 332 h 72 gap 20 align center justify center
      panel previous-hit overlay w 36 h 36
        button previous h 36 w 36 value " " fill #00000000 line #00000000 border_width 0 event player.transport.previous
        image previous-icon resource icon-previous x 0 y 0 w 36 h 36 fit contain
      panel play-hit overlay w 68 h 68
        button play-pause h 68 w 68 value " " fill #00000000 line #00000000 border_width 0 event player.transport.play_pause
        image play-icon resource icon-play x 0 y 0 w 68 h 68 fit contain visible $is_paused
        image pause-icon resource icon-pause x 0 y 0 w 68 h 68 fit contain visible $is_playing
      panel next-hit overlay w 36 h 36
        button next h 36 w 36 value " " fill #00000000 line #00000000 border_width 0 event player.transport.next
        image next-icon resource icon-next x 0 y 0 w 36 h 36 fit contain
    panel mode-row row w 332 h 36 gap 32 align center justify center
      panel shuffle-hit overlay w 32 h 32
        button shuffle h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event player.transport.shuffle
        image shuffle-icon resource icon-shuffle x 0 y 0 w 32 h 32 fit contain
      panel repeat-hit overlay w 32 h 32
        button repeat h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event player.transport.repeat
        image repeat-icon resource icon-repeat x 0 y 0 w 32 h 32 fit contain
      panel volume-hit overlay w 32 h 32
        button volume h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event player.volume.commit
        image volume-icon resource icon-volume x 0 y 0 w 32 h 32 fit contain
      panel queue-hit overlay w 32 h 32
        button queue h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.open
        image queue-icon resource icon-queue x 0 y 0 w 32 h 32 fit contain

  panel shell-edge-light overlay x 0 y 0 w 360 h 720 fill #00000000 radius 0 composition_layer overlay visible $player_visible
    geometry cut 36 36 36 36
    material pulse-neon-edge

  panel playlist-shell column x 0 y 0 w 360 h 720 gap 0 pad 14 fill #00000000 radius 0 clip bounds visible $playlist_visible
    geometry cut 36 36 36 36
    material pulse-glass

    panel pl-status-row row w 332 h 16 justify between
      text pl-time value "9:41" w 48 h 16
      text pl-title value "NeonMusicPlayer" w 140 h 16
    panel pl-header row w 332 h 40 gap 8 align center
      panel pl-search row w 260 h 32 fill #1a1a1a30 radius 16 pad 8
        text pl-search-text value "Search music..." w 200 h 16
      panel pl-settings-hit overlay w 32 h 32
        button pl-settings h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.settings
        image settings-icon resource icon-settings x 0 y 0 w 32 h 32 fit contain
    panel pl-section-title row w 332 h 28 align center
      text pl-my-playlists value "My Playlists" w 200 h 24
    panel pl-list column w 332 h 440 gap 6
${plTracks.map((t, i) => {
  const activeVar = `pl_active_${t.key.replace(/-/g, "_")}`;
  return `      panel pl-item${i+1} row w 332 h 64 fill #0d0d0d30 radius 0 align center gap 12
        geometry cut 6 6 6 6
        panel pl-lpad${i+1} w 12 h 1 fill #00000000
        image pl-cover${i+1} resource ${t.cover} x 0 y 0 w 48 h 48 fit cover radius 0
        panel pl-info${i+1} column w 190 h 48 gap 3
          text pl-name${i+1} value "${t.title.replace(/"/g, '\\"')}" w 190 h 22
          text pl-count${i+1} value "${t.artist.replace(/"/g, '\\"')}" w 190 h 16
        panel pl-bar${i+1} overlay x 0 y 0 w 3 h 64 fill #A3FF12 visible $${activeVar}
        panel pl-glow${i+1} overlay x 10 y 6 w 52 h 52 fill #A3FF12 radius 0 opacity 0.15 visible $${activeVar}
        image pl-nowicon${i+1} resource icon-music-play x 292 y 18 w 28 h 28 fit contain visible $${activeVar}
        panel pl-item${i+1}-hit overlay x 0 y 1 w 332 h 63
          button pl-item${i+1}-btn h 63 w 332 value " " fill #00000000 line #00000000 border_width 0 event player.track.play.${t.key}`;
}).join("\n")}
    panel pl-spacer grow 1 fill #00000000
    panel pl-home-row row w 332 h 56 align center justify center
      panel pl-home-hit overlay w 48 h 48
        button pl-home h 48 w 48 value " " fill #00000000 line #00000000 border_width 0 event playlist.close
        image home-icon resource icon-home x 4 y 4 w 40 h 40 fit contain

  panel page-transition-overlay overlay x 0 y 0 w 360 h 720 fill #00000000 radius 0 composition_layer overlay visible $page_transition
    material pulse-page-transition
  panel splash-overlay-tr x 0 y 0 w 360 h 720 fill #00000000 radius 0 visible $show_transition
    material pulse-splash
  panel scanline-overlay overlay x 0 y 0 w 360 h 720 fill #00000000 radius 0 composition_layer overlay visible $show_transition
    material pulse-scanline
  panel splash-overlay overlay x 0 y 0 w 360 h 720 fill #00000000 radius 0 composition_layer overlay visible $show_splash
    material pulse-splash
    panel splash-content column x 24 y 0 w 312 h 720 fill #00000000 line #00000000 border_width 0 align start justify end gap 6
      text splash-kicker rich "${rich([{ value: "| ", color: [0.35, 1.0, 0.06, 1.0] }, { value: "MUSIC", color: [0.9, 0.95, 0.85, 0.85] }])}" w 280 h 16
      text splash-title rich "${rich([{ value: "P", color: [0.78, 1.0, 0.14, 1.0] }, { value: "LAYER", color: [0.35, 1.0, 0.06, 1.0] }])}" w 280 h 28
      text splash-subtitle rich "${rich([{ value: "LISTEN TO ", color: [0.15, 0.55, 0.04, 1.0] }, { value: "WHAT YOU CAN NOT SEE", color: [0.35, 1.0, 0.06, 0.9] }])}" w 280 h 16
      panel splash-underline w 160 h 2 fill #8CFF1A
      panel splash-spacer h 24 fill #00000000 border_width 0
`;
}
