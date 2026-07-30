# Effect Dispatcher Implementation Plan

> **Branch**: `feature/effect-dispatcher` (long-lived integration branch; merge to main when complete)
> **Created**: July 29, 2026
> **Revised**: July 29, 2026 (post-review — aggressive-on-broken sequencing, branch strategy, corrected facts, resolved architecture)
> **Status**: Planning — awaiting sign-off on the Key Design Decisions (§2) before implementation

---

## Executive Summary

This plan describes a refactor of how Dice On Rails handles class features, racial traits, and feat effects. The current architecture relies on **hardcoded class-ID / race-ID / feat-ID string branches** scattered across ~10 service files. The data catalogs (`data/classes.ts`, `data/races.ts`, `data/feats.ts`) declare structured effect payloads (`effect: { kind, payload }` for classes/races; flat `effectPayload: { kind, ... }` for feats) that are **almost never consumed by engine code** — they act as documentation only.

The new architecture introduces a **hook-aggregator effect dispatcher** (`services/effectDispatcher.ts`) that reads effect payloads at runtime and folds them into a typed **hook context** at well-defined event points (`onDamageTaken`, `onAttackDamage`, `onSaveRoll`, `computeAc`, …). This eliminates the hardcoded branches, makes catalog metadata functional, and enables adding new classes/races/subclasses/feats with catalog data alone for standard effects.

**Sequencing philosophy: demolish where it's safe, migrate where it's not.** ~80% of the mechanical fixes are for features that are currently broken (rage damage, player resistances, missing resource handlers, etc.) — these can be wired through the dispatcher with near-zero regression risk because they don't work today. The remaining ~20% (AC calc, speed, sneak-attack dice, GWF reroll) are load-bearing and already working — these migrate carefully with byte-identical gating.

Implementation proceeds on a **long-lived `feature/effect-dispatcher` branch** merged to main when complete. Mitigations for merge-conflict risk (given active multiplayer/presence work on main): weekly rebases from main; new logic lives in new files (`effectDispatcher.ts`, `resourceHandlers.ts`) for near-zero conflict surface; shared-service changes are thin delegation (one `applyEffects` call replacing inline logic) to minimize diff footprint.

---

## 1. Problem Statement

### 1.1 Current State (verified)

