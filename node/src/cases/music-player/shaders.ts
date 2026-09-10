import { shaderSourceDigest, type ShaderPackage } from "@neon3/sdk";

const encoder = new TextEncoder();

// ============================================================================
// pulse-glass v12 — deep black glass without content-crossing highlights
//
// User requirements:
//   1. More black — base alpha 0.72, near-black body
//   2. Native acrylic supplies the real backdrop treatment
//   3. No diagonal specular bands over the player content
// ============================================================================
const pulseGlass = `
fn material(input: MaterialInput) -> vec4<f32> {
  let p = input.local_position;

  // Keep the bottom-left reveal, but fade both quadrant edges instead of
  // creating a hard rectangular transparency boundary.
  let left_fade = 1.0 - smoothstep(0.38, 0.62, p.x);
  let bottom_fade = smoothstep(0.38, 0.62, p.y);
  let transparent_mask = left_fade * bottom_fade;
  let glass_alpha = 0.55 * (1.0 - transparent_mask);

  // Keep the player shell dark; the native acrylic backdrop owns blur and tint.
  return vec4<f32>(0.001, 0.002, 0.0015, glass_alpha);
}
`;

// ============================================================================
// pulse-flow-light v9 — faint ambient edge bloom with slow breathing
//
// Stays very dark (alpha cap 0.28). Only faint glow near top/right edges.
// Slow sinusoidal breathing gives subtle life without drawing attention.
// ============================================================================
const pulseFlowLight = `
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;

  // Bottom-left: fully transparent
  let bl_x = step(0.5, p.x);
  let bl_y = step(0.5, 1.0 - p.y);
  let in_bl = (1.0 - bl_x) * (1.0 - bl_y);
  if (in_bl > 0.5) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let green_dim = vec3<f32>(0.36, 1.0, 0.04);
  let yellow_bright = vec3<f32>(0.92, 1.0, 0.14);

  let tl_dx = p.x * 1.3;
  let tl_dy = p.y * 1.0;
  let tl_r2 = tl_dx * tl_dx + tl_dy * tl_dy;
  let tl = exp(-tl_r2 * 4.0) * (0.50 + 0.50 * sin(t * 1.4));

  let br_dx = (1.0 - p.x) * 1.3;
  let br_dy = (1.0 - p.y) * 1.0;
  let br_r2 = br_dx * br_dx + br_dy * br_dy;
  let br = exp(-br_r2 * 4.0) * (0.45 + 0.55 * sin(t * 1.1 + 1.5));

  let intensity = tl * 0.28 + br * 0.25;
  let color = mix(green_dim, yellow_bright, smoothstep(0.0, 0.25, intensity)) * (0.45 + intensity * 0.70);
  let alpha = clamp(intensity * 0.45, 0.0, 0.14);
  return vec4<f32>(color, alpha);
}
`;

