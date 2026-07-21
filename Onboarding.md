# Dice On Rails — Onboarding & Reference UX Implementation Plan

> Goal: Close the "AI knows everything, player knows nothing" gap with five additive features that serve both new and seasoned 5e players. None of these changes alter game mechanics, engine state shape (except an optional `lastSuggestions` field), or break save compatibility.

---

## Background — Current State Summary

After a full review of character creation through gameplay, the game has a **solid mechanical foundation** but a **significant player-knowledge gap**:

- **Zero onboarding**: No tutorial, tour, help modal, glossary, or first-time detection. Players land in an empty chat ("The chronicles await...") with no guidance.
- **SRD data is one-way**: The engine ships a full 5e reference (`data/spells.ts` = 4,796 lines; full conditions, classes, races, items) but most of it is **invisible during play**. The LLM is taught everything via ~150 lines of system prompts (`constants.ts:8-83` + `services/llm/prompts/toolModePrompt.ts`); the player is taught nothing.
- **Sparse tooltips**: Only a handful of `title=` attributes and one portal-tooltip pattern (`CharacterSheet.tsx:123-144`). Mobile users have **no tap equivalent** for inventory hover.
- **Detail modal asymmetry**: `SpellDetailModal` exists in creation (`SpellsStep.tsx:113-162`) but **not on the live character sheet** — players can't click their own spells to see what they do.
- **Quick Actions cover ~40% of verbs**: Spells, weapons, class features, rests — but no skills, saves, items, or movement.
- **Combat tracker is tactically thin**: Enemy AC and HP show on expand, but **resistances / CR / attacks are only in Settings → Debug Log**.
- **Conditions only teach when active**: `CONDITION_INFO` (`ConditionsDisplay.tsx:10-27`) is excellent but unreachable for browsing, and **exhaustion has no entry**.

The codebase already has **reusable patterns** (portal tooltip, `FeatDetailModal`, `CONDITION_INFO` map, `<details>` disclosures) and **all the data** is in `data/*`. Most improvements are additive wiring.

---

## Top 5 Suggestions (Summary)

1. **In-app Compendium modal** — surfaces existing SRD data + rules + glossary.
2. **Reusable Tooltip system with mobile tap support** — eliminates jargon friction.
3. **Make the live character sheet clickable** — spells, items, conditions.
4. **First-session onboarding tour + welcome chips** — auto-launch once, skippable.
5. **Expanded Quick Actions + LLM-driven Suggested Actions** — reveals action vocabulary.

---

## Scope Decisions (confirmed)

- **Priority**: All 5 (full rollout).
- **Onboarding style**: Auto-launch once on first PLAY entry, "Skip Tour" always visible, replayable from Settings.
- **Guardrails**: Touching the agent loop / state pipeline is **allowed** (needed for Suggested Actions Part B).

---

## Phase 0 — Foundation (shared infrastructure)

Before the 5 features, build two reusable primitives they all depend on.

### 0A. `<Tooltip>` component

- **New file**: `components/ui/Tooltip.tsx` — generalized portal tooltip.
- **Clone from**: `CharacterSheet.tsx:79-90, 123-144` (already does portal + viewport edge clamping). Extract logic into a reusable wrapper with API: `<Tooltip content={string | ReactNode} side="top|bottom|left|right">`.
- **Mobile support**: Add `onTouchStart` long-press handler (300ms) that sets `tooltipPos` — currently the mobile branch (`CharacterSheet.tsx:88`) only repositions; never opens on tap.
- **No library**: `package.json:24-34` has no Tippy/React-Tooltip and none is needed.

### 0B. Shared `<DetailModal>` and extracted detail content

- **Extract**: `SpellDetailModal` from inline code at `SpellsStep.tsx:113-162` → new file `components/modals/SpellDetailModal.tsx`. Needed by both feature #3 (live sheet) and feature #1 (Compendium spell browser).
- **Extract**: `CONDITION_INFO` from `sheet/ConditionsDisplay.tsx:10-27` and the inline exhaustion block from `CharacterSheet.tsx:327-346` → new `data/conditionInfo.ts`. **Add exhaustion entries** (currently missing — see `bugs.md` C4/C5 for why this matters).
- **New file**: `data/referenceConstants.ts` — exports `STAT_INFO`, `SKILL_INFO`, `DERIVED_STAT_INFO`, `EXHAUSTION_INFO`, `REST_INFO`, `DEATH_SAVE_INFO`, `CURRENCY_INFO`. Pure data, no JSX.

