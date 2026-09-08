# Pulse Acrylic Rewrite Baseline

## Target

Rebuild the music player toward the reference image with three explicit layers:

1. Native acrylic backdrop plus the exact cut-corner mask.
2. A custom material/shader layer that can be placed either behind the glass or above it.
3. Ordinary screen UI content above the glass effects.

The first milestone is a deterministic three-layer probe, not visual polish.

## Preserved Implementation Ideas

- `NeonClient` must use `external_host` for the v0.2.5/v0.2.6 runtime protocol.
- The WGPU `RenderClient` must also use `external_host`; shader registration through the default client can otherwise fall back silently.
- `ShaderPackage` registration and `shaderState()` are useful producer/consumer diagnostics, but registration alone does not prove a material was drawn.
- The historical transparent `pulse-glass` material is the correct contract for the shell: native acrylic supplies the glass body; the material emits sparse reflections only.
- The historical `pulse-flow-light` material uses low alpha and premultiplied output (`color * alpha`). It must not paint a full-screen opaque panel.
- `composition_layer behind_glass` is a renderer destination, not a visual style. It needs a dedicated surface and a separate consumer pass.
- The normal screen pass must exclude `BehindGlass`; otherwise the same material is drawn twice and the normal content surface covers the acrylic result.
- The renderer needs frame-paired diagnostics: shader package state, Flow/material binding, behind-surface frame sequence, normal-surface frame sequence, and final capture checksum.

## Known Failure Modes

- Using an old runtime binary with a newer Flow parser/schema.
- Starting a second instance while ports 39101-39104 are owned by an older process.
- Treating `shader.registered` as proof of visible output.
- Giving the shell material a constant alpha or using a high-alpha broad beam.
- Placing the native black tint above the behind-glass shader instead of below it.
- Applying an experimental composition swapchain while diagnosing the stable acrylic path.

## Rewrite Order

1. Restore the runtime at commit `822148b3aa67fbc2add275f32ff9ab6ebb1666e1`.
2. Prove acrylic and cut mask with a transparent static surface.
3. Prove a static behind-glass solid-color material with a dedicated capture.
4. Prove animated shader output by comparing two paired frames.
5. Add normal/top UI and verify it does not duplicate the behind layer.
6. Only then restore the Pulse layout and reference-image styling.