// ============================================================================
// pulse-neon-edge v8 — FLOWING rim light (wave modulation along each edge)
//
// User wants visible motion on the edge. Instead of discrete travelling
// segments (which looked busy), this uses a smooth sinusoidal wave that
// travels along each edge. The wave modulates edge brightness, creating a
// "current flowing around the frame" effect. Corners stay hot. High
// contrast: wave peaks go near-white-hot, troughs stay at base rim level.
// ============================================================================
const pulseNeonEdge = `
// Organic flowing wave — multiple frequencies stacked.
fn flow_wave(coord: f32, t: f32, speed: f32, phase: f32) -> f32 {
  let w1 = sin(coord * 3.14159 + t * speed + phase);
  let w2 = sin(coord * 7.854 + t * speed * 0.7 + phase * 1.7) * 0.45;
  let w3 = sin(coord * 14.0 + t * speed * 1.3 + phase * 0.6) * 0.20;
  let combined = (w1 + w2 + w3) / 1.65;
  return 0.5 + 0.5 * combined;
}

fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;

  // color gradient: dim = green, bright = yellow
  let green_dim = vec3<f32>(0.40, 1.0, 0.05);
  let yellow_bright = vec3<f32>(0.76, 1.0, 0.10);
  let white = vec3<f32>(0.92, 0.94, 0.88);

  // Bottom-left: mask EDGE light only, left light passes through
  let bl_x = step(0.5, p.x);
  let bl_y = step(0.5, 1.0 - p.y);
  let in_bl = (1.0 - bl_x) * (1.0 - bl_y);
  let edge_mask = 1.0 - in_bl;

  // Rotate for diagonal
  let ang = 0.42;
  let ca = cos(ang);
  let sa = sin(ang);

  // LEFT vertical light band — vertical rect against left edge, slanted top/bottom cuts
  let band_cx = 0.022;
  let band_half_w = 0.016;
  // horizontal: hard rectangular width
  let in_width = 1.0 - smoothstep(0.0, 0.004, abs(p.x - band_cx) - band_half_w);
  // vertical: top and bottom edges are slanted (diagonal cuts)
  let cut_slope = 0.28;
  let y_top = cut_slope * (p.x - band_cx) + 0.06;
  let y_bot = 1.0 - cut_slope * (p.x - band_cx) - 0.06;
  let in_height = smoothstep(y_top - 0.008, y_top + 0.008, p.y)
                * (1.0 - smoothstep(y_bot - 0.008, y_bot + 0.008, p.y));
  // inner brightness: left edge (near screen edge) slightly brighter
  let left_inner = 0.7 + 0.3 * (1.0 - abs(p.x - band_cx) / band_half_w);
  let left_rect = in_width * in_height * left_inner;
  // outer soft glow to the right of the band
  let left_glow = exp(-pow(max(p.x - band_cx - band_half_w, 0.0) * 10.0, 1.4)) * in_height * 0.4;
  let left_breath = 0.55 + 0.45 * sin(t * 1.6 + 0.5);
  let left_light = (left_rect + left_glow) * left_breath;

  let edge_dist = input.geometry_edge;
  let edge_line = 1.0 - smoothstep(0.0, 0.016, edge_dist);
  let inner_diffusion = 1.0 - smoothstep(0.0, 0.09, edge_dist);

  // white glass edge border with subtle perturbation
  let rim_wave = (flow_wave(p.y * 2.0 + p.x * 0.8, t, 0.5, 0.0) - 0.5) * 0.003;
  let white_rim = (1.0 - smoothstep(0.004, 0.010, edge_dist + rim_wave)) * edge_mask;
  let white_rim_glow = (1.0 - smoothstep(0.004, 0.028, edge_dist + rim_wave)) * 0.35 * edge_mask;
  // corner white edges — arc distance from each corner ensures corners get white
  let tl_d = sqrt(p.x * p.x + p.y * p.y);
  let tr_d = sqrt((1.0 - p.x) * (1.0 - p.x) + p.y * p.y);
  let bl_d = sqrt(p.x * p.x + (1.0 - p.y) * (1.0 - p.y));
  let br_d = sqrt((1.0 - p.x) * (1.0 - p.x) + (1.0 - p.y) * (1.0 - p.y));
  let min_corner_d = min(min(tl_d, tr_d), min(bl_d, br_d));
  let corner_white = (1.0 - smoothstep(0.003, 0.009, min_corner_d + rim_wave)) * edge_mask;

  // white lines along the slanted cuts of the left band (reuse vars above)
  // top slanted cut: y = cut_slope*(x-band_cx) + 0.06
  let top_cut_y = cut_slope * (p.x - band_cx) + 0.06;
  let top_cut_dist = abs(p.y - top_cut_y) / sqrt(cut_slope * cut_slope + 1.0);
  let top_cut_wave = flow_wave(p.x * 3.0, t, 0.7, 1.0) * 0.002;
  let top_cut_white = (1.0 - smoothstep(0.005, 0.012, top_cut_dist + top_cut_wave))
                    * step(0.0, p.x) * step(p.x, band_cx + band_half_w + 0.01)
                    * step(p.y, 0.18);
  // bottom slanted cut: y = 1.0 - cut_slope*(x-band_cx) - 0.06
  let bot_cut_y = 1.0 - cut_slope * (p.x - band_cx) - 0.06;
  let bot_cut_dist = abs(p.y - bot_cut_y) / sqrt(cut_slope * cut_slope + 1.0);
  let bot_cut_wave = flow_wave(p.x * 3.0, t, 0.7, 2.0) * 0.002;
  let bot_cut_white = (1.0 - smoothstep(0.005, 0.012, bot_cut_dist + bot_cut_wave))
                    * step(0.0, p.x) * step(p.x, band_cx + band_half_w + 0.01)
                    * step(0.82, p.y);
  let slanted_white = top_cut_white + bot_cut_white;

  let top_side = 1.0 - smoothstep(0.0, 0.016, p.y);
  let bot_side = 1.0 - smoothstep(0.0, 0.016, 1.0 - p.y);
  let left_side = 1.0 - smoothstep(0.0, 0.016, p.x);
  let right_side = 1.0 - smoothstep(0.0, 0.016, 1.0 - p.x);

  let top_wave = flow_wave(p.x, t, 1.1, 0.0);
  let bot_wave = flow_wave(1.0 - p.x, t, 0.9, 2.1);
  let left_wave = flow_wave(1.0 - p.y, t, 1.0, 1.0);
  let right_wave = flow_wave(p.y, t, 1.2, 3.2);

  let top_peak = pow(top_wave, 8.0);
  let bot_peak = pow(bot_wave, 8.0);
  let left_peak = pow(left_wave, 8.0);
  let right_peak = pow(right_wave, 8.0);

  let flowing_line = top_side * top_peak + bot_side * bot_peak
                   + left_side * left_peak + right_side * right_peak;

  let corner_tl = exp(-(p.x * p.x + p.y * p.y) * 18.0);
  let corner_tr = exp(-((1.0 - p.x) * (1.0 - p.x) + p.y * p.y) * 18.0);
  let corner_bl = exp(-(p.x * p.x + (1.0 - p.y) * (1.0 - p.y)) * 18.0);
  let corner_br = exp(-((1.0 - p.x) * (1.0 - p.x) + (1.0 - p.y) * (1.0 - p.y)) * 18.0);
  let corners = corner_tl + corner_tr + corner_bl + corner_br;

  let pulse = 0.75 + 0.25 * sin(t * 1.8);

  let core_energy = flowing_line * edge_line * 1.1 * pulse * edge_mask;
  let glow_energy = flowing_line * inner_diffusion * 0.25 * pulse * edge_mask;
  let corner_energy = corners * 0.6 * edge_mask;
  let corner_glow = corners * inner_diffusion * 0.2 * edge_mask;

  let total_energy = core_energy + glow_energy + corner_energy + corner_glow;
  // color by energy: bright -> yellow, dim -> green
  let neon_color = mix(green_dim, yellow_bright, smoothstep(0.0, 0.6, total_energy));

  let left_color = mix(green_dim, yellow_bright, smoothstep(0.0, 0.5, left_light));
  let rgb = neon_color * (core_energy + corner_energy) * 1.3
          + neon_color * (glow_energy + corner_glow) * 0.9
          + left_color * left_light * 1.2
          + white * (white_rim * 0.55 + white_rim_glow * 0.18 + corner_white * 0.5 + slanted_white * 0.5);

  let alpha = clamp(core_energy * 0.8 + glow_energy * 0.4 + corner_energy * 0.5 + corner_glow * 0.2 + left_light * 0.6 + white_rim * 0.28 + white_rim_glow * 0.09 + corner_white * 0.25 + slanted_white * 0.25, 0.0, 0.92);
  return vec4<f32>(rgb, alpha);
}
`;