### Tests

- Unit test the data files (`conditionInfo.test.ts`, `referenceConstants.test.ts`) — these are critical because they're the source of truth for #1 and #2.

---

## Phase 1 — Feature #3: Clickable Live Character Sheet (cheapest)

Smallest LOC, biggest immediate value per line.

### Files to edit

- `components/sheet/SpellPanel.tsx:42` — add `onClick={() => onViewSpell(spell)}` to spell badges.
- `components/CharacterSheet.tsx` — add state `viewingSpell`, render `<SpellDetailModal>` (reusing extracted component from 0B).
- `components/CharacterSheet.tsx:123-144` — for inventory items on mobile (`useEffect` checks `window.innerWidth <= 768`), add tap handler that opens a `<ItemDetailModal>` (new thin wrapper reusing the existing `renderItemTooltip` content).
- `components/CharacterSheet.tsx:359-368` — make condition chips always-clickable (not just when active) → open a small popover with the `CONDITION_INFO` entry.

### New files

- `components/modals/ItemDetailModal.tsx` — wraps existing `renderItemTooltip` JSX in a modal trigger.

### Non-breaking nature

- All semantics preserved. `SpellDetailModal` exists, just lives in creation only. `data/spells.ts` is the source.

---

## Phase 2 — Feature #2: Tooltip System Rollout

Apply the `<Tooltip>` primitive from 0A across jargon surfaces.

### Creation flow tooltips (`components/creation/`)

- `NameStep.tsx:62-67` — wrap "Proficiency Bonus" and "ASI Slots" with tooltips explaining each.
- `ClassStep.tsx:38` — wrap "Primary: {stat}" with "Primary stat governs attack rolls, spell DC, and class features."
- `RaceStep.tsx:30-34` — wrap ASI badges (`+2 DEX`) with explanation of what DEX governs.
- `StatsStep.tsx:201` — wrap the "+3 MOD" output with "Derived from `(stat - 10) / 2`, rounded down."
- `StatsStep.tsx:103-109` — wrap "Estimated Max HP" with formula breakdown.
- `FeatsStep.tsx:84-93` — wrap "ASI/Feat milestone" with trade-off explanation.
- `SpellsStep.tsx:51-53` — wrap "Known" vs "Prepared" with the actual distinction.
- `GearStep.tsx:74-82` — wrap "Est. AC" with armor formula (light = 11+dex, medium = 13+min(dex,2), heavy = fixed).
- `ReviewStep.tsx:83-99` — wrap saving throw proficiency stars.

### Live play tooltips (`components/`)

- `CharacterSheet.tsx:187` — wrap each stat name (STR/DEX/CON/INT/WIS/CHA) with `STAT_INFO[str]`.
- `CharacterSheet.tsx:194-195` — wrap "Spell DC" / "Spell Atk" chips.
- `CharacterSheet.tsx:189-196` — wrap Speed, Darkvision, Prof Bon, Hit Dice chips.
- `CharacterSheet.tsx:171-179` — wrap HP bar with current/max + death-save threshold info; wrap AC with armor formula.
- `CombatTracker.tsx` — wrap initiative score with "d20 + DEX modifier"; wrap round counter.
- `InputArea.tsx:143-144` — wrap Short Rest / Long Rest buttons with mechanical effect (HP, hit dice, slot/cooldown recovery).
- `DiceRollCard.tsx:234-238` — wrap "vs AC N" / "vs DC N" with brief rules.

### Mobile

- All tooltips auto-fall-back to long-press via the 0A primitive.

### Tests

- Snapshot tests for `STAT_INFO` / `SKILL_INFO` shape; render test that `<Tooltip>` renders content on hover (desktop) and long-press (mobile via simulated touch events in jsdom).

---

## Phase 3 — Feature #1: Compendium / Help Modal

The flagship reference feature.

### New files

