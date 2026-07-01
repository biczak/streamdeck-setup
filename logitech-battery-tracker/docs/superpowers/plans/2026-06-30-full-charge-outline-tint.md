# Full-Charge Outline Tint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a device is charging and its battery is at 100%, tint the battery
key's outline `#57A4DE` instead of the normal `chargeAccent` color, so a
fully-charged-and-plugged-in key looks visually distinct from a still-charging one.

**Architecture:** One conditional branch added to the existing `strokeColor`
calculation in `renderKey` (`src/render/render-key.ts`). No new files, no new
inputs — `RenderInput` already carries `percent` and `charging`.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `#57A4DE` is a fixed constant, not user-configurable — it does not depend on
  `colorMode` or `chargeAccent`.
- Only the outline (`strokeColor`) changes. Fill color, percentage text, and all
  other rendering logic are untouched.
- The new color applies only when `charging === true` and the rounded percent
  (`percentVal`, already clamped 0–100 in `renderKey`) equals exactly 100, and
  only when the device is active (`isActive`) — matches the existing precedent
  that inactive states always render a grey/dim stroke regardless of `charging`.

---

### Task 1: Tint outline at full charge

**Files:**
- Modify: `src/render/render-key.ts:41`
- Test: `src/render/render-key.test.ts`

**Interfaces:**
- Consumes: existing `RenderInput` fields `percent: number`, `charging: boolean`,
  `state: ConnState` — no signature changes.
- Produces: no new exports; behavior-only change to `renderKey`'s output SVG.

- [ ] **Step 1: Write the failing tests**

Add two `it` blocks inside the existing `describe("renderKey", ...)` block in
`src/render/render-key.test.ts`, right after the existing
`"charging tints the battery outline with the accent color (no badge)"` test
(after line 49's closing `});`):

```typescript
	it("charging at 100% tints the outline #57A4DE instead of the accent color", () => {
		const svg = renderKey({ ...base, charging: true, percent: 100, chargeAccent: "#5cc8ff" });
		expect(svg).toContain('stroke="#57A4DE"');
		expect(svg).not.toContain('stroke="#5cc8ff"');
	});
	it("charging below 100% still uses the accent color, not the full-charge tint", () => {
		const svg = renderKey({ ...base, charging: true, percent: 99, chargeAccent: "#5cc8ff" });
		expect(svg).toContain('stroke="#5cc8ff"');
		expect(svg).not.toContain('stroke="#57A4DE"');
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/render/render-key.test.ts`
Expected: the two new tests FAIL (stroke is still `#5cc8ff` at 100%, so the
first new test's `not.toContain('stroke="#5cc8ff"')` assertion fails); all
prior tests in the file still PASS.

- [ ] **Step 3: Implement the minimal code change**

In `src/render/render-key.ts`, replace line 41:

```typescript
	const strokeColor = !isActive ? "#5b5b62" : charging ? accent : "#e9e9ec";
```

with:

```typescript
	const strokeColor = !isActive ? "#5b5b62" : charging && percentVal === 100 ? "#57A4DE" : charging ? accent : "#e9e9ec";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/render/render-key.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no other suite references the old `strokeColor` expression
(`src/battery/render-input.ts` and its test only shape `RenderInput`, they
don't assert on `render-key.ts`'s SVG output, per the earlier grep for
`chargeAccent` usages).

- [ ] **Step 6: Commit**

```bash
git add src/render/render-key.ts src/render/render-key.test.ts
git commit -m "$(cat <<'EOF'
feat: tint battery outline #57A4DE when fully charged and plugged in

EOF
)"
```