// ============================================================================
// pulse-neon-ring v5 — bright flowing halo for the play button
//
// Narrow bright core + wide soft halo + rotating specular arc. The arc is
// wider and brighter now (pow 6 instead of 8) so the rotation is clearly
// visible. Strong pulse for high contrast.
// ============================================================================
const pulseNeonRing = `
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let size = input.bounds.zw;
  let c = (input.local_position - 0.5) * size;
  let r = length(c);
  let radius = min(size.x, size.y) * 0.5 - 2.5;

  let green_dim = vec3<f32>(0.40, 1.0, 0.05);
  let yellow_bright = vec3<f32>(0.76, 1.0, 0.10);

  let ring = exp(-pow((r - radius) * 0.60, 2.0)) * 0.85;
  let halo = exp(-pow(max(r - radius, 0.0) * 0.14, 1.5)) * 0.40;
  let inner_glow = exp(-pow(max(radius - r, 0.0) * 0.22, 1.5)) * 0.10;

  let ang = atan2(c.y, c.x);
  let arc_wave = 0.5 + 0.5 * (sin(ang * 2.0 - t * 1.5) + 0.4 * sin(ang * 5.0 + t * 2.2 + 1.0)) / 1.4;
  let arc = pow(arc_wave, 5.0) * ring * 0.9;

  let pulse = 0.80 + 0.20 * sin(t * 2.0);

  let core = ring * (0.82 + pulse * 0.18) + halo + inner_glow + arc;
  let ring_color = mix(green_dim, yellow_bright, smoothstep(0.1, 0.7, core));

  let rgb = ring_color * (arc + ring * 0.3) * 1.3
          + ring_color * (halo + inner_glow + ring * 0.5) * 1.1;

  return vec4<f32>(rgb, clamp(core * 0.88, 0.0, 0.93));
}
`;

