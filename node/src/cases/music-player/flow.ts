export function flow(): string {
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
shader pulse-glass version 27 fallback standard_ui
shader pulse-neon-edge version 24 fallback standard_ui
shader pulse-neon-ring version 12 fallback standard_ui
shader pulse-flow-light version 20 fallback standard_ui
shader pulse-splash version 2 fallback standard_ui
shader pulse-scanline version 1 fallback standard_ui
shader pulse-audio-viz version 6 fallback standard_ui
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
input current_track enum:astral-crown|violet-orbit|golden-passage|monument-zero default astral-crown
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
flow music-player-lab
surface music-player-demo overlay w 360 h 720 fill #00000000
  panel flow-light-layer overlay x 0 y 0 w 360 h 720 fill #00000000 radius 0 composition_layer behind_glass
    material pulse-flow-light
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
      image now-art resource album-hero x 32 y 0 w 268 h 280 fit cover clip bounds radius 0 opacity 0.95
    panel track-row row w 332 h 44 align center
      panel track-copy column w 280 h 44 gap 0
        text now-title value "The Last Light" h 24
        text now-artist value "Moonchild" h 18
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
    panel audio-viz overlay w 332 h 200 fill #00000000 line #00000000 border_width 0 radius 0 composition_layer overlay
      material pulse-audio-viz

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
      panel pl-search row w 260 h 32 fill #1a1a1a80 radius 16 pad 8
        text pl-search-text value "Search music..." w 200 h 16
      panel pl-settings-hit overlay w 32 h 32
        button pl-settings h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.settings
        image settings-icon resource icon-settings x 0 y 0 w 32 h 32 fit contain
    panel pl-section-title row w 332 h 28 align center
      text pl-my-playlists value "My Playlists" w 200 h 24
    panel pl-list column w 332 h 440 gap 6
      panel pl-item1 row w 332 h 64 fill #1a1a1a40 radius 8 align center gap 10
        image pl-cover1 resource album-purple x 0 y 0 w 48 h 48 fit cover radius 6
        panel pl-info1 column w 200 h 48 gap 2
          text pl-name1 value "Astral Crown" w 200 h 20
          text pl-count1 value "24 songs" w 200 h 14
        panel pl-play1-hit overlay w 32 h 32 x 290 y 16
          button pl-play1 h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.play.astral
          image pl-play1-icon resource icon-play x 0 y 0 w 32 h 32 fit contain
      panel pl-item2 row w 332 h 64 fill #1a1a1a40 radius 8 align center gap 10
        image pl-cover2 resource album-gold x 0 y 0 w 48 h 48 fit cover radius 6
        panel pl-info2 column w 200 h 48 gap 2
          text pl-name2 value "Golden Passage" w 200 h 20
          text pl-count2 value "18 songs" w 200 h 14
        panel pl-play2-hit overlay w 32 h 32 x 290 y 16
          button pl-play2 h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.play.golden
          image pl-play2-icon resource icon-play x 0 y 0 w 32 h 32 fit contain
      panel pl-item3 row w 332 h 64 fill #1a1a1a40 radius 8 align center gap 10
        image pl-cover3 resource album-hero x 0 y 0 w 48 h 48 fit cover radius 6
        panel pl-info3 column w 200 h 48 gap 2
          text pl-name3 value "Violet Orbit" w 200 h 20
          text pl-count3 value "32 songs" w 200 h 14
        panel pl-play3-hit overlay w 32 h 32 x 290 y 16
          button pl-play3 h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.play.violet
          image pl-play3-icon resource icon-play x 0 y 0 w 32 h 32 fit contain
      panel pl-item4 row w 332 h 64 fill #1a1a1a40 radius 8 align center gap 10
        image pl-cover4 resource album-hero-green x 0 y 0 w 48 h 48 fit cover radius 6
        panel pl-info4 column w 200 h 48 gap 2
          text pl-name4 value "Emerald Dreams" w 200 h 20
          text pl-count4 value "15 songs" w 200 h 14
        panel pl-play4-hit overlay w 32 h 32 x 290 y 16
          button pl-play4 h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.play.emerald
          image pl-play4-icon resource icon-play x 0 y 0 w 32 h 32 fit contain
      panel pl-item5 row w 332 h 64 fill #1a1a1a40 radius 8 align center gap 10
        image pl-cover5 resource album-architecture x 0 y 0 w 48 h 48 fit cover radius 6
        panel pl-info5 column w 200 h 48 gap 2
          text pl-name5 value "Monument Zero" w 200 h 20
          text pl-count5 value "21 songs" w 200 h 14
        panel pl-play5-hit overlay w 32 h 32 x 290 y 16
          button pl-play5 h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.play.monument
          image pl-play5-icon resource icon-play x 0 y 0 w 32 h 32 fit contain
      panel pl-item6 row w 332 h 64 fill #1a1a1a40 radius 8 align center gap 10
        image pl-cover6 resource album-purple x 0 y 0 w 48 h 48 fit cover radius 6
        panel pl-info6 column w 200 h 48 gap 2
          text pl-name6 value "Neon Nights" w 200 h 20
          text pl-count6 value "28 songs" w 200 h 14
        panel pl-play6-hit overlay w 32 h 32 x 290 y 16
          button pl-play6 h 32 w 32 value " " fill #00000000 line #00000000 border_width 0 event playlist.play.neon
          image pl-play6-icon resource icon-play x 0 y 0 w 32 h 32 fit contain
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