| Metric | Value | Source |
|--------|-------|--------|
| Unique class/race `effect.kind` values in catalogs | 16 | `data/classes.ts`, `data/races.ts` |
| Class/race effect kinds **read** by engine code | **3** (`speed-bonus`, `damage-resistance`, `condition-immunity`) — and only on **racial traits** | `services/classEngine.ts:177,224,241` |
| Class/race effect kinds producing a **mechanical** effect via the data path | **1** (`speed-bonus` in `calculateSpeed`) | the other 2 are display-only (`getDamageResistances`) or fully dead (`getConditionsImmunities` has zero matching definitions and zero non-test consumers) |
| Class/race effect kinds **never read** | **13 of 16** | — |
| Unique feat `effectPayload.kind` values in catalog | 22 | `data/feats.ts` |
| Feat effect kinds **read** by engine via the payload | **1** (`featsService.ts:198` reads `resilient`'s `saveStat`) | the rest are applied via hardcoded `character.feats?.includes('<id>')` checks |
| Hardcoded class-ID branches in `classEngine.ts` | 10+ | `calculateAc`, `calculateMaxHp`, `getSavingThrowBonus`, `recalculateResourcePools` |
| Hardcoded race-ID / trait-ID branches | 6+ | `characterCreationService.ts:95,119-125`; `combatService.ts:876`; `conditionEngine` (via injected `['sleep']`); `characterUtils.ts:42`; `progressionService.ts:90` |
| Resource IDs with real `use_resource` mechanical behavior | **4 of ~14** (`second-wind`, `rage`, `lay-on-hands-pool`, `breath-weapon`) | `services/mcp/spellcastingService.ts:816-853` |
| Classes with broken core features | 4 (Monk, Druid, Sorcerer, Paladin) | `WorkingVsBroken.md` |
| Races with broken signature features | 3 (Tiefling, Halfling, Gnome) | `WorkingVsBroken.md` Addendum |

### 1.2 Root Cause

The effect metadata in catalogs is **dead data**. Every mechanical effect that works comes from a hardcoded ID branch in a specific service. Adding a new subclass that uses an existing effect kind (e.g. a new race with `damage-resistance`) still requires: (1) the catalog entry, (2) finding every service that needs to check for this effect, (3) adding a new hardcoded branch. This violates the open/closed principle and makes the system brittle as more content is added.

A secondary defect: **two parallel conventions exist** for effect payloads — `effect: { kind, payload }` (classes/races) vs flat `effectPayload: { kind, ... }` (feats). Any generic reader must handle both, or it silently misses one source.

### 1.3 Contributing architectural defects

These amplify the root cause and must be addressed during the refactor:

1. **Dual damage pipeline.** `services/inventoryEngine.ts:inflictDamageOnTarget()` (the pure engine function, exported via `services/index.ts`) and `services/mcp/inventoryService.ts:inflict_damage` (the MCP tool method) are **two separate, diverged damage implementations**. The MCP tool does NOT call the pure function. Both ignore player resistances. Any fix must wire BOTH paths (or consolidate them), or players still take full damage regardless of what the dispatcher computes.

2. **Action economy is absent.** There is no bonus-action counter, no per-turn attack counter, no general reaction gate (only reaction-**spells** are gated via `cast_spell`'s `reaction: true` arg). Features that depend on action economy — Extra Attack, Flurry of Blows, Action Surge's "extra action", Indomitable's save-reroll reaction, Cunning Action, Uncanny Dodge — **cannot be made fully mechanical** without a prerequisite action-economy system. This is deferred (§10) and is a hard precondition for those specific features.

3. **Prompts compensate for missing mechanics.** `services/llm/prompts/toolModePrompt.ts` actively instructs the LLM to narrate effects the engine doesn't enforce (rage damage at `:70`, "apply full damage" for resistances at `:93`, "level-1 monk has not yet learned ki" at `:83`). Once the engine enforces these, the LLM will **double-apply** them unless prompts are synchronized. Prompt updates are therefore an **explicit sub-task of every mechanical phase** (§2.5), not out of scope.

---

## 2. Key Design Decisions (require sign-off before Phase A)

These decisions shape the entire implementation and must be confirmed before coding begins.

### 2.1 Backward compatibility policy

**Decision: per-roll effects apply to all characters immediately; stored-state recomputes follow the "new characters only" precedent.**

| Effect category | Existing saved characters | New characters |
|---|---|---|
| **Per-roll / per-turn** (rage damage, damage resistance, crit range, save advantage, reroll-ones, sneak-attack dice) | **Applied immediately** — these are computed at resolution time and don't touch persisted state. Gameplay balance shifts, but no saved data is clobbered. | Applied |
| **Stored derivations** (AC formula, max-HP formula, resource-pool max, skill proficiencies, languages, domain spells) | **Preserved as-is** (the CON/HP precedent from AGENTS.md: "existing saved characters keep their values to avoid clobbering GM hand-adjustments"). | Recomputed correctly |
| **Optional one-time backfill** | A `auditor.ts`-style pass (not auto-run) that GMs can invoke to populate missing `languages`, `racialTraits`-derived proficiencies, and domain spells on existing characters. Opt-in, never automatic. | N/A |

**Rationale:** per-roll effects are stateless, so applying them to existing campaigns is safe (no data corruption). Stored derivations risk clobbering hand-tuned values, so they follow the established precedent. The backfill is a separate, GM-controlled tool.

### 2.2 Effect stacking rules

Defined up-front (SRD-faithful) so Phase A reducers are correct:

| Effect class | Stacking rule | Example |
|---|---|---|
| `damage-resistance` | **No stacking.** Single application: if ≥1 source grants resistance to the type, damage is halved once. | Dwarf poison + a hypothetical poison-resistance feat → still half, not quarter |
| `damage-immunity` | **No stacking.** Immunity wins over resistance. | — |
| `damage-vulnerability` | **No stacking.** Doubled once. | — |
| `speed-bonus` | **Stacks additively.** | Barbarian Fast Movement (+10) + Mobile feat (+10) = +20 |
| `ac-formula` | **Mutually exclusive.** If multiple sources grant an AC formula (e.g. multiclassing Barbarian + Monk), the character uses one (highest). Other AC bonuses (Dual Wielder, shields, `acBonus`) stack on top. | — |
| `advantage-on-save` | **No stacking** (advantage is binary — you either have it or you don't). Multiple qualifying sources = still one advantage. | Gnome Cunning + a charm-save feat vs a magical charm save = advantage, not "double advantage" |
| Dice-additive (`sneak-attack`, `crit-bonus-dice`) | **Stacks by source.** Each qualifying feature adds its dice independently. | Brutal Critical (1 die) + Half-Orc Savage Attacks (1 die) = 2 extra dice on crit |
| Flat damage bonus (`damage-bonus`, e.g. rage) | **Single value per active source.** Rage contributes one bonus; two different rage-like sources would each contribute. | — |

### 2.3 Caching strategy

**Decision: measure first; cache only if a hot path exceeds budget.**

`getEffects(char, kind)` iterates ~10-30 features for a high-level character. A single `player_attack` may call 3-4 effect kinds; a multi-enemy `next_turn` may resolve dozens of attacks. Worst case estimate: ~100 iterations per turn — sub-millisecond.

If profiling shows a hot path, the cache design is:
- A **`WeakMap<Character, EffectCache>`** keyed by character object reference.
- The cache is a `Map<effectKind, Source[]>`.
- **Invalidation is automatic**: the engine deep-clones `state` for every transaction (the `JSON.parse(JSON.stringify(...))` pattern documented in AGENTS.md). A deep clone produces a new object reference, so the `WeakMap` lookup misses and rebuilds. No manual invalidation needed.
- No per-turn or per-feature invalidation logic — correctness falls out of the transaction-clone invariant.

### 2.4 Effect schema unification (Phase A)

**Decision: normalize feats to the `effect: { kind, payload }` shape used by classes/races.**

Feats currently use `effectPayload?: Record<string, any>` (flat). To unify:
- Add `effect?: { kind: string; payload?: Record<string, unknown> }` to `FeatDefinition` (mirrors `ClassFeature.effect`).
- Phase A migrates each feat's flat `effectPayload` into `effect: { kind, payload }` (e.g. `{ kind: 'speed-bonus', bonus: 10 }` → `effect: { kind: 'speed-bonus', payload: { bonus: 10 } }`).
- The flat `effectPayload` field is kept temporarily as a deprecated alias (read falls back to it) for one release, then removed.
- This lets `getEffects()` read all three sources (race/class/feat) through one shape.

### 2.5 Action economy scope

**Decision: deferred to a follow-up phase after the dispatcher lands.** Features that *require* action economy to function are **explicitly excluded** from the phase deliverables that claim to "make them work" — they are listed as deferred in §10. The dispatcher infrastructure (§3) is designed so that when the action-economy system arrives, these features slot in via a new hook set (`onTurnStart`, `onActionDeclared`) without re-architecting.

### 2.6 Branch strategy

**Decision: long-lived `feature/effect-dispatcher` integration branch, merged to main when the refactor is complete.**

| Aspect | Decision |
|---|---|
| **Branch model** | One long-lived feature branch. All refactor work lands here. Merge to main only when the full refactor (or a major milestone) is complete. |
| **Merge-conflict mitigation** | (1) Rebase from `main` at least weekly — the active multiplayer/presence work on main will diverge; (2) All new logic lives in **new files** (`effectDispatcher.ts`, `resourceHandlers.ts`) — additive, near-zero conflict surface; (3) In shared services (`combatService`, `classEngine`, `inventoryService`), changes are **thin delegation** — one `applyEffects(char, '<hook>', ctx)` call replacing inline logic — minimizing the diff footprint where conflicts are likeliest. |
| **Rationale** | The refactor touches ~15 files across the engine. Frequent small merges to main would create churn for other contributors (each merge requires them to re-test against the dispatcher). A long-lived branch isolates the blast radius. The mitigations above keep rebase pain manageable. |
| **Risk** | Long-lived branches accumulate merge debt. Weekly rebases are mandatory, not optional. If the refactor stretches beyond 6 weeks, reconsider splitting into independently-mergeable milestones. |

---

## 3. Proposed Architecture

### 3.1 Core concept: hook-aggregator evaluation

The new system uses a **read-time evaluation** pattern, consistent with the existing `calculateAc`, `calculateSpeed`, `getSavingThrowBonus` query functions. A central dispatcher collects all effect payloads from a character's race + class + subclass + feats that match a given **hook**, then folds them into a typed **hook context** via registered per-kind **reducers**.

Three layers:

```
┌─────────────────────────────────────────────────────────┐
│  Service layer (combatService, inventoryService, ...)    │
│  calls ONE entry point per event:                       │
│     applyEffects(char, 'onDamageTaken', ctx)            │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Effect dispatcher (services/effectDispatcher.ts)        │
│  1. HOOK_REGISTRY: hook → list of { kind, reducer }      │
│  2. getEffects(char, kind): collects payloads from all   │
│     sources (race/class/subclass/feat) matching `kind`   │
│  3. applyEffects: for each (kind, reducer) on the hook,  │
│     collect payloads, fold into ctx via reducer          │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Catalogs (data/classes.ts, races.ts, feats.ts)          │
│  Declare effects as data — the single source of truth    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Worked example: `onDamageTaken`

The highest-value hook. Today, player damage resistances are ignored by both damage pipelines. After this refactor:

```typescript
// services/effectDispatcher.ts

// A hook context — what the service passes in and gets back mutated.
interface DamageContext {
  amount: number;
  damageType: string;
  target: Character;
  source?: 'spell' | 'weapon' | 'environment';
}

// Hook registry: which effect kinds contribute to this hook, and how.
const HOOK_REGISTRY: Partial<Record<HookName, EffectReducerEntry[]>> = {
  onDamageTaken: [
    {
      kind: 'damage-immunity',
      reduce: (ctx: DamageContext, payload, char) => {
        if (matchesType(ctx.damageType, payload.type)) ctx.amount = 0;
        return ctx;
      },
    },
    {
      kind: 'damage-resistance',
      reduce: (ctx: DamageContext, payload, char) => {
        if (ctx.amount > 0 && matchesType(ctx.damageType, payload.type)) {
          ctx.amount = Math.floor(ctx.amount / 2); // SRD: resistance does not stack
        }
        return ctx;
      },
    },
    {
      kind: 'damage-vulnerability',
      reduce: (ctx: DamageContext, payload, char) => {
        if (ctx.amount > 0 && matchesType(ctx.damageType, payload.type)) {
          ctx.amount *= 2; // SRD: vulnerability does not stack
        }
        return ctx;
      },
    },
  ],
  // ... other hooks
};

// The single entry point services call.
export function applyEffects<C extends HookContext>(
  character: Character,
  hook: HookName,
  ctx: C
): C {
  const entries = HOOK_REGISTRY[hook] || [];
  for (const entry of entries) {
    const sources = getEffects(character, entry.kind); // collects from race/class/subclass/feat
    for (const src of sources) {
      ctx = entry.reduce(ctx, src.payload, character) as C;
    }
  }
  return ctx;
}

// getEffects: collects ALL matching payloads across all sources.
// Handles BOTH conventions (effect.kind for class/race, effectPayload for feat)
// until Phase A unifies the schema.
function getEffects(
  character: Character,
  effectKind: string
): Array<{ source: SourceKind; payload: Record<string, unknown> }> {
  const results: Array<{ source: SourceKind; payload: Record<string, unknown> }> = [];

  // Racial traits
  const race = getRaceDef(character.race);
  for (const traitId of character.racialTraits || []) {
    const trait = race?.traits.find(t => t.id === traitId);
    if (trait?.effect?.kind === effectKind) {
      results.push({ source: 'race', payload: trait.effect.payload || {} });
    }
  }

  // Class features (level-gated)
  const classDef = getClassDef(character.class);
  for (const feat of classDef?.features || []) {
    if (feat.level <= character.level && feat.effect?.kind === effectKind) {
      results.push({ source: 'class', payload: feat.effect.payload || {} });
    }
  }

  // Subclass features (level-gated)
  const subclass = character.subclassId
    ? getSubclassDef(character.class, character.subclassId)
    : undefined;
  for (const feat of subclass?.features || []) {
    if (feat.level <= character.level && feat.effect?.kind === effectKind) {
      results.push({ source: 'subclass', payload: feat.effect.payload || {} });
    }
  }

  // Feats — reads effectPayload (flat shape) with effect fallback post-unification
  for (const featId of character.feats || []) {
    const featDef = getFeatById(featId);
    const kind = featDef?.effect?.kind ?? featDef?.effectPayload?.kind;
    const payload = featDef?.effect?.payload ?? featDef?.effectPayload ?? {};
    if (kind === effectKind) {
      results.push({ source: 'feat', payload });
    }
  }

  return results;
}
```

The service-side change is minimal — one call replacing the inline logic:

```typescript
// services/inventoryEngine.ts — inflictDamageOnTarget, player branch
// BEFORE:
if ('hp' in target && 'stats' in target) {
  dmg = Math.max(0, dmg - getHeavyArmorMasterReduction(target as Character, damageType));
}

// AFTER:
if ('hp' in target && 'stats' in target) {
  const char = target as Character;
  const ctx = applyEffects(char, 'onDamageTaken', { amount: dmg, damageType: damageType || '', target: char });
  dmg = Math.max(0, ctx.amount - getHeavyArmorMasterReduction(char, damageType));
}
```

### 3.3 Hook catalog

The complete set of event points the dispatcher serves. Each has a typed context. New hooks are added as needed (open/closed):

| Hook | Context | Called from | Effect kinds consumed |
|------|---------|-------------|----------------------|
| `computeAc` | `{ baseAc, character, equippedArmor }` | `calculateAc` | `ac-formula` |
| `computeSpeed` | `{ speed, character }` | `calculateSpeed` | `speed-bonus` |
| `computeMaxHp` | `{ hp, character }` | `calculateMaxHp` | `hp-per-level` |
| `onAttackRoll` | `{ roll, character, weaponName, targetId, isRanged }` | `player_attack` | `reroll-ones`, `reckless-attack` (flag), crit-range |
| `onAttackDamage` | `{ damage, character, weaponName, isCrit, isRanged }` | `player_attack` | `damage-bonus` (rage), `crit-bonus-dice`, `sneak-attack`, `weapon-damage-extra-die` |
| `onDamageTaken` | `{ amount, damageType, target, source }` | `inflictDamageOnTarget` + `inventoryService.inflict_damage` | `damage-resistance`, `damage-immunity`, `damage-vulnerability` |
| `onSaveRoll` | `{ roll, stat, character, source, spellContext? }` | `make_save` | `advantage-on-save`, `save-proficiency` |
| `onSkillCheck` | `{ roll, skillName, character }` | `check_skill` | `skill-proficiency`, `skill-expertise`, `reroll-ones` |
| `onConditionApplied` | `{ condition, target }` | `applyCondition` | `condition-immunity` |
| `onLongRest` | `{ character }` | `long_rest` | rest-recovery, cooldown resets |
| `onShortRest` | `{ character }` | `short_rest` | rest-recovery (warlock, fighter) |
| `onLevelUp` | `{ character, newLevel }` | `level_up` | feature-unlock, pool-recompute |
| `onCharacterCreated` | `{ character }` | `buildCharacterFromWizard` | racial-trait application, languages, proficiencies, domain spells |

### 3.4 Integration points

Each existing query/resolution function routes through exactly one hook. No service calls `getEffects` directly — they call `applyEffects(char, '<hook>', ctx)`. This makes the hook the single chokepoint where stacking rules and ordering live.

| Function | File | Current behavior | New behavior |
|----------|------|-------------------|--------------|
| `calculateAc()` | `services/classEngine.ts:100` | Hardcodes `barbarian`/`monk`/`hasDraconicResilience` | `applyEffects(char, 'computeAc', ctx)` reads `ac-formula` |
| `calculateSpeed()` | `services/classEngine.ts:172` | Reads racial `speed-bonus` only; feats hardcoded by ID | `applyEffects(char, 'computeSpeed', ctx)` reads `speed-bonus` from all sources |
| `getDamageResistances()` | `services/classEngine.ts:219` | Racial only, display-only | Becomes a thin wrapper over the dispatcher (or removed in favor of inline `onDamageTaken`) |
| `getConditionsImmunities()` | `services/classEngine.ts:236` | Dead code (zero definitions, zero consumers) | Routed through `onConditionApplied`; definitions added for Monk Purity of Body, Paladin Divine Health, etc. |
| `getSavingThrowBonus()` | `services/classEngine.ts:132` | Hardcodes Rogue L15 Slippery Mind | `applyEffects(char, 'onSaveRoll', ctx)` reads `advantage-on-save` + `save-proficiency` |
| `make_save()` | `services/mcp/combatService.ts:850` | Hardcodes `fey-ancestry` charm-save advantage | `applyEffects(char, 'onSaveRoll', ctx)` handles all `advantage-on-save` sources |
| `player_attack()` | `services/mcp/combatService.ts:1061` | Hardcodes sneak attack (via `isSneakAttack` flag), GWF, monk die | `applyEffects(char, 'onAttackDamage', ctx)` handles `damage-bonus`, `crit-bonus-dice`; Sneak Attack condition-checking added separately |
| `inflictDamageOnTarget()` | `services/inventoryEngine.ts:143` | Enemy resistances only; player branch ignores all resistances | `applyEffects(char, 'onDamageTaken', ctx)` applies player resistances |
| `inflict_damage` (MCP) | `services/mcp/inventoryService.ts` | Separate diverged implementation, no resistances | **Bridged to call `inflictDamageOnTarget`** OR independently wired to `onDamageTaken` (see §3.5) |
| `use_resource()` | `services/mcp/spellcastingService.ts:816` | 4 hardcoded handlers, rest no-op | Resource-handler registry (Phase A) |
| `applyCondition()` | `services/conditionEngine.ts:30` | Checks `conditionsImmunities` (only sleep, hardcoded at creation) | `applyEffects(char, 'onConditionApplied', ctx)` reads `condition-immunity` from all sources |
| `buildCharacterFromWizard()` | `services/characterCreationService.ts:13` | Copies trait IDs only; no mechanical application | `applyEffects(char, 'onCharacterCreated', ctx)` applies languages, profs, domain spells |

### 3.5 Dual damage pipeline resolution

**Decision: bridge, don't consolidate (yet).** The MCP `inflict_damage` tool method will be modified to call `inflictDamageOnTarget()` for its player-target branch (delegating to the canonical pure function), rather than maintaining a second inline implementation. This is a lower-risk change than a full consolidation and closes the divergence immediately. A full consolidation (removing the MCP inline path entirely) is a follow-up after the bridge is proven.

If the bridge proves risky (e.g. return-shape incompatibility), the fallback is to wire BOTH paths independently to `applyEffects(char, 'onDamageTaken', ctx)` — two call sites, one dispatcher. Either way, both paths apply resistances.

---

## 4. Implementation Phases

> **Sequencing philosophy: demolish where it's safe, migrate where it's not.** Phase A aggressively wires the dispatcher for every currently-broken feature (near-zero regression risk — they don't work today). Phase B carefully migrates the already-working branches (AC, speed, sneak-attack, GWF) with byte-identical gating. Phase C handles the two subsystems (Metamagic, Wild Shape) that are too large to fit in a single phase.
>
> Each phase that changes mechanical behavior includes a **prompt-synchronization sub-task** (update `toolModePrompt.ts` so the LLM stops narrating the now-mechanical effect) and a **test sub-task**.

### Phase A — Foundation + Demolish Dead/Broken (~days 1-8)

**Philosophy:** ~80% of the mechanical fixes are for features that are **currently broken** (rage damage, player resistances, missing resource handlers, etc.). These can be wired through the dispatcher with **near-zero regression risk** because they don't work today — the only direction they can go is "improvement." This phase is one aggressive push that delivers most of the player-visible value.

**Sub-steps (each a commit on the long-lived branch, ships together):**

1. **Schema unification + data fixes** (the old Phase 0):
   - Unify feat effect shape: add `effect?: { kind, payload }` to `FeatDefinition`; migrate all 22 feats' flat `effectPayload` into the new shape; keep `effectPayload` as deprecated fallback.
   - Merge `unarmored-defense-13-dex` into `ac-formula` in `data/classes.ts:669` — Draconic Sorcerer entry becomes `effect: { kind: 'ac-formula', payload: { formula: '13 + DEX' } }`.
   - Fix catalog data errors: Halfling Lucky `dieSize: 0` → remove bogus `dieSize`; Half-Orc Savage Attacks `weapon-damage-extra-die` → standardize to `crit-bonus-dice` with `{ count: 1 }`; Tiefling phantom resource `'hellish-rebellion'` → align to `'hellish-rebuke'`; Sorcerer Metamagic descriptions "+2 options" → "+1 option"; remove `shortbow` from druid weapon proficiencies.
   - Introduce `EffectKind` string-literal union in `types/character.ts` (replacing the open `string`) so the compiler catches drift between definitions and consumers.

2. **Build dispatcher core** (`services/effectDispatcher.ts`):
   - `applyEffects(char, hook, ctx)` — the single entry point.
   - `getEffects(char, kind)` — collects payloads from all 4 sources (race/class/subclass/feat), handling both effect-shape conventions.
   - `HOOK_REGISTRY` — maps each `HookName` to a list of `{ kind, reduce }` entries.
   - Typed `HookName` union and per-hook `HookContext` interfaces.
   - `services/effectDispatcher.test.ts` — unit tests for `getEffects` (all 4 sources, both conventions) and `applyEffects` (each hook, stacking rules).

3. **Demolish dead code**:
   - Delete the `getConditionsImmunities` consumer (zero definitions match, zero non-test consumers — fully dead).
   - Remove unused effect-kind declarations that have no wiring plan.
   - Remove the phantom `'hellish-rebellion'` pool from `classEngine.ts:368`.

4. **Wire dispatcher for currently-BROKEN effects** (the bulk of the value — all near-zero regression risk):
   - **Player damage resistances/immunities/vulnerabilities** in BOTH damage pipelines (`inflictDamageOnTarget` + bridge `inflict_damage` MCP tool). Dwarf poison, Tiefling fire, Dragonborn ancestry, Barbarian rage B/P/S all apply correctly.
   - **Rage damage bonus** (+2/+3/+4 by level) via `onAttackDamage` `damage-bonus` reducer keyed on `char.raging`.
   - **Crit-range expansion** (Champion 19-20 / 18-20) via new `crit-range` effect kind.
   - **Crit-bonus-dice** (Brutal Critical, Savage Attacks) via `onAttackDamage`.
   - **reroll-ones** (Halfling Lucky) via `onAttackRoll`.
   - **advantage-on-save** for ALL sources (Gnome Cunning, Brave, Danger Sense, Dwarven Resilience, Fey Ancestry) — replaces the hardcoded fey-ancestry-only check in `make_save`.
   - **Missing `use_resource` handlers** via the new registry: ki (Stunning Strike CON-save), bardic-inspiration (cross-character deferred die), channel-divinity (Turn Undead + domain options), hellish-rebuke (1/LR reaction fire damage).
   - **Character creation pipeline**: `onCharacterCreated` hook applies languages, racial skill proficiencies (Keen Senses, Skill Versatility), racial weapon/armor training (Dwarven), domain/oath spells, racial spell-like abilities (Tiefling Infernal Legacy, level-gated).

5. **Prompt sync** for all the above — update `toolModePrompt.ts` so the LLM stops narrating now-mechanical effects (rage damage, resistances, ki gating, etc.).

**Acceptance criteria:**
- [ ] Dwarf takes half poison damage; Tiefling takes half fire damage; Dragonborn takes half ancestry-type damage.
- [ ] Raging Barbarian's melee attacks deal +2/+3/+4 damage by level; takes half B/P/S damage.
- [ ] Champion Fighter crits on 19-20 (L3+) and 18-20 (L15+).
- [ ] Brutal Critical + Savage Attacks stack (2 extra dice on a Half-Orc Barbarian crit).
- [ ] Halfling rerolls natural 1s on attacks, saves, and checks.
- [ ] Gnome has advantage on INT/WIS/CHA saves vs magic; Halfling vs frightened; Barbarian L2 vs DEX (seen effects); Dwarf vs poison.
- [ ] Monk L2+ can spend ki for Stunning Strike (target CON save or stunned).
- [ ] Bard can grant Bardic Inspiration die to an ally (stored on target).
- [ ] Cleric can use Channel Divinity: Turn Undead.
- [ ] Tiefling can cast hellish rebuke (1/LR, reaction, fire damage).
- [ ] Elf has Perception proficiency; Half-Elf has 2 additional skill proficiencies; Dwarf has battleaxe/handaxe/light hammer/warhammer proficiency.
- [ ] All characters have `languages` populated.
- [ ] Adding a new spendable resource = one handler in `resourceHandlers.ts`, zero changes to `spellcastingService.ts`.
- [ ] All existing tests pass (the only changes are additive — broken features now work).

### Phase B — Migrate Working Branches (~days 9-13)

**Philosophy:** These branches are **already working** and load-bearing for live gameplay. Each migration is its own commit, **byte-identical gated** with exhaustive comparison tests before merge. A regression here would affect every attack roll in every campaign — the bar is higher.

1. **`calculateAc` → `ac-formula` hook** (`services/classEngine.ts:100`). The highest-risk single change.
   - Gate: exhaustive comparison test covering all 12 classes × 4 armor states (none/shield/light/medium/heavy) × Draconic/Monk/Barbarian unarmored variants. Pre- and post-refactor AC must be byte-identical for every combination.
   - Also migrates Dual Wielder AC bonus from hardcoded check to `computeAc` hook.

2. **`calculateSpeed` feat portion → `speed-bonus` from feats** (`services/classEngine.ts:181`).
   - Replace `character.feats?.includes('mobile') || 'athlete'` hardcoded check with dispatcher `speed-bonus` read from feats.
   - Gate: speed identical for characters with/without Mobile/Athlete before and after.

3. **Sneak-attack dice derivation from data** (`services/mcp/combatService.ts:1158-1163`).
   - Replace `attacker.sneakAttackDice ?? Math.ceil(level/2)` fallback with `getEffects(char, 'sneak-attack')` reading the catalog's `extraDiceAtLevel` table.
   - Gate: sneak-attack dice count identical for Rogue L1-L19 before and after.

4. **GWF reroll → dispatcher** (`services/mcp/combatService.ts:1137-1141`).
   - Replace `hasFeat(attacker, 'great-weapon-fighting')` hardcoded check with `getEffects(char, 'gwf-reroll')`.
   - Gate: GWF reroll behavior identical before and after.

5. **Migrate the 4 already-working `use_resource` handlers into the registry** (second-wind, rage-flag, lay-on-hands, breath-weapon).
   - Logic preserved byte-for-byte; only the dispatch mechanism changes (switch → registry lookup).
   - Gate: each handler's existing tests pass identically.

**Acceptance criteria:**
- [ ] All 4 working-branch migrations are byte-identical (proven by exhaustive comparison tests).
- [ ] No existing test fails.
- [ ] The hardcoded branches in `calculateAc`, `calculateSpeed`, `combatService.player_attack` are gone — replaced by dispatcher calls.

### Phase C — Subsystems (~days 14-21)

Two standalone phases for features too large to fit in a single phase. Each is its own PR on the long-lived branch.

#### C1: Metamagic Subsystem

**Goal:** Sorcery points become spendable; the 8 metamagic options modify `cast_spell`.

**Modified files:**
- `services/mcp/spellcastingService.ts` — `cast_spell`: add `metamagic?: { option: string; targets?: string[] }` arg; apply the metamagic modification.
- `services/resourceHandlers.ts` — `sorcery-points` handler: validates the metamagic option's point cost, spends points.
- `data/classes.ts` — Sorcerer: add `metamagic-option` effect entries with point costs.
- `services/llm/tools/spells.ts` — `cast_spell` tool schema: add `metamagic` param.

**Metamagic options (SRD):**

| Option | Cost | Effect on `cast_spell` |
|---|---|---|
| Twinned Spell | 1+ | Single-target spell hits 2 targets (pass `targets[]`) |
| Quickened Spell | 2 | Spell becomes a bonus action (narrative flag; action economy deferred) |
| Subtle Spell | 1 | No verbal/somatic components (narrative) |
| Empowered Spell | 1 | Reroll damage dice (post-roll, up to CHA mod dice) |
| Careful Spell | 1 | Chosen targets auto-save (no damage on save spells) |
| Distant Spell | 1 | Double range / ranged touch becomes 30ft |
| Extended Spell | 1 | Double duration |
| Heightened Spell | 3 | Target has disadvantage on save |

**Acceptance criteria:**
- [ ] Sorcerer can Twin a single-target spell (two targets take effect).
- [ ] Sorcerer can Empower a spell (reroll up to CHA-mod damage dice, keep new).
- [ ] Sorcery points are spent correctly per option cost.
- [ ] `cast_spell` without `metamagic` is byte-identical to pre-refactor.
- [ ] All existing spell tests pass.

#### C2: Wild Shape Subsystem

**Goal:** reconcile the disconnected `polymorph_creature` tool with the wild-shape resource pool — the #1 Druid bug.

**Modified files:**
- `services/mcp/mcpService.ts` — `polymorph_creature`: when the caster is a Druid, route through `wild-shape` resource spend (consume a charge), enforce CR limits, use `createWildShapeState` instead of `applyPolymorph`.
- `services/resourceHandlers.ts` — `wild-shape` handler: validate CR (druid_level / 3, min ¼, no flying before L8, no swimming before L4), consume charge, delegate to transformation engine.
- `services/transformationEngine.ts` — ensure `createWildShapeState` enforces the CR + fly + swim gating.
- Beast-form catalog — tag each form with CR + swim/fly flags for filtering.

**Acceptance criteria:**
- [ ] Druid can Wild Shape (consumes a charge from the `wild-shape` pool).
- [ ] CR limit enforced (CR ≤ druid_level / 3, min ¼).
- [ ] No flying forms before L8; no swimming forms before L4.
- [ ] Wild Shape HP is temporary (reverts on dropping to 0 or on duration end).
- [ ] L20 Druid has unlimited Wild Shape (pool max = ∞).
- [ ] Non-Druid `polymorph_creature` still works (does not consume wild-shape).
- [ ] All existing transformation tests pass.

### Phase D — Testing, Polish & Documentation (~days 22-24)

1. Full test suite run — zero regressions.
2. Edge-case sweep: effect stacking (verify §2.2 rules), effect conflicts (multiple AC formulas), temporary effects, effect removal (concentration break).
3. Performance profiling — verify `getEffects` is sub-millisecond per call (§2.3); add WeakMap cache if needed.
4. Documentation: update `AGENTS.md` (new effect-dispatcher section, correct stale claims like "no monk ki pool"), `ARCHITECTURE.md` (dispatcher in the service diagram), `README.md` if it references class/race mechanics.
5. Correct stale doc claims discovered during this refactor: AGENTS.md "there is no monk ki pool in `recalculateResourcePools` yet" (the pool exists at `classEngine.ts:263`; only the spend was missing).
6. `WorkingVsBroken.md` reassessment: re-tier the classes/races with their new status.

**Acceptance criteria:**
- [ ] All unit + integration tests pass.
- [ ] No performance regression (>50ms added per tool call).
- [ ] `AGENTS.md`, `ARCHITECTURE.md` updated.
- [ ] Rebase from `main` is clean (no unresolved conflicts).

---

## 5. Cross-cutting subsystem notes

### 5.1 Bardic Inspiration (cross-character deferred effect)

Bardic Inspiration does not fit the "spend now, effect now" model — the Bard grants a die to an ally, and the ally later rolls it on their own roll. Design:

- New field on `Character`: `inspirationDice?: Array<{ sourceCharId: string; dieSize: number }>` — dice granted TO this character.
- `use_resource('bardic-inspiration', { targetId })` creates an entry on the target's `inspirationDice`.
- A new hook `onAnyRoll` (or extend `onAttackRoll`/`onSaveRoll`/`onSkillCheck`) checks for available inspiration dice and offers them. The consuming character (or LLM) chooses to add the die; on use, the entry is removed.
- Die size scales by Bard level: d6 → d8 (L5) → d10 (L10) → d12 (L15).
- UI: a Bardic Inspiration die chip on the target's sheet; a "use inspiration" option in the roll-resolution flow.

This is scoped within Phase A but flagged as the most complex handler.

### 5.2 Divine Smite (spell-slot-consuming feature, not a pool)

Divine Smite is not a resource pool — it expends a spell slot on a melee hit. Two implementation options:

**Option A (preferred):** a `player_attack` arg `divineSmite?: { slotLevel: number }`. When present, the attack expends the slot and adds `1d8 + slotLevel`d8 radiant damage (capped 5d8 + 1d8 vs undead/fiends). Self-contained in `player_attack`.

**Option B:** a separate `divine_smite` tool called after `player_attack` — rejected (violates the "never split damage across calls" rule in AGENTS.md).

Option A requires a `player_attack` schema change (Phase A or B). Listed in Phase A acceptance criteria.

---

## 6. Class-Behavior Special Cases (deliberate, not accidental)

Not every ID branch can or should be eliminated. Three categories of class behavior **do not fit the `effect.kind` model** and remain as deliberate special cases, documented here so future contributors don't mistake them for oversights:

| Special case | File | Why it can't be an effect |
|---|---|---|
| **Warlock pact-magic pool generation** | `services/classEngine.ts:344` | Pact magic isn't an "effect" — it's a resource-pool generation rule that replaces the standard spell-slot matrix. The dispatcher consumes effects; it doesn't generate resource pools. The `if (classDef.id === 'warlock')` branch stays, documented. |
| **Monk martial-arts die substitution** | `services/mcp/combatService.ts:1117-1121` | This is weapon-die replacement (unarmed strike → scaling martial arts die), not a character effect. It belongs in the weapon catalog or as a class-behavior flag, not in the effect dispatcher. The `isMonk` check stays, documented. |
| **Wizard prepare-from-spellbook rule** | `services/mcp/spellcastingService.ts:624` | "Wizards prepare from spellbook only; Clerics/Druids/Paladins prepare from full class list" is class behavior, not an effect. The `char.class === 'wizard'` branch stays, documented. |

**Rule of thumb:** if it changes *how a roll resolves* (damage, AC, saves, resistances), it's an effect → dispatcher. If it changes *how the class is constructed or how its resources are generated*, it's class behavior → special case.

---

## 7. File Change Summary

### New files (5)
| File | Phase | Purpose |
|------|-------|---------|
| `services/effectDispatcher.ts` | A | Core dispatcher: `applyEffects`, `getEffects`, `HOOK_REGISTRY`, hook types |
| `services/effectDispatcher.test.ts` | A | Unit tests |
| `services/resourceHandlers.ts` | A | Resource spend-handler registry |
| `tests/services/effectDispatcher.integration.test.ts` | D | Integration tests across hooks |
| `tests/services/resourceHandlers.test.ts` | D | Resource handler tests |

### Modified files
| File | Phase | Changes |
|------|-------|---------|
| `types/character.ts` | A, A | `EffectKind` union; `languages?` field; `inspirationDice?` field |
| `data/classes.ts` | A, A, C1 | Data fixes; add `damage-bonus`/`crit-range`/`healing-bonus`/`metamagic-option` effect payloads; domain spells |
| `data/races.ts` | A, A | Data fixes (`dieSize`, `hellish-rebellion`); `languages`; `skill-proficiency` effects; Tiefling spell gating |
| `data/feats.ts` | A | Unify to `effect: { kind, payload }` shape |
| `services/classEngine.ts` | A, B | `calculateAc`/`calculateSpeed`/`getSavingThrowBonus` route through dispatcher; dead-code removal |
| `services/mcp/combatService.ts` | A, B | `player_attack` + `make_save` integrate dispatcher hooks |
| `services/mcp/spellcastingService.ts` | A, B, C1 | `use_resource` → registry; `cast_spell` metamagic arg |
| `services/inventoryEngine.ts` | A | `inflictDamageOnTarget` player branch → `onDamageTaken` |
| `services/mcp/inventoryService.ts` | A | `inflict_damage` MCP bridge to `inflictDamageOnTarget` |
| `services/conditionEngine.ts` | A | `applyCondition` reads dispatcher-populated immunities |
| `services/characterCreationService.ts` | A | `onCharacterCreated` hook; languages, profs, domain spells |
| `services/mcp/mcpService.ts` | C2 | `polymorph_creature` wild-shape routing |
| `services/transformationEngine.ts` | C2 | `createWildShapeState` CR/fly/swim gating |
| `services/featsService.ts` | A, B | Route through dispatcher |
| `services/llm/prompts/toolModePrompt.ts` | A, A, A, A, C1, C2 | Prompt sync per phase (stop narrating now-mechanical effects) |
| `services/llm/tools/spells.ts` | C1 | `cast_spell` metamagic param |
| `services/llm/tools/combat.ts` | A | `player_attack` divine-smite param |

### UI changes (revised — UI work IS expected)
| Component | Phase | Change |
|---|---|---|
| `InputArea.tsx` | A, C1 | Quick Action buttons for Bardic Inspiration, Metamagic |
| `CharacterSheet.tsx` | A | Bardic Inspiration die chip display |
| New modal or existing pattern | C2 | Wild Shape beast-form picker (mirrors Arcane Recovery modal pattern) |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `calculateAc` migration breaks existing AC values | Medium | High | Exhaustive byte-identical comparison tests for all class/race/armor combos before merge; Phase B is data-routing-only (no formula changes) |
| Dual damage pipeline diverges again | Medium | High | Phase A bridges the MCP tool to the pure function; full consolidation is a documented follow-up |
| LLM double-applies now-mechanical effects | High | Medium | Prompt sync is an explicit sub-task of every mechanical phase; each phase's tests include a prompt-assertion check |
| Effect stacking bugs | Medium | Medium | Stacking rules defined up-front (§2.2); reducer tests cover multi-source scenarios |
| Bardic Inspiration cross-character complexity | Medium | Medium | Scoped as the most complex Phase A handler; dedicated integration tests |
| Performance regression from dispatcher overhead | Low | Medium | Profile in Phase D; WeakMap cache design ready (§2.3) if needed |
| Wild Shape reconciliation breaks non-druid polymorph | Medium | Medium | `polymorph_creature` branches on Druid class; non-Druid path preserved byte-identical |
| Metamagic `cast_spell` changes break non-sorcerer casting | Low | High | `metamagic` param is optional; absent = byte-identical path |
| **Merge conflicts with active main work** | **Medium** | **Medium** | **Weekly rebases from main; new logic in new files; thin delegation in shared services (§2.6)** |

---

## 9. Success Metrics

| Metric | Current (verified) | Target |
|--------|---------|--------|
| Class/race effect kinds read by engine | 3 of 16 (1 mechanical) | 16 of 16 |
| Feat effect kinds read via payload | 1 of 22 | 22 of 22 |
| **Effect-dispatch hardcoded ID branches** | **10+** | **0** (all effects route through dispatcher) |
| **Class-behavior special cases** (deliberate, documented) | — | **3** (pact-magic pool, monk martial die, wizard spellbook-prep) |
| Resource IDs with mechanical `use_resource` effects | 4 of 14 | 12 of 14 (2 deferred: `indomitable`, `arcane-recovery` exempt) |
| Classes with working core features | 5 of 12 | 11 of 12 (Monk Flurry deferred to action-economy phase) |
| Races with working signature features | 4 of 9 | 9 of 9 |
| Damage pipeline paths applying player resistances | 0 of 2 | 2 of 2 |

---

## 10. Out of Scope

Explicitly **not** part of this refactor (follow-ups after the dispatcher lands):

1. **Action economy system** (§11) — bonus-action counter, per-turn attack counter, general reaction gate. Precondition for Extra Attack, Flurry of Blows, Action Surge's extra-action, Indomitable's save-reroll, Cunning Action, Uncanny Dodge. The dispatcher's hook design (`onTurnStart`, `onActionDeclared`) is ready to receive this.
2. **Subraces** — High/Wood/Dark elf, Hill/Mountain dwarf, etc. Trivially additive once the dispatcher exists (subraces = race variants with extra traits), but a separate data + UI effort.
3. **New classes or races** — this refactor fixes existing ones.
4. **VTT battle map changes** — grid movement, token placement (unrelated).
5. **Multiplayer sync changes** — the dispatcher is local-state only; no sync implications.
6. **Save file migration** — per the backward-compat policy (§2.1), existing saves are not migrated; per-roll effects apply immediately, stored derivations follow new-characters-only.

---

## 11. Deferred: Action Economy System (follow-up)

This is the precondition phase for the features excluded above. Outlined here so the dispatcher design accommodates it.

**Design sketch:**
- New per-turn state on `Character`: `actionEconomy?: { action: boolean; bonusAction: boolean; reaction: boolean; attacksUsed: number; attacksMax: number }` — reset on turn start.
- New hooks: `onTurnStart` (reset economy), `onActionDeclared` (validate + decrement), `onTurnEnd`.
- `player_attack` checks `attacksUsed < attacksMax` (Extra Attack sets `attacksMax`); the LLM declares each attack.
- `use_resource('action-surge')` sets `action: true` again (grants the extra action).
- `use_resource('indomitable')` as a reaction to a failed save (validates `reaction: true`).
- Bonus-action features (Flurry, Cunning Action, patient defense) validate `bonusAction: true`.

**Features unlocked by this phase:**
Extra Attack, Flurry of Blows, Action Surge (extra action), Indomitable (save reroll), Cunning Action, Uncanny Dodge, Sneak Attack once-per-turn enforcement, Reactive feats (Sentinel, Polearm Master reactions).

**Estimated:** 5-7 days after Phase D. Separate plan.

---

## 12. Post-Implementation Follow-Ups

After this refactor + the action-economy follow-up:

1. **Subrace system** — subraces as race variants with additional traits (pure data).
2. **Missing subclasses** — Battle Master, Totem Warrior, Moon Druid, Hexblade, Vengeance Paladin, Arcane Trickster, Wild Magic Sorcerer (pure data once their effect kinds exist).
3. **Feat expansion** — Lucky, War Caster, Sentinel, Polearm Master, Crossbow Expert, Sharpshooter (Sharpshooter's -5/+10 is already mechanical via the `sharpshooter` arg; the feat's other benefits would be data-driven).
4. **Magic items** — items define effects the dispatcher applies (a `flaming` weapon adds `damage-bonus`).
5. **Conditions as effects** — refactor `ActiveCondition` to use the same dispatcher for condition-applied effects (poisoned → disadvantage on attacks via `onAttackRoll`).

---

## 13. Appendix: Effect Kind Reference

### 13.1 Class/Race effect kinds (post-unification)

| Effect kind | Payload shape | Sources | Phase wired |
|---|---|---|---|
| `ac-formula` | `{ formula: string }` | Barbarian, Monk, Sorcerer (Draconic) | A (merge), B (wire) |
| `speed-bonus` | `{ bonus: number; condition?: string }` | Barbarian, Monk, Mobile feat, Athlete feat | A (racial), B (feats) |
| `damage-resistance` | `{ type: string }` | Dwarf, Tiefling, Dragonborn, Barbarian (raging) | A |
| `damage-immunity` | `{ type: string }` | (future) | A |
| `damage-vulnerability` | `{ type: string }` | (future) | A |
| `advantage-on-save` | `{ against: string; stat?: string }` | Gnome, Halfling, Elf, Half-Elf, Barbarian, Dwarf | A |
| `condition-immunity` | `{ condition: string }` | Paladin, Barbarian (Berserker), Monk (future) | A |
| `crit-bonus-dice` | `{ count: number }` | Barbarian, Half-Orc | A |
| `crit-range` | `{ min: number }` | Fighter (Champion) | A |
| `reroll-ones` | `{ scope: string }` | Halfling | A |
| `damage-bonus` | `{ amount: string; condition?: string; types?: string[] }` | Barbarian (rage), Sorcerer (Elemental Affinity), Cleric (Divine Strike) | A, C (subclass) |
| `sneak-attack` | `{ extraDiceAtLevel: Record<number, number> }` | Rogue | A (data read), B (migration) |
| `healing-bonus` | `{ amount: string }` | Cleric (Life Domain) | C (subclass) |
| `attack-bonus` | `{ amount: string }` | Paladin (Sacred Weapon) | C (subclass) |
| `weapon-damage-extra-die` | — | **Deprecated** — merged into `crit-bonus-dice` in Phase A | A |
| `unarmored-defense-13-dex` | — | **Deprecated** — merged into `ac-formula` in Phase A | A |
| `reckless-attack` | `{ }` | Barbarian | Deferred (action economy) |
| `extra-attack` | `{ count: number }` | Fighter, Barbarian, Monk, Paladin, Ranger | Deferred (action economy) |
| `pact-magic` | `{ }` | Warlock | N/A (already wired by class-ID; data marker only — special case §6) |
| `spellcasting` | `{ }` | All casters | N/A (caster detection via `classDef.spellcasting`) |

### 13.2 Feat effect kinds (post-unification, Phase A)

All 22 migrate from flat `effectPayload` to `effect: { kind, payload }`. Key ones:

| Effect kind | Feats | Wired in phase |
|---|---|---|
| `speed-bonus` | Mobile, Athlete | A (feat portion in B) |
| `gwf-reroll` | Great Weapon Fighting | B |
| `offhand-modifier` | Two-Weapon Fighting | A |
| `damage-reduction` | Heavy Armor Master | A (already mechanical; migrate to dispatcher) |
| `save-proficiency` | Resilient | A |
| `shield-bonus-to-save` | Shield Master | A |
| `hp-per-level` | Tough | A (already mechanical in `calculateMaxHp`; migrate to dispatcher) |
| `initiative-bonus` | Alert | (future — initiative not yet modeled) |
| `dual-wielder-ac` | Dual Wielder | B (migrate to `computeAc`) |

---

## Sign-Off

Before implementation begins, confirm:

1. **Key Design Decisions (§2)** — especially the backward-compatibility policy (§2.1), stacking rules (§2.2), schema unification (§2.4), action-economy deferral (§2.5), and **branch strategy (§2.6)**.
2. **Phase breakdown** — the A/B/C/D structure, with Phase A delivering ~80% of fixes aggressively and Phase B migrating working branches carefully.
3. **Class-Behavior Special Cases (§6)** — agreement that pact-magic pool, monk martial die, and wizard spellbook-prep remain as documented special cases.
4. **Scope** — what's in (mechanical fixes via dispatcher) and out (action economy, subraces, new content).

Once approved, implementation proceeds on `feature/effect-dispatcher`, Phase A first.