// Splash scan-reveal duration in seconds. Shared with the host so the auto
// cleanup timeout stays in lockstep with the shader sweep; changing this one
// value updates both the WGSL animation and the JS teardown timer.
export const SPLASH_REVEAL_SECONDS = 1.0;

function pulseSplashSource(revealSeconds: number): string {
return `
fn splash_hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn splash_noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(splash_hash(i + vec2<f32>(0.0, 0.0)), splash_hash(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(splash_hash(i + vec2<f32>(0.0, 1.0)), splash_hash(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}

fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;

  // Colors — deep green neon palette
  let bg_deep = vec3<f32>(0.008, 0.02, 0.008);
  let green_dim = vec3<f32>(0.10, 0.42, 0.02);
  let green_mid = vec3<f32>(0.35, 1.0, 0.06);
  let yellow_bright = vec3<f32>(0.78, 1.0, 0.14);
  let white_hot = vec3<f32>(0.9, 0.95, 0.85);

  // === BACKGROUND GRID (subtle, pulsing) ===
  let grid_scale = 24.0;
  let grid_pos = p * grid_scale;
  let grid_f = fract(grid_pos);
  let grid_line = (1.0 - smoothstep(0.0, 0.04, min(grid_f.x, grid_f.y))) * 0.05;
  let grid_pulse = 0.5 + 0.5 * sin(t * 1.2 + p.y * 6.0);
  let grid = grid_line * (0.4 + grid_pulse * 0.6);

  // === RADIAL GLOW from center ===
  let center = vec2<f32>(0.5, 0.42);
  let dist_c = distance(p, center);
  let radial_glow = exp(-dist_c * dist_c * 6.0) * 0.18;

  // === CENTER GLOW (soft radial, no rings) ===
  let inner_glow = exp(-dist_c * dist_c * 10.0) * 0.15;

  // === ENERGY PARTICLES ===
  var particles = 0.0;
  for (var i = 0; i < 14; i = i + 1) {
    let fi = f32(i);
    let px = splash_hash(vec2<f32>(fi, 1.0));
    let py = splash_hash(vec2<f32>(fi, 2.0));
    let speed = 0.12 + splash_hash(vec2<f32>(fi, 3.0)) * 0.2;
    let phase = splash_hash(vec2<f32>(fi, 4.0)) * 6.28;
    let ppx = fract(px + t * speed * 0.08);
    let ppy = fract(py + t * speed * 0.05 + sin(t * 0.5 + phase) * 0.02);
    let pd = distance(p, vec2<f32>(ppx, ppy));
    let psize = 0.004 + splash_hash(vec2<f32>(fi, 5.0)) * 0.005;
    particles = particles + exp(-pd * pd / (psize * psize)) * (0.5 + 0.5 * sin(t * 2.0 + phase));
  }

  // === CORNER HUD BRACKETS ===
  let bracket_len = 0.06;
  let bracket_w = 0.003;
  let tl_bracket = (1.0 - smoothstep(0.0, bracket_w, p.x - 0.04)) * (1.0 - smoothstep(0.0, bracket_w, p.y - 0.04))
                 * (step(p.x, 0.04 + bracket_len) + step(p.y, 0.04 + bracket_len) - 1.0);
  let br_bracket = (1.0 - smoothstep(0.0, bracket_w, 0.96 - p.x)) * (1.0 - smoothstep(0.0, bracket_w, 0.96 - p.y))
                 * (step(0.96 - bracket_len, p.x) + step(0.96 - bracket_len, p.y) - 1.0);
  let hud = max(tl_bracket, br_bracket) * 0.5;

  // === BREATHING ===
  let breath = 0.7 + 0.3 * sin(t * 0.9);

  // === TOTAL ENERGY ===
  let total = grid * 0.5
            + radial_glow
            + inner_glow * breath
            + particles * 0.4
            + hud * 0.5;

  let color = mix(green_dim, yellow_bright, smoothstep(0.2, 0.75, total));
  let hot = smoothstep(0.7, 1.0, total);
  let rgb = bg_deep + color * total * 0.9 + white_hot * hot * 0.3;

  // === SCAN REVEAL: diagonal sweep from top-left to bottom-right ===
  let scan_start_t = 0.0;
  let scan_end_t = ${revealSeconds.toFixed(2)};
  let scan_progress = clamp((t - scan_start_t) / (scan_end_t - scan_start_t), 0.0, 1.0);

  let scan_dir = vec2<f32>(0.7071, 0.7071);
  let pixel_proj = p.x * scan_dir.x + p.y * scan_dir.y;
  let scan_pos = -0.2 + scan_progress * 1.8;
  let scan_dist = pixel_proj - scan_pos;

  let reveal_width = 0.06;
  let fracture_offset = (splash_noise(p * 18.0 + vec2<f32>(t * 0.04, -t * 0.02)) - 0.5) * 0.14;
  let reveal = smoothstep(-reveal_width, reveal_width, scan_dist + fracture_offset);
  // reveal=1 means still covered (splash visible), reveal=0 means revealed (splash transparent)

  // Scan line glow at the leading edge
  let line_core = exp(-pow(abs(scan_dist) * 28.0, 1.3)) * 1.5;
  let line_glow = exp(-pow(abs(scan_dist) * 10.0, 1.1)) * 0.5;
  let scan_color = mix(green_mid, yellow_bright, 0.6);
  let broken_line = 0.40 + 0.60 * splash_noise(vec2<f32>(p.x * 26.0, p.y * 9.0) + vec2<f32>(t * 0.06, 0.0));
  let final_rgb = rgb + scan_color * (line_core * broken_line + line_glow) * reveal;

  // Emit GPU->CPU event when the sweep has fully revealed the player.
  // FNV-1a 32-bit hash of "pulse.splash.complete" = 1196989152.
  if (t >= scan_end_t) {
    emit_shader_event(1196989152u, vec4<f32>(t, 0.0, 0.0, 0.0));
  }
  let alpha = clamp(reveal, 0.0, 1.0);

  return vec4<f32>(final_rgb, alpha);
}
`;
}