- `components/CompendiumModal.tsx` (~250-350 lines) — tabbed modal.
- `components/compendium/GlossaryTab.tsx` — searchable list of jargon terms from `data/referenceConstants.ts`.
- `components/compendium/ConditionsTab.tsx` — browsable grid of all conditions + exhaustion levels, each with mechanical summary (reuses `data/conditionInfo.ts`).
- `components/compendium/RulesTab.tsx` — currency conversion (`constants.ts:21`), XP table (`constants.ts:42-83`), CR-to-XP, DC-to-XP, rest mechanics, death saves, concentration, critical hits.
- `components/compendium/SpellsTab.tsx` — filterable spell browser surfacing `data/spells.ts`. Click → opens existing `SpellDetailModal`.
- `components/compendium/ItemsTab.tsx` — surfacing `data/srdItems.ts` with category filters.
- `data/glossary.ts` — jargon definitions. Pure data.

### Files to edit

- `components/layouts/DesktopLayout.tsx:136` — add `<button onClick={openCompendium}><FontAwesomeIcon icon={faBookOpen} /></button>` next to the settings cog.
- `components/layouts/MobileLayout.tsx:132` — same icon in the bottom nav.
- `contexts/UIContext.tsx` — add `isCompendiumOpen` state + setter (matches existing `isLevelUpModalOpen` pattern).

### Tabs design (5 tabs)

1. **Glossary** — searchable jargon (ASI, DC, AC, modifier, proficiency, concentration, cantrip, save, etc.).
2. **Conditions** — grid of 16 conditions + 6 exhaustion levels + 5 buff sources (`BUFF_SOURCES` at `CharacterSheet.tsx:13-17`).
3. **Rules** — pulled verbatim from the system prompts the LLM uses. **This is the key insight**: by mirroring what the AI knows, the player can predict outcomes.
4. **Spells** — full catalog browser.
5. **Items** — SRD weapons/armor/gear browser.

### Non-breaking nature

- 100% read-only. Pulls from existing `data/*` files. No engine calls, no state mutations. Modal opens/closes via a single UIContext flag.

### Tests

- Unit test each tab renders without crashing; snapshot the glossary data; verify all conditions in `CONDITION_INFO` render.

---

## Phase 4 — Feature #4: First-Session Onboarding Tour + Welcome Chips

Auto-launch once, skippable.

### New files

- `components/onboarding/OnboardingTour.tsx` (~200 lines) — hand-rolled coachmark overlay. Uses `position: fixed` mask with a "hole" cut out for the highlighted element via `getBoundingClientRect()`. Steps: chat input → character sheet → Quick Actions → Journal → Queue → Combat tracker (conditional on combat active).
- `components/onboarding/WelcomeChips.tsx` — replaces empty state in `ChatLog.tsx:388-393` on first session. 4-5 example prompts as clickable chips.
- `hooks/useOnboarding.ts` — localStorage-backed flag (`diceonrails_seenTour`, `diceonrails_seenWelcome`). Two booleans. Provides `launchTour()`, `dismissTour()`, `resetOnboarding()` (the last wired into SettingsModal).

### Files to edit

- `App.tsx:147` (the PLAY branch) — render `<OnboardingTour>` at top level when `useOnboarding` says it's due.
- `components/ChatLog.tsx:388-393` — swap empty state for `<WelcomeChips onPick={prefillInput} />` when first-session and no messages yet.
- `components/InputArea.tsx:141` — `WelcomeChips` reuses the existing pre-fill pattern (sets input text, never auto-sends).
- `components/SettingsModal.tsx:181` — add "Replay onboarding tour" button.

### Tour behavior (auto-launch once, skippable)

- On first PLAY entry, `useOnboarding` checks `localStorage.diceonrails_seenTour`. If absent → launch tour.
- Tour overlay has: "Skip Tour" (always visible, top-right), "Next" / "Back", step counter ("2 / 5"), and a "Don't show again" checkbox.
- On completion or skip → set `diceonrails_seenTour = 'true'`.
- Reset only via Settings → "Replay onboarding tour".

### Welcome chips

- Shown only when `messages.length === 0 && !diceonrails_seenWelcome`.
- Click → prefill input with the example text, mark seen.
- Examples: *"I search the room for traps"*, *"I attack the goblin with my longsword"*, *"I'd like to persuade the guard"*, *"Cast Healing Word on the wizard"*, *"I roll a Perception check"*.

### Non-breaking nature

- Tour overlay is pure presentation; doesn't touch state. Welcome chips reuse existing pre-fill pattern (`InputArea.tsx:141`). `localStorage` already used for `diceonrails_settings` (`hooks/useSettings.ts:19`).

### Tests

- `useOnboarding.test.ts` — flag set/get/reset logic.
- Render test for `<OnboardingTour>` step transitions.
- Render test for `<WelcomeChips>` click → prefill callback.

