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

  // deeper black, more transparent
  let glass_rgb = vec3<f32>(0.001, 0.002, 0.0015);
  let glass_alpha = 0.55;

  // neon lime green for background glow
  let lime = vec3<f32>(0.62, 1.0, 0.08);
  let lime_bright = vec3<f32>(0.50, 1.0, 0.02);

  // Rotate UVs for diagonal specular bands (~24 deg)
  let ang = 0.42;
  let ca = cos(ang);
  let sa = sin(ang);

  // TOP-LEFT diagonal highlight — slanted rectangular light sheet
  let tl_rx = (p.x - 0.0) * ca - (p.y - 0.0) * sa;
  let tl_ry = (p.x - 0.0) * sa + (p.y - 0.0) * ca;
  // shorter length = more black area
  let tl_length = 1.0 - smoothstep(0.12, 0.50, tl_ry);
  // sharp core line
  let tl_core = 1.0 - smoothstep(0.0, 0.014, abs(tl_rx - 0.02));
  // glow diffusion (like a lamp): wider soft falloff
  let tl_glow = exp(-pow(abs(tl_rx - 0.02) * 7.0, 1.5)) * 0.4;
  let tl_core_mask = tl_core * tl_length;
  let tl_glow_mask = tl_glow * tl_length;
  // subtle breathing — slow, organic
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

  // thin rim
  let edge = 1.0 - smoothstep(0.0, 0.008, input.geometry_edge);

  // composite: core is bright lime, glow is softer lime
  let total_hl = min(tl_highlight + br_highlight, 1.0);
  let core_hl = tl_core_mask * tl_breath + br_core_mask * br_breath;
  let rgb = glass_rgb
          + lime_bright * core_hl * 0.85
          + lime * (total_hl - core_hl) * 0.7
          + lime * edge * 0.06;
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

  let lime = vec3<f32>(0.55, 1.0, 0.06);

  let tl_dx = p.x * 1.3;
  let tl_dy = p.y * 1.0;
  let tl_r2 = tl_dx * tl_dx + tl_dy * tl_dy;
  let tl = exp(-tl_r2 * 4.0) * (0.50 + 0.50 * sin(t * 1.4));

  let br_dx = (1.0 - p.x) * 1.3;
  let br_dy = (1.0 - p.y) * 1.0;
  let br_r2 = br_dx * br_dx + br_dy * br_dy;
  let br = exp(-br_r2 * 4.0) * (0.45 + 0.55 * sin(t * 1.1 + 1.5));

  let intensity = tl * 0.28 + br * 0.25;
  let color = lime * (0.45 + intensity * 0.70);
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
// Organic flowing wave — multiple frequencies stacked, NOT a clean rotation.
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

  // high-saturation neon lime — bright but NOT white
  let lime = vec3<f32>(0.62, 1.0, 0.08);
  let lime_hot = vec3<f32>(0.50, 1.0, 0.02);

  let edge_dist = input.geometry_edge;
  let edge_line = 1.0 - smoothstep(0.0, 0.016, edge_dist);
  // lamp-like diffusion: soft glow spreading inward from the edge
  let inner_diffusion = 1.0 - smoothstep(0.0, 0.09, edge_dist);

  let top_side = 1.0 - smoothstep(0.0, 0.016, p.y);
  let bot_side = 1.0 - smoothstep(0.0, 0.016, 1.0 - p.y);
  let left_side = 1.0 - smoothstep(0.0, 0.016, p.x);
  let right_side = 1.0 - smoothstep(0.0, 0.016, 1.0 - p.x);

  let top_wave = flow_wave(p.x, t, 1.1, 0.0);
  let bot_wave = flow_wave(1.0 - p.x, t, 0.9, 2.1);
  let left_wave = flow_wave(1.0 - p.y, t, 1.0, 1.0);
  let right_wave = flow_wave(p.y, t, 1.2, 3.2);

  // pow 8: narrow bright peaks, deep troughs — high contrast
  let top_peak = pow(top_wave, 8.0);
  let bot_peak = pow(bot_wave, 8.0);
  let left_peak = pow(left_wave, 8.0);
  let right_peak = pow(right_wave, 8.0);

  let flowing_line = top_side * top_peak + bot_side * bot_peak
                   + left_side * left_peak + right_side * right_peak;

  // Corner hotspots — steady bright, lamp-like glow
  let corner_tl = exp(-(p.x * p.x + p.y * p.y) * 18.0);
  let corner_tr = exp(-((1.0 - p.x) * (1.0 - p.x) + p.y * p.y) * 18.0);
  let corner_bl = exp(-(p.x * p.x + (1.0 - p.y) * (1.0 - p.y)) * 18.0);
  let corner_br = exp(-((1.0 - p.x) * (1.0 - p.x) + (1.0 - p.y) * (1.0 - p.y)) * 18.0);
  let corners = corner_tl + corner_tr + corner_bl + corner_br;

  // slow overall breathing
  let pulse = 0.75 + 0.25 * sin(t * 1.8);

  // Lamp-like composition: bright core line + soft diffusion glow
  let core_energy = flowing_line * edge_line * 1.1 * pulse;
  let glow_energy = flowing_line * inner_diffusion * 0.25 * pulse;
  let corner_energy = corners * 0.6;
  let corner_glow = corners * inner_diffusion * 0.2;

  let rgb = lime_hot * (core_energy + corner_energy) * 1.3
          + lime * (glow_energy + corner_glow) * 0.9;

  let alpha = clamp(core_energy * 0.8 + glow_energy * 0.4 + corner_energy * 0.5 + corner_glow * 0.2, 0.0, 0.90);
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

  // Narrow bright core ring
  let ring = exp(-pow((r - radius) * 0.60, 2.0)) * 0.85;
  // Lamp-like outward diffusion glow
  let halo = exp(-pow(max(r - radius, 0.0) * 0.14, 1.5)) * 0.40;
  let inner_glow = exp(-pow(max(radius - r, 0.0) * 0.22, 1.5)) * 0.10;

  // Subtle moving highlight — not a clean rotation, organic wave around the ring
  let ang = atan2(c.y, c.x);
  let arc_wave = 0.5 + 0.5 * (sin(ang * 2.0 - t * 1.5) + 0.4 * sin(ang * 5.0 + t * 2.2 + 1.0)) / 1.4;
  let arc = pow(arc_wave, 5.0) * ring * 0.9;

  let pulse = 0.80 + 0.20 * sin(t * 2.0);

  let lime = vec3<f32>(0.62, 1.0, 0.08);
  let lime_hot = vec3<f32>(0.50, 1.0, 0.02);

  let core = ring * (0.82 + pulse * 0.18) + halo + inner_glow + arc;
  let rgb = lime_hot * (arc + ring * 0.3) * 1.3
          + lime * (halo + inner_glow + ring * 0.5) * 1.1;

  return vec4<f32>(rgb, clamp(core * 0.88, 0.0, 0.93));
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
    packageFor("pulse-glass", 20, pulseGlass),
    packageFor("pulse-flow-light", 17, pulseFlowLight),
    packageFor("pulse-neon-edge", 14, pulseNeonEdge),
    packageFor("pulse-neon-ring", 10, pulseNeonRing),
  ];
}
