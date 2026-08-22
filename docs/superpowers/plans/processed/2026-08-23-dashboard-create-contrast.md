# Dashboard Create Action Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the contrast and focus visibility of the dashboard's `Create` squad link without changing its navigation or behavior.

**Architecture:** Update the inline style on the existing Next.js `Link` in the dashboard page. Keep the action compact and use existing design tokens (`--ink-800`, `--volt-50`, `--volt-200`, and `--volt-500`) so the fix stays within the current visual system.

**Tech Stack:** Next.js 15, React 19, TypeScript, existing global CSS tokens.

## Global Constraints

- Preserve the existing `/groups` destination and link semantics.
- Do not change squad creation logic, data access, or copy outside the affected action.
- Keep the action touch-friendly and keyboard-visible.

---

### Task 1: Improve dashboard Create action contrast

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx` at the `Your squads` section's `Link href="/groups"`.
- Test: existing web typecheck and test commands.

**Interfaces:**
- Consumes: existing Next.js `Link` and dashboard design tokens.
- Produces: the same `/groups` link with a more legible visual treatment.

- [ ] **Step 1: Update the link style**

Change the inline style from lime text on the pale surface to a compact, high-contrast action using dark ink text, a volt-tinted background, a visible border, a small radius, and an explicit focus-visible outline. Preserve the existing typography, text, and `href`.

- [ ] **Step 2: Run verification**

Run `corepack pnpm@9.15.9 --filter @picklebaddies/web typecheck` and `corepack pnpm@9.15.9 --filter @picklebaddies/web test`. Expected: both commands pass.

- [ ] **Step 3: Review the diff and commit**

Run `git diff --check`, confirm only the dashboard style and plan/design documents changed, then commit with `git add apps/web/src/app/(app)/dashboard/page.tsx docs/plans/2026-08-23-dashboard-create-contrast-design.md docs/superpowers/plans/2026-08-23-dashboard-create-contrast.md && git commit -m "Improve dashboard create action contrast"`.