---

## Phase 5 — Feature #5: Suggested Actions (touches agent loop)

Per the scope decision, this is allowed to modify the agent loop / state pipeline.

### Two-part implementation

#### Part A — Expanded Quick Actions (pure UI, no agent changes)

- `components/InputArea.tsx:50-98` — extend `QUICK_ACTIONS` builder:
  - Add **skills**: top 3-4 class-recommended skills → "Roll {Skill}" prefills `"I roll {Skill}"`.
  - Add **saves**: 2 proficient saves → "Roll {Save} Save".
  - Add **inventory shortcuts**: any potion in inventory → "Drink {potionName}".
  - Add **death save** button when `hp.current === 0`.
  - Keep horizontal scroll, category color-coding (`InputArea.tsx:32-37`).

#### Part B — LLM-Driven Suggested Actions (agent loop edit)

- `services/llm/agentLoop.ts` — at end of each turn (after `narrate_turn`), make an optional lightweight follow-up call asking the LLM for 2-3 suggested next actions based on current state. Use `generateTightNarration`-style timeout (15s, max 200 tokens). Returns `{ suggestions: string[] }`.
- Store in `gameState.lastSuggestions` (new optional field) or in `Message.metadata.suggestions`.
- `components/SuggestedActions.tsx` — new collapsible panel above `<InputArea>` rendering the chips. Click → prefill input (same pattern as Quick Actions).

### Type changes

- `types.ts` — add `lastSuggestions?: string[]` to `GameState` OR `suggestions?: string[]` to `Message['metadata']`.
- Auditor update: `services/auditor.ts` — no rule needed; suggestions are ephemeral.

### Cost/latency guardrails

- Make Part B **opt-in** via Settings (`hooks/useSettings.ts`) — default OFF to avoid surprising API cost.
- Gate behind `gameState.combat?.isActive || gameState.party[0]?.hp?.current < hp.max * 0.3` to only suggest when tactically useful.
- Cache suggestions per turn — don't regenerate until next `narrate_turn`.

### Tests

- `agentLoop.test.ts` — extend existing tests to verify suggestions are produced when feature enabled and suppressed when disabled.
- `InputArea.test.tsx` — verify expanded Quick Actions.
- Live test scenario in `tests/live/scenarios/` — verify suggestions flow end-to-end.

### Risk notes

- Adds one extra LLM call per turn (cost). Mitigated by opt-in setting + cheap model.
- Agent loop is the most sensitive file in the codebase; changes here must preserve the existing end-of-turn detection logic (`agentLoop.ts:335-343` synthetic narrate guard).

---

## Cross-Cutting Concerns

### Dead code cleanup (do this first or alongside Phase 0)

Remove drifted duplicates that the new shared components supersede:

- `components/chat/MessageBubble.tsx` (183 lines, never imported — `ChatLog.tsx` inlines its own)
- `components/chat/SearchBar.tsx` (89 lines, never imported)
- `components/chat/ExportMenu.tsx` (never imported)
- `components/CombatInitiativeRow.tsx` (95 lines, never imported)
- `components/sheet/StatBlock.tsx` (27 lines, never imported)
- `components/sheet/SpellPanel.tsx` (51 lines — **keep this one**; wired in Phase 1)
- `components/sheet/ConditionsDisplay.tsx` (68 lines — **keep data, delete component**; superseded by Compendium + Tooltip)
- `components/creation/constants.ts:5-8` (`STEP_LABELS` dead constant)
- `components/wizard/StepRegistry.ts` (unused)
- `components/creation/FeatsStep.tsx:95-100` (unreachable branch — `ASI_LEVELS[0] === 1`)

### Mobile parity

Every feature has a mobile path:

- Tooltips → long-press
- Compendium → full-screen modal on mobile
- Tour → already mobile-aware (`getBoundingClientRect` works on any viewport)
- Clickable sheet → tap-to-modal
- Quick Actions → already horizontally scrollable

### Testing strategy

- Phase 0 / 1 / 3 / 4 → unit tests + render tests via `@testing-library/react` per existing `tests/setup.ts` patterns.
- Phase 5 Part B → extend existing `tests/services/agentLoop.test.ts` (or wherever the loop is tested) + new live scenario in `tests/live/scenarios/`.
- No new mocking patterns required — follow `AGENTS.md` testing conventions exactly.
- Coverage minimums to maintain: 55% statements, 43% branches, 50% functions, 60% lines.

