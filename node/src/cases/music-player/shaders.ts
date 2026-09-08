import { shaderSourceDigest, type ShaderPackage } from "@neon3/sdk";

const encoder = new TextEncoder();

// Packages stay opaque to Flow. The renderer owns their eventual compilation
// and binding; this case only registers stable, bounded WGSL payloads first.
//
// pulse-glass v6 - transparent UI reflections over native black glass. Avoid mixing the
// translucent base with white: that made the system backdrop look like flat
// gray fog rather than a dark glass layer.
const pulseGlass = `
fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn field(p: vec2<f32>) -> f32 {
  let cell = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2<f32>(1.0, 0.0)), u.x), mix(hash(cell + vec2<f32>(0.0, 1.0)), hash(cell + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn liquid_field(p: vec2<f32>) -> f32 {
  var value = 0.0;
  var weight = 0.55;
  var q = p;
  for (var octave = 0; octave < 3; octave = octave + 1) {
    value = value + field(q) * weight;
    q = q * 2.06 + vec2<f32>(17.3, 5.7);
    weight = weight * 0.48;
  }
  return value;
}
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;
  let px = vec2<f32>(p.x * input.bounds.z, p.y * input.bounds.w);

  let edge = 1.0 - smoothstep(0.0, 0.030, input.geometry_edge);
  // The bright stripe translates through diagonal phase space. This is an
  // actual moving line, separate from the slower liquid field animation.
  let diagonal = p.x * 0.78 - p.y * 1.18;
  let sweep_phase = diagonal * 0.92 + t * 0.050;
  let slow_sweep = exp(-abs(fract(sweep_phase) - 0.48) * 18.0);
  let narrow_sweep = pow(0.5 + 0.5 * sin(diagonal * 15.0 - t * 0.55), 34.0);
  let liquid_a = liquid_field(px * 0.014 + vec2<f32>(t * 0.028, -t * 0.018));
  let liquid_b = liquid_field(px * 0.026 + vec2<f32>(-t * 0.017, t * 0.030));
  let caustic = smoothstep(0.69, 0.91, liquid_a) * smoothstep(0.37, 0.76, liquid_b);
  let shadow = smoothstep(0.34, 0.72, liquid_b) * 0.024;
  let lime = vec3<f32>(0.58, 1.0, 0.10);
  let specular = vec3<f32>(0.68, 0.94, 0.78) * (slow_sweep * 0.16 + narrow_sweep * 0.10);
  let emission = lime * (caustic * 0.42 + narrow_sweep * 0.22);
  // Absorption belongs to the native backdrop tint layer. This UI material
  // contributes only sparse liquid reflections above fully transparent panels.
  let rgb = vec3<f32>(0.004, 0.014, 0.009) + specular + emission;
  let alpha = caustic * 0.050 + slow_sweep * 0.032 + narrow_sweep * 0.040
            + narrow_sweep * 0.040;
  return vec4<f32>(rgb, alpha);
}
`;


// pulse-flow-light v1 - dynamic lime light rays rendered into the
// behind_glass composition layer. The system GaussianBlur then softens
// these rays, so they bleed through the glass as ambient volumetric light
// rather than a hard painted stripe. Transparent everywhere except the
// active ray bands and corner glints.
const pulseFlowLight = `
fn hash2(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(
    fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2<f32>(269.5, 183.3))) * 23421.6312)
  );
}
fn noise2(p: vec2<f32>) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(cell).x, hash2(cell + vec2<f32>(1.0, 0.0)).x, u.x),
    mix(hash2(cell + vec2<f32>(0.0, 1.0)).x, hash2(cell + vec2<f32>(1.0, 1.0)).x, u.x),
    u.y
  );
}
fn fbm2(p: vec2<f32>) -> f32 {
  var value = 0.0;
  var amp = 0.5;
  var q = p;
  for (var i = 0; i < 4; i = i + 1) {
    value = value + noise2(q) * amp;
    q = q * 2.03 + vec2<f32>(13.7, 7.1);
    amp = amp * 0.5;
  }
  return value;
}
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;
  let px = vec2<f32>(p.x * input.bounds.z, p.y * input.bounds.w);

  // Primary diagonal ray band — slow drift, wide soft core.
  let diag_a = p.x * 0.72 - p.y * 1.25;
  let ray_a = exp(-abs(fract(diag_a * 0.85 + t * 0.030) - 0.42) * 14.0);

  // Secondary narrower ray — faster, opposite diagonal.
  let diag_b = p.x * 1.05 + p.y * 0.62;
  let ray_b = exp(-abs(fract(diag_b * 1.2 - t * 0.055) - 0.58) * 22.0) * 0.7;

  // Thin highlight streak that pulses.
  let diag_c = p.x * 0.9 - p.y * 0.9;
  let streak = pow(0.5 + 0.5 * sin(diag_c * 22.0 - t * 0.8), 48.0) * 0.5;

  // Volumetric noise modulates the rays so they don't look like flat lines.
  let vol = fbm2(px * 0.012 + vec2<f32>(t * 0.020, -t * 0.015));
  let ray_mod = 0.55 + 0.65 * vol;

  // Corner glints — bright spots near the cut corners that fade inward.
  let corner_tl = exp(-(p.x * p.x + p.y * p.y) * 48.0) * 0.8;
  let corner_br = exp(-((1.0 - p.x) * (1.0 - p.x) + (1.0 - p.y) * (1.0 - p.y)) * 48.0) * 0.6;
  let corner_tr = exp(-((1.0 - p.x) * (1.0 - p.x) + p.y * p.y) * 64.0) * 0.4;

  // Subtle vertical gradient — brighter near top third.
  let vert = exp(-pow((p.y - 0.28) * 2.4, 2.0)) * 0.25;

  let rays = (ray_a + ray_b + streak) * ray_mod;
  let glints = corner_tl + corner_br + corner_tr;
  let intensity = rays * 1.55 + glints * 0.92 + vert * 0.62;

  // Lime-yellow core with a hint of warm white in the brightest spots.
  let lime_core = vec3<f32>(0.62, 1.0, 0.12);
  let warm_hot = vec3<f32>(0.95, 1.0, 0.72);
  let color = mix(lime_core, warm_hot, smoothstep(0.5, 1.0, intensity));

  // Keep alpha low — this is ambient light, not a solid panel. The blur
  // will spread it further. Max ~0.35 so it never washes out the UI.
  let alpha = clamp(intensity * 0.62, 0.0, 0.72);

  return vec4<f32>(color * alpha, alpha);
}
`;

// pulse-neon-edge v3 - lime edge emission with a translating diagonal
// sweep, used on cut frames (cover frame, play button, dock).
const pulseNeonEdge = `
fn material(input: MaterialInput) -> vec4<f32> {
  let t = input.time_seconds;
  let p = input.local_position;
  let edge = 1.0 - smoothstep(0.0, 0.06, input.geometry_edge);
  let diagonal = p.x * 0.80 - p.y * 0.68;
  let sweep = exp(-abs(fract(diagonal + t * 0.075) - 0.5) * 34.0);
  let pulse = 0.5 + 0.5 * sin(t * 2.2);
  let lime = vec3<f32>(0.66, 1.0, 0.09);
  return vec4<f32>(lime * (edge * (0.46 + pulse * 0.10) + sweep * 0.12), edge * 0.42 + sweep * 0.06);
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
    packageFor("pulse-glass", 7, pulseGlass),
    packageFor("pulse-flow-light", 2, pulseFlowLight),
    packageFor("pulse-neon-edge", 3, pulseNeonEdge),
  ];
}
