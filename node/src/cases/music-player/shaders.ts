import { shaderSourceDigest, type ShaderPackage } from "@neon3/sdk";

const encoder = new TextEncoder();

// ============================================================================
// pulse-glass v12 — deep black glass with FLOWING diagonal specular bands
//
// User requirements:
//   1. More black — base alpha 0.72, near-black body
//   2. Visible motion — both specular bands drift slowly sideways over time
//   3. High contrast — bands go bright (near-white-hot), body stays pure dark
// ============================================================================
const pulseGlass = `
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;

  // Bottom-left region: fully transparent, no glass at all
  // BL quadrant: p.x < 0.5 && p.y > 0.5
  let bl_x = step(0.5, p.x);
  let bl_y = step(0.5, 1.0 - p.y);
  let in_bl = (1.0 - bl_x) * (1.0 - bl_y);
  if (in_bl > 0.5) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // near-pure black glass
  let glass_rgb = vec3<f32>(0.001, 0.002, 0.0015);
  let glass_alpha = 0.55;

  // color gradient: dark = green, bright = yellow
  let green_dim = vec3<f32>(0.38, 1.0, 0.04);
  let yellow_bright = vec3<f32>(0.76, 1.0, 0.10);

  // Rotate UVs for diagonal specular bands (~24 deg)
  let ang = 0.42;
  let ca = cos(ang);
  let sa = sin(ang);

  // TOP-LEFT diagonal highlight
  let tl_rx = (p.x - 0.0) * ca - (p.y - 0.0) * sa;
  let tl_ry = (p.x - 0.0) * sa + (p.y - 0.0) * ca;
  let tl_length = 1.0 - smoothstep(0.12, 0.50, tl_ry);
  let tl_core = 1.0 - smoothstep(0.0, 0.014, abs(tl_rx - 0.02));
  let tl_glow = exp(-pow(abs(tl_rx - 0.02) * 7.0, 1.5)) * 0.4;
  let tl_core_mask = tl_core * tl_length;
  let tl_glow_mask = tl_glow * tl_length;
  let tl_breath = 0.60 + 0.40 * (0.5 + 0.5 * sin(t * 1.6) + 0.3 * sin(t * 2.7 + 1.0)) / 1.3;
  let tl_highlight = (tl_core_mask + tl_glow_mask) * tl_breath;

  // BOTTOM-RIGHT diagonal highlight
  let br_rx = (p.x - 1.0) * ca - (p.y - 1.0) * sa;
  let br_ry = (p.x - 1.0) * sa + (p.y - 1.0) * ca;
  let br_length = 1.0 - smoothstep(0.12, 0.50, -br_ry);
  let br_core = 1.0 - smoothstep(0.0, 0.014, abs(br_rx + 0.02));
  let br_glow = exp(-pow(abs(br_rx + 0.02) * 7.0, 1.5)) * 0.4;
  let br_core_mask = br_core * br_length;
  let br_glow_mask = br_glow * br_length;
  let br_breath = 0.55 + 0.45 * (0.5 + 0.5 * sin(t * 1.3 + 2.0) + 0.3 * sin(t * 2.2 + 0.5)) / 1.3;
  let br_highlight = (br_core_mask + br_glow_mask) * br_breath;

  let edge = 1.0 - smoothstep(0.0, 0.008, input.geometry_edge);

  let total_hl = min(tl_highlight + br_highlight, 1.0);
  let core_hl = tl_core_mask * tl_breath + br_core_mask * br_breath;

  // color by brightness: brighter -> more yellow, dimmer -> more green
  let hl_color = mix(green_dim, yellow_bright, smoothstep(0.0, 0.7, total_hl));
  let core_color = mix(green_dim, yellow_bright, smoothstep(0.2, 0.9, core_hl));

  let rgb = glass_rgb
          + core_color * core_hl * 0.85
          + hl_color * (total_hl - core_hl) * 0.7
          + green_dim * edge * 0.06;
  let alpha = glass_alpha + total_hl * 0.12 + edge * 0.01;

  return vec4<f32>(rgb, clamp(alpha, 0.0, 0.78));
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

const pulseSplash = `
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;

  let black = vec3<f32>(0.0, 0.0, 0.0);
  let green_dim = vec3<f32>(0.12, 0.45, 0.02);
  let green_mid = vec3<f32>(0.38, 1.0, 0.05);
  let yellow_bright = vec3<f32>(0.82, 1.0, 0.12);

  let ang = 0.55;
  let ca = cos(ang);
  let sa = sin(ang);

  let crx = (p.x - 0.62) * ca - (p.y - 0.38) * sa;
  let cry = (p.x - 0.62) * sa + (p.y - 0.38) * ca;
  let cw = 0.32;
  let cl = 0.52;
  let in_crystal = (1.0 - smoothstep(0.0, 0.012, abs(crx) - cw))
                 * (1.0 - smoothstep(0.0, 0.012, abs(cry) - cl));

  let facet_a = (1.0 - smoothstep(0.0, 0.006, abs(crx + 0.14))) * in_crystal;
  let facet_b = (1.0 - smoothstep(0.0, 0.006, abs(crx - 0.06))) * in_crystal;
  let facet_c = (1.0 - smoothstep(0.0, 0.006, abs(cry + 0.18))) * in_crystal;
  let facet_d = (1.0 - smoothstep(0.0, 0.006, abs(cry - 0.10))) * in_crystal;

  let facet_var = 0.35 + 0.25 * sin(crx * 9.0 + 1.0) + 0.2 * sin(cry * 7.0);

  let crystal_edge = (1.0 - smoothstep(0.0, 0.006, abs(abs(crx) - cw)))
                   + (1.0 - smoothstep(0.0, 0.006, abs(abs(cry) - cl)));
  let crystal_edge_glow = exp(-pow(max(abs(crx) - cw, 0.0) * 12.0, 1.3)) * 0.3
                        + exp(-pow(max(abs(cry) - cl, 0.0) * 12.0, 1.3)) * 0.3;

  let scan_dir = vec2<f32>(0.7071, 0.7071);
  let scan_proj = p.x * scan_dir.x + p.y * scan_dir.y;
  let scan_pos = fract(t * 0.22) * 1.6 - 0.3;
  let scan_dist = abs(scan_proj - scan_pos);
  let scan_core = exp(-pow(scan_dist * 18.0, 1.5)) * 1.8;
  let scan_glow = exp(-pow(scan_dist * 6.0, 1.3)) * 0.45;

  let e1 = exp(-pow(abs(crx - 0.04 + sin(t * 0.7) * 0.12) * 22.0, 1.5)) * in_crystal * 0.35;
  let e2 = exp(-pow(abs(cry - 0.08 + cos(t * 0.55) * 0.14) * 20.0, 1.5)) * in_crystal * 0.3;
  let e3 = exp(-pow(abs(crx + cry * 0.3 - 0.1 + sin(t * 0.9) * 0.08) * 16.0, 1.5)) * in_crystal * 0.2;

  let breath = 0.75 + 0.25 * sin(t * 0.8);

  let total = in_crystal * (0.35 + facet_var * 0.3) * breath
            + (facet_a + facet_b + facet_c + facet_d) * 0.25
            + crystal_edge * 0.7
            + crystal_edge_glow * 0.4
            + scan_core * 0.7
            + scan_glow * 0.35
            + e1 + e2 + e3;

  let color = mix(green_dim, yellow_bright, smoothstep(0.25, 0.85, total));
  let rgb = color * total;
  let bg = vec3<f32>(0.012, 0.028, 0.012);
  let final_rgb = bg + rgb;
  return vec4<f32>(final_rgb, 1.0);
}
`;

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
    packageFor("pulse-splash", 1, pulseSplash),
    packageFor("pulse-scanline", 1, pulseScanline),
  ];
}