### Build chunks

No new vendor chunks. All new files compile into the default chunk per `vite.config.ts`. The Compendium's data files (`data/glossary.ts`, `data/referenceConstants.ts`, `data/conditionInfo.ts`) add ~5-10 KB gzipped — negligible.

### Type system invariants (must preserve)

- `Character.stats` always 6 keys: `str, dex, con, int, wis, cha`.
- `Character.hp.current` clamped `[0, max]` by every tool.
- `CombatState.isActive` must be true when `combat` present.
- New `lastSuggestions?: string[]` is **optional** — auditor & migration must treat absence as normal.

---

## Suggested Execution Order

| # | Phase | Effort | Risk |
|---|---|---|---|
| 1 | Phase 0 (Foundation: Tooltip + extracted modals + data files) | M | Low |
| 2 | Dead code cleanup | S | Low |
| 3 | Phase 1 (Clickable sheet) | S | Low |
| 4 | Phase 2 (Tooltip rollout) | M | Low |
| 5 | Phase 4 (Onboarding tour + welcome chips) | M | Low |
| 6 | Phase 3 (Compendium modal) | L | Low |
| 7 | Phase 5A (Expanded Quick Actions) | S | Low |
| 8 | Phase 5B (LLM Suggested Actions) | M | Medium (agent loop) |

**Totals**: ~5 new top-level components, ~5 new data files, ~12 component edits, ~10 new test files. No engine/state mutations except the optional `gameState.lastSuggestions` field in Phase 5B.

---

## Key File:Line References

### Existing patterns to reuse

- Portal tooltip pattern: `components/CharacterSheet.tsx:79-90, 123-144`
- `FeatDetailModal`: `components/FeatDetailModal.tsx:1-114`
- `SpellDetailModal` (in creation): `components/creation/SpellsStep.tsx:113-162` + `components/creation/SharedComponents.tsx:58-67`
- `CONDITION_INFO` map: `components/sheet/ConditionsDisplay.tsx:10-27`
- Inline condition table: `components/CharacterSheet.tsx:272-297`
- Exhaustion block: `components/CharacterSheet.tsx:327-346`
- Quick Action pre-fill pattern: `components/InputArea.tsx:141`
- Existing `BUFF_SOURCES` set: `components/CharacterSheet.tsx:13-17`
- UIContext modal pattern (`isLevelUpModalOpen`): `contexts/UIContext.tsx`

### Engine knowledge the player never sees

- `constants.ts:8-39` (SYSTEM_INSTRUCTION — 14 numbered rules)
- `constants.ts:42-83` (PROGRESSION_SYSTEM_PROMPT — XP calibration, rest mechanics)
- `services/llm/prompts/toolModePrompt.ts` (93-line combat guide)

### Untapped reference data

- `data/spells.ts` (4,796 lines — full SRD spell catalog)
- `data/srdItems.ts` (849 lines — weapons/armor/potions/gear)
- `data/races.ts` (9 races; `asi: 'flexible-2'` is Half-Elf's special string)
- `data/classes.ts` (12 classes, subclasses, features)
- `data/feats.ts` (~33 feats with prerequisites)
- `data/monsters.ts` (enemy catalog)
- `data/shopItems.ts` (20 shop items, 4 categories)
- `data/constants.ts` (`SKILLS_LIST`, `XP_TABLE`, `ASI_LEVELS`)

### Natural placements for new UI

- Compendium button: `components/layouts/DesktopLayout.tsx:134-141` (next to `fa-cog`)
- Compendium button (mobile): `components/layouts/MobileLayout.tsx:132`
- Onboarding tour mount: `App.tsx:147` (PLAY branch)
- Tour reset: `components/SettingsModal.tsx:181`
- First-time flag set: `App.tsx:47-49` (right after splash dismissal)

---

## Definition of Done

Each phase ships when:

1. All listed files exist/edited with the described behavior.
2. Unit tests added and passing (`npm test`).
3. ESLint clean (`npm run lint`).
4. Build succeeds (`npm run build`).
5. Mobile parity verified (manual smoke test on a 375px viewport).
6. No regression in existing tests.
7. For Phase 5B only: agent loop end-of-turn detection logic (`agentLoop.ts:335-343` synthetic narrate guard) verified intact via a new live scenario test.
