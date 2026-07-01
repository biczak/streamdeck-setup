# Full-Charge Outline Tint — Design Spec

**Date:** 2026-06-30
**Status:** Approved design, pending implementation plan

## Goal

When a device is charging (plugged in) **and** its battery is at 100%, tint the
battery outline a distinct color (`#57A4DE`) so a fully-charged-and-still-plugged-in
key is visually distinguishable from a still-charging key.

## Context

`renderKey` in `src/render/render-key.ts` already tints the battery outline
(`strokeColor`) with the user-configured `chargeAccent` color whenever `charging`
is true, regardless of percentage. This spec extends that logic for the specific
sub-case of `charging && percent === 100`.

## Design

In `renderKey`, the `strokeColor` calculation gains one more branch, evaluated
before the general charging-accent case:

- `!isActive` → `#5b5b62` (unchanged)
- `isActive && charging && percentVal === 100` → `#57A4DE` (new)
- `isActive && charging` (percent < 100) → `chargeAccent` (unchanged)
- `isActive && !charging` → `#e9e9ec` (unchanged)

No other rendering logic (fill color, percentage text, badge) changes. `#57A4DE`
is a fixed constant, not user-configurable — it applies uniformly regardless of
`colorMode` or `chargeAccent` settings.

## Testing

Extend `src/render/render-key.test.ts` with a case asserting the outline stroke
is `#57A4DE` when `charging: true, percent: 100`, and that charging at <100%
still uses `chargeAccent` (regression check).