const pulseScanline = `
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;

  let green = vec3<f32>(0.5, 1.0, 0.08);
  let yellow = vec3<f32>(0.88, 1.0, 0.18);
  let white = vec3<f32>(0.95, 0.97, 0.92);

  let dir = vec2<f32>(0.7071, 0.7071);
  let proj = p.x * dir.x + p.y * dir.y;

  let scan_pos = -0.2 + fract(t * 0.35) * 1.7;
  let dist = abs(proj - scan_pos);

  let glow = exp(-pow(dist * 7.0, 1.3)) * 0.55;
  let flash = exp(-pow(dist * 35.0, 2.0)) * 0.9;

  let wave = sin(p.y * 12.0 + t * 3.0) * 0.008 + sin(p.x * 9.0 + t * 2.0) * 0.006;
  let dist_wave = abs(proj - scan_pos + wave);
  let core_wave = exp(-pow(dist_wave * 28.0, 1.5)) * 2.2;

  let line_color = mix(green, yellow, smoothstep(0.3, 0.9, core_wave));
  let rgb = line_color * (core_wave + glow) * 0.85 + white * flash;
  let alpha = clamp(core_wave * 0.55 + glow * 0.25 + flash * 0.35, 0.0, 0.9);
  return vec4<f32>(rgb, alpha);
}
`;

function packageFor(packageId: string, version: number, source: string): ShaderPackage {
  const sourceBytes = encoder.encode(source);
  return {
    package_id: packageId,
    version,
    source_digest: shaderSourceDigest(sourceBytes),
    source_bytes: [...sourceBytes],
    entry_point: "material",
    fallback: "standard_ui",
    parameters: [],
  };
}

export function pulseShaderPackages(): ShaderPackage[] {
  return [
    packageFor("pulse-glass", 27, pulseGlass),
    packageFor("pulse-flow-light", 20, pulseFlowLight),
    packageFor("pulse-neon-edge", 24, pulseNeonEdge),
    packageFor("pulse-neon-ring", 12, pulseNeonRing),
    packageFor("pulse-splash", 2, pulseSplashSource(SPLASH_REVEAL_SECONDS)),
    packageFor("pulse-scanline", 1, pulseScanline),
  ];
}
