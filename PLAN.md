# Effect Dispatcher Implementation Plan

> **Branch**: `feature/effect-dispatcher`
> **Created**: July 29, 2026
> **Revised**: July 29, 2026 (post-review — corrected facts, resolved architecture, reorganized phases)
> **Status**: Planning — awaiting sign-off on the Key Design Decisions (§3) before implementation

---

## Executive Summary

This plan describes a refactor of how Dice On Rails handles class features, racial traits, and feat effects. The current architecture relies on **hardcoded class-ID / race-ID / feat-ID string branches** scattered across ~10 service files. The data catalogs (`data/classes.ts`, `data/races.ts`, `data/feats.ts`) declare structured effect payloads (`effect: { kind, payload }` for classes/races; flat `effectPayload: { kind, ... }` for feats) that are **almost never consumed by engine code** — they act as documentation only.

The new architecture introduces a **hook-aggregator effect dispatcher** (`services/effectDispatcher.ts`) that reads effect payloads at runtime and folds them into a typed **hook context** at well-defined event points (`onDamageTaken`, `onAttackDamage`, `onSaveRoll`, `computeAc`, …). This eliminates the hardcoded branches, makes catalog metadata functional, and enables adding new classes/races/subclasses/feats with catalog data alone for standard effects.

This is an **incremental, reversible refactor**. Each phase ships standalone mechanical fixes. Hardcoded branches are migrated to the dispatcher one at a time, gated by tests.

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

2. **Action economy is absent.** There is no bonus-action counter, no per-turn attack counter, no general reaction gate (only reaction-**spells** are gated via `cast_spell`'s `reaction: true` arg). Features that depend on action economy — Extra Attack, Flurry of Blows, Action Surge's "extra action", Indomitable's save-reroll reaction, Cunning Action, Uncanny Dodge — **cannot be made fully mechanical** without a prerequisite action-economy system. This is deferred (§3.4, §10) and is a hard precondition for those specific features.

3. **Prompts compensate for missing mechanics.** `services/llm/prompts/toolModePrompt.ts` actively instructs the LLM to narrate effects the engine doesn't enforce (rage damage at `:70`, "apply full damage" for resistances at `:93`, "level-1 monk has not yet learned ki" at `:83`). Once the engine enforces these, the LLM will **double-apply** them unless prompts are synchronized. Prompt updates are therefore an **explicit sub-task of every mechanical phase** (§3.5), not out of scope.

---

## 2. Key Design Decisions (require sign-off before Phase 0)

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

Defined up-front (SRD-faithful) so Phase 1 reducers are correct:

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

### 2.4 Effect schema unification (Phase 0)

**Decision: normalize feats to the `effect: { kind, payload }` shape used by classes/races.**

Feats currently use `effectPayload?: Record<string, any>` (flat). To unify:
- Add `effect?: { kind: string; payload?: Record<string, unknown> }` to `FeatDefinition` (mirrors `ClassFeature.effect`).
- Phase 0 migrates each feat's flat `effectPayload` into `effect: { kind, payload }` (e.g. `{ kind: 'speed-bonus', bonus: 10 }` → `effect: { kind: 'speed-bonus', payload: { bonus: 10 } }`).
- The flat `effectPayload` field is kept temporarily as a deprecated alias (read falls back to it) for one release, then removed.
- This lets `getEffects()` read all three sources (race/class/feat) through one shape.

### 2.5 Action economy scope

**Decision: deferred to a follow-up phase after the dispatcher lands.** Features that *require* action economy to function are **explicitly excluded** from the phase deliverables that claim to "make them work" — they are listed as deferred in §10. The dispatcher infrastructure (§4) is designed so that when the action-economy system arrives, these features slot in via a new hook set (`onTurnStart`, `onActionDeclared`) without re-architecting.

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
// until Phase 0 unifies the schema.
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
| `use_resource()` | `services/mcp/spellcastingService.ts:816` | 4 hardcoded handlers, rest no-op | Resource-handler registry (Phase 4) |
| `applyCondition()` | `services/conditionEngine.ts:30` | Checks `conditionsImmunities` (only sleep, hardcoded at creation) | `applyEffects(char, 'onConditionApplied', ctx)` reads `condition-immunity` from all sources |
| `buildCharacterFromWizard()` | `services/characterCreationService.ts:13` | Copies trait IDs only; no mechanical application | `applyEffects(char, 'onCharacterCreated', ctx)` applies languages, profs, domain spells |

### 3.5 Dual damage pipeline resolution

**Decision: bridge, don't consolidate (yet).** The MCP `inflict_damage` tool method will be modified to call `inflictDamageOnTarget()` for its player-target branch (delegating to the canonical pure function), rather than maintaining a second inline implementation. This is a lower-risk change than a full consolidation and closes the divergence immediately. A full consolidation (removing the MCP inline path entirely) is a follow-up after the bridge is proven.

If the bridge proves risky (e.g. return-shape incompatibility), the fallback is to wire BOTH paths independently to `applyEffects(char, 'onDamageTaken', ctx)` — two call sites, one dispatcher. Either way, both paths apply resistances.

---

## 4. Implementation Phases

> Each phase is independently shippable. Each phase that changes mechanical behavior includes a **prompt-synchronization sub-task** (update `toolModePrompt.ts` so the LLM stops narrating the now-mechanical effect) and a **test sub-task**.

### Phase 0: Schema unification & data fixes (Days 1-2)

**Goal:** make the catalog's effect payloads consistent and correct so the dispatcher can read them.

**Tasks:**
1. **Unify feat effect shape** (§2.4): add `effect?: { kind, payload }` to `FeatDefinition`; migrate all 22 feats' flat `effectPayload` into the new shape; keep `effectPayload` as deprecated fallback.
2. **Merge `unarmored-defense-13-dex` into `ac-formula`** in `data/classes.ts:669` — change the Draconic Sorcerer entry to `effect: { kind: 'ac-formula', payload: { formula: '13 + DEX' } }`. This unifies all unarmored-defense under one kind.
3. **Fix catalog data errors** (from `WorkingVsBroken.md` Addendum 2):
   - Halfling Lucky `reroll-ones` payload: `dieSize: 0` → remove the bogus `dieSize` (the reroll uses the original die).
   - Half-Orc Savage Attacks `weapon-damage-extra-die` payload: `dieSize: 0` → remove; standardize to `crit-bonus-dice` with `{ count: 1 }` (Savage Attacks and Brutal Critical are the same mechanic).
   - Tiefling phantom resource: `classEngine.ts:368` creates `'hellish-rebellion'`; the racial trait uses `'hellish-rebuke'`. Align to `'hellish-rebuke'`.
   - Sorcerer Metamagic feature descriptions: "+2 options" → "+1 option" (SRD grants 1 per acquisition level).
   - Druid weapon proficiencies: remove `shortbow` (not in SRD druid list).
4. **Type the effect kinds**: introduce a `EffectKind` string-literal union in `types/character.ts` (replacing the open `string`) so the compiler catches drift between definitions and consumers. Cover both class/race kinds and feat kinds (unified).

**Acceptance criteria:**
- [ ] All feats have an `effect: { kind, payload }` field matching their old `effectPayload`.
- [ ] `getSubclassDef` + `getRaceDef` + `getClassDef` + `getFeatById` all resolve correctly (verified by a `getEffects` dry-run test).
- [ ] `EffectKind` union compiles and all catalog entries satisfy it.
- [ ] No mechanical behavior change yet (data-only phase). All existing tests pass.

**Prompt sync:** none (no behavior change).

---

### Phase 1: Dispatcher core & read-only query hooks (Days 3-5)

**Goal:** build the dispatcher infrastructure and route the **already-working** read paths through it. No new mechanical effects yet — just prove the chokepoint.

**New files:**
- `services/effectDispatcher.ts` — `applyEffects`, `getEffects`, `HOOK_REGISTRY`, typed `HookName` union, `HookContext` interfaces.
- `services/effectDispatcher.test.ts` — unit tests for `getEffects` (all 4 sources) and `applyEffects` (each hook).

**Modified files:**
- `services/classEngine.ts` — `calculateSpeed` (route racial + feat `speed-bonus` through dispatcher, replacing the hardcoded `mobile`/`athlete` check at `:181`); `calculateAc` (route `ac-formula` through dispatcher, replacing the `barbarian`/`monk`/`hasDraconicResilience` branches at `:109-117`); `getDamageResistances` (now reads from dispatcher); `getConditionsImmunities` (now reads from dispatcher).

**Effect kinds wired in this phase:** `ac-formula`, `speed-bonus`, `damage-resistance` (read), `condition-immunity` (read).

**Acceptance criteria:**
- [ ] `calculateAc` for Barbarian/Monk/Draconic Sorcerer returns identical values to pre-refactor (byte-identical for existing characters).
- [ ] `calculateSpeed` for a character with Mobile feat returns the same bonus as before (now via dispatcher, not hardcoded).
- [ ] `getEffects(char, 'ac-formula')` returns the Draconic Sorcerer formula (post-Phase-0 merge).
- [ ] A NEW race with a `speed-bonus` effect works without any engine code change (verified by a test with a mock race def).
- [ ] All existing `classEngine` tests pass.

**Prompt sync:** none.

**Risk note:** the `calculateAc` migration is the highest-risk change in the whole refactor (AC affects every attack). It must be byte-identical for existing characters. Gate with exhaustive comparison tests before merging.

---

### Phase 2: Damage pipeline correctness — resistances (Days 6-8)

**Goal:** the single highest-value mechanical fix. Make player damage resistances, immunities, and vulnerabilities actually apply.

**Modified files:**
- `services/inventoryEngine.ts` — `inflictDamageOnTarget` player branch: add `applyEffects(char, 'onDamageTaken', ctx)`.
- `services/mcp/inventoryService.ts` — `inflict_damage` MCP tool: bridge player-target branch to `inflictDamageOnTarget` (§3.5), OR wire `onDamageTaken` independently.
- `services/effectDispatcher.ts` — register `onDamageTaken` reducers for `damage-resistance`, `damage-immunity`, `damage-vulnerability`.
- `services/mcp/combatService.ts` — `resolveEnemySingleAttack`: now that players have working resistances, verify the `skipTargetDerivedReductions` path (currently bypasses even HAM/tempHP) is intentional; document it.

**Effects that start working:** Dwarf poison resistance, Tiefling fire resistance, Dragonborn ancestry resistance. (Barbarian rage B/P/S resistance comes in Phase 3 — it's conditional on `char.raging`, a separate hook entry.)

**Acceptance criteria:**
- [ ] Dwarf character takes half poison damage from both `inflict_damage` and enemy attacks.
- [ ] Tiefling takes half fire damage.
- [ ] Dragonborn takes half their-ancestry-type damage.
- [ ] Resistance does NOT stack (two sources of poison resistance → still half, not quarter).
- [ ] Heavy Armor Master reduction still applies (stacks with resistance — different mitigation type).
- [ ] Temp HP still absorbs first (order: temp HP → resistance → HP). **Verify SRD ordering**: SRD applies resistance to the raw damage, THEN temp HP absorbs. The reducer must run before temp-HD absorption. Document the chosen order.
- [ ] All existing `inventoryEngine` / `inventoryService` tests pass.

**Prompt sync:** update `toolModePrompt.ts:93` — remove the "apply FULL rolled damage to HP" instruction for racial resistances; replace with "player damage resistances are applied automatically — do NOT halve damage narratively for races with resistance." Keep the note that LLM-narrated custom resistances (not in catalog) still need manual handling.

---

### Phase 3: Offensive combat effects (Days 9-12)

**Goal:** make the marquee combat features mechanical: rage damage, crit-range expansion, crit bonus dice, reroll-ones, sneak-attack dice-from-data.

**Modified files:**
- `services/mcp/combatService.ts` — `player_attack`: integrate `applyEffects(char, 'onAttackRoll', ctx)` for crit-range (Champion) and `reroll-ones` (Lucky); integrate `applyEffects(char, 'onAttackDamage', ctx)` for `damage-bonus` (rage), `crit-bonus-dice` (Brutal Critical, Savage Attacks), `sneak-attack`.
- `services/effectDispatcher.ts` — register `onAttackRoll` and `onAttackDamage` reducers.
- `data/classes.ts` — add `damage-bonus` effect to Barbarian Rage feature (payload: `{ amount: 'rage-bonus', condition: 'raging', types: ['str-melee'] }`); add `crit-range` effect to Champion Improved/Superior Critical (`payload: { min: 19 }` / `{ min: 18 }`).

**Effects that start working:**
| Effect | Who benefits |
|---|---|
| Rage damage bonus (+2/+3/+4 by level) | Barbarian — `player_attack` now reads `char.raging` via the `damage-bonus` reducer |
| Rage B/P/S resistance | Barbarian — registered at `onDamageTaken` with a `condition: 'raging'` predicate |
| Champion expanded crit range (19-20 / 18-20) | Fighter (Champion) |
| Brutal Critical (extra crit dice) | Barbarian L9/13/17 |
| Savage Attacks (extra crit die) | Half-Orc |
| Lucky (reroll natural 1s) | Halfling |
| Sneak Attack dice from data | Rogue — now derived from the `sneak-attack` effect payload instead of `attacker.sneakAttackDice` field |

**Explicitly NOT in this phase (deferred to §10):**
- Sneak Attack **condition auto-detection** (advantage/ally-adjacency/finesse) — requires position tracking + action economy. The `isSneakAttack` flag remains LLM-controlled; only the *dice count derivation* is data-driven now.
- Extra Attack (action economy prerequisite).
- Flurry of Blows (action economy + ki handler, Phase 4/deferred).

**Acceptance criteria:**
- [ ] Raging Barbarian's melee attacks deal +2/+3/+4 damage by level tier.
- [ ] Raging Barbarian takes half B/P/S damage.
- [ ] Champion Fighter crits on 19-20 (L3+) and 18-20 (L15+).
- [ ] Barbarian L9 adds 1 extra crit die; Half-Orc adds 1 extra crit die; both stack (2 extra on a Half-Orc Barbarian).
- [ ] Halfling rerolls a natural 1 on an attack roll and uses the new value.
- [ ] Rogue sneak attack dice count matches the `extraDiceAtLevel` table in the catalog.
- [ ] All existing combat tests pass.

**Prompt sync:** update `toolModePrompt.ts:70` — remove "rage adds +2 damage" narration instruction (engine does it now). Remove the Savage Attacks / Brutal Critical narration reminders if present. Add: "Rage damage, crit-range expansion, crit bonus dice, and Lucky rerolls are applied automatically — do not adjust these narratively."

---

### Phase 4: Defensive effects — saves & conditions (Days 13-15)

**Goal:** make save advantages and condition immunities mechanical from catalog data.

**Modified files:**
- `services/mcp/combatService.ts` — `make_save`: replace hardcoded `fey-ancestry` charm check with `applyEffects(char, 'onSaveRoll', ctx)`.
- `services/mcp/travelService.ts` — `check_skill`: add `applyEffects(char, 'onSkillCheck', ctx)` for `skill-proficiency`, `skill-expertise`, `reroll-ones`.
- `services/conditionEngine.ts` — `applyCondition`: the existing `conditionsImmunities` check stays, but the immunities list is now **populated from the dispatcher** (`onCharacterCreated` / `onLevelUp` write `condition-immunity` sources into `conditionsImmunities`), not hardcoded at creation.
- `services/effectDispatcher.ts` — register `onSaveRoll`, `onSkillCheck`, `onConditionApplied` reducers.

**Effects that start working:**
| Effect | Who benefits |
|---|---|
| Gnome Cunning (advantage on INT/WIS/CHA saves vs magic) | Gnome |
| Brave (advantage vs frightened) | Halfling |
| Danger Sense (advantage on DEX saves vs seen effects) | Barbarian L2 |
| Dwarven Resilience (advantage vs poison) | Dwarf — *note: the catalog currently declares this as `damage-resistance` only; Phase 0/4 adds the save-advantage half* |
| All `advantage-on-save` sources generically | Any future race/feat |

**Acceptance criteria:**
- [ ] Gnome rolls twice on INT/WIS/CHA saves against spells, keeps higher.
- [ ] Halfling rolls twice on saves vs frightened conditions.
- [ ] Barbarian L2 rolls twice on DEX saves (Danger Sense).
- [ ] Dwarf rolls twice on saves vs poison.
- [ ] Advantage does NOT stack (multiple qualifying sources = one advantage roll, not three).
- [ ] All existing save tests pass.

**Prompt sync:** add to `toolModePrompt.ts`: "Save advantages from racial traits (Gnome Cunning, Brave, Danger Sense, Dwarven Resilience) are applied automatically — do not grant advantage narratively for these."

---

### Phase 5: Resource spend registry (Days 16-19)

**Goal:** replace the 4-handler `use_resource` switch with an extensible registry. Wire the missing spendable resources.

**New files:**
- `services/resourceHandlers.ts` — `RESOURCE_HANDLERS: Map<resourceId, ResourceHandler>` where each handler knows how to spend + apply the effect.

**Modified files:**
- `services/mcp/spellcastingService.ts` — `use_resource`: replace the `if`-chain with registry lookup; default fallthrough stays (spend charge, return generic message) for truly narrative resources.

**Resource handlers implemented:**

| Resource ID | Handler action | Status |
|---|---|---|
| `second-wind` | Heal 1d10 + level | Migrated (already works) |
| `rage` | Set `raging = true`, break concentration | Migrated (already works) |
| `lay-on-hands-pool` | Heal target by amount | Migrated (already works) |
| `breath-weapon` | Compute DC + damage | Migrated (already works) |
| `ki` | Spend ki; `action` param selects Flurry / Patient Defense / Step of the Wind / Stunning Strike. **Flurry's "2 unarmed strikes" requires action economy (deferred)** — Phase 5 implements the ki-spend + the Stunning Strike CON-save (which is a self-contained save, not action-economy-dependent). Flurry bonus-action is deferred to §10. | New |
| `bardic-inspiration` | Grant an inspiration die to a target (stored on target). See §5.1 for the cross-character deferred-effect design. | New |
| `channel-divinity` | `action` param selects Turn Undead (CR-based destruction) or domain option. | New |
| `divine-smite` | New resource surface — Paladin expends a spell slot via `cast_spell`-adjacent path; see §5.2. | New |
| `action-surge` | Spend charge. **"Extra action" requires action economy (deferred)** — Phase 5 only tracks the spend; the mechanical extra-action is deferred to §10. | Partial |
| `hellish-rebuke` | Cast hellish rebuke as a reaction (1st-level spell effect, fire damage on attacker). Self-contained. | New |

**Explicitly excluded from Phase 5 (own phases):**
- `sorcery-points` / Metamagic → Phase 7 (subsystem).
- `wild-shape` → Phase 8 (subsystem).
- `arcane-recovery` → **exempt**: already has a dedicated modal + `travelService.arcane_recovery()` path (AGENTS.md documents this deliberate bypass). Not migrated to the registry. The registry lookup simply no-ops it (existing modal handles it).
- `indomitable` → deferred to §10 (reaction-based, needs action economy).

**Acceptance criteria:**
- [ ] Monk can spend ki for Stunning Strike (target makes CON save or is stunned).
- [ ] Bard can grant a Bardic Inspiration die to an ally (die appears on ally's sheet).
- [ ] Cleric can use Channel Divinity: Turn Undead (CR-based destruction).
- [ ] Tiefling can cast hellish rebuke (1/LR, reaction, fire damage).
- [ ] Adding a new spendable resource = one handler in `resourceHandlers.ts`, zero changes to `spellcastingService.ts`.
- [ ] All existing resource tests pass.

**Prompt sync:** update the Monk ki instruction (`toolModePrompt.ts:83`) — remove "level-1 monk has not yet learned ki" workaround for L2+ monks (ki now spends mechanically). Update instructions for Stunning Strike, Bardic Inspiration, Channel Divinity to use the tools.

---

### Phase 6: Character creation pipeline (Days 20-22)

**Goal:** make character creation actually apply racial traits, languages, proficiencies, and domain spells from catalog data.

**Modified files:**
- `services/characterCreationService.ts` — `buildCharacterFromWizard`: add an `applyEffects(char, 'onCharacterCreated', ctx)` call that processes `onCharacterCreated`-hook effects.
- `types/character.ts` — add `languages?: string[]` field (currently absent).
- `data/races.ts` — ensure all races declare `languages` (Human/Half-Elf resolve the `'one-of-choice'` sentinel).
- `data/classes.ts` — add `domain-spells` data for Cleric domains and Paladin oaths (auto-prepared spell lists).

**Features applied at creation:**
1. **Languages** — populate `Character.languages` from `raceDef.languages`; resolve `'one-of-choice'` to a prompt-free default (Common) with a note for the LLM to offer the choice.
2. **Racial skill proficiencies** — auto-add Perception for Elves (Keen Senses), 2 skills for Half-Elves (Skill Versatility). Read from a new `skill-proficiency` effect kind on racial traits.
3. **Racial weapon/armor proficiencies** — Dwarven Combat Training (battleaxe, handaxe, light hammer, warhammer), Dwarven Armor Training (light + medium armor).
4. **Domain/oath spells** — Cleric domain spells and Paladin oath spells auto-added to `preparedSpells`/`knownSpells`.
5. **Racial spell-like abilities** — Tiefling Infernal Legacy: auto-learn thaumaturgy (L1), hellish rebuke resource (L3), darkness (L5). Level-gated.

**Acceptance criteria:**
- [ ] Elf character has Perception proficiency auto-added.
- [ ] Half-Elf character has 2 additional skill proficiencies.
- [ ] Tiefling L1 knows thaumaturgy; L3 has hellish-rebuke resource; L5 knows darkness.
- [ ] Dwarf has battleaxe/handaxe/light hammer/warhammer proficiency.
- [ ] All characters have `languages` populated (at minimum Common + racial).
- [ ] Cleric (Life Domain) has Bless, Cure Wounds, etc. auto-prepared.
- [ ] Existing creation tests pass (with updated assertions for the new fields).

**Backfill (§2.1):** a separate opt-in `backfillCharacterFromCatalogs(char)` function that GMs can invoke via the auditor/debug panel to populate missing `languages`, racial proficiencies, and domain spells on existing characters. Never auto-run on load.

**Prompt sync:** none (creation is deterministic, not LLM-driven).

---

### Phase 7: Subclass feature effects (Days 23-25)

**Goal:** wire subclass-specific effects that use standard effect kinds through the dispatcher.

**Modified files:**
- `data/classes.ts` — add effect payloads to subclass features (currently most are bare `kind: 'passive'`).
- `services/effectDispatcher.ts` — any new effect kinds needed (e.g. `healing-bonus`, `damage-bonus` for Elemental Affinity).

**Subclass features implemented:**

| Class | Subclass | Feature | Effect kind | Notes |
|---|---|---|---|---|
| Cleric | Life Domain | Disciple of Life | `healing-bonus` | +2 + spell level to healing spells |
| Cleric | Life Domain | Blessed Healer | `healing-bonus` | self-heal on casting healing |
| Cleric | Life Domain | Divine Strike | `damage-bonus` | +1d8 radiant on weapon hit L8+ |
| Sorcerer | Draconic | Elemental Affinity | `damage-bonus` | +CHA mod to matching ancestry damage type |
| Wizard | Evocation | Empowered Evocation | `damage-bonus` | +INT mod to evocation cantrips L10+ |
| Paladin | Oath of Devotion | Sacred Weapon | `attack-bonus` | CHA mod to attack rolls (as action, concentration) |
| Paladin | Devotion | Aura of Devotion | `condition-immunity` | charm immunity within 10ft L7+ (L18: 30ft) |
| Barbarian | Berserker | Mindless Rage | `condition-immunity` | charm/frightened immunity while raging L6+ |

**Explicitly deferred** (complex, action-economy-dependent, or subsystem-level): Sculpt Spells (requires spell-friendly-fire tracking), Supreme Healing (maximize dice — needs a `maximize-healing` hook in the heal pipeline), Cutting Words (reaction).

**Acceptance criteria:**
- [ ] Life Domain Cleric adds +2 + spell level to all healing spells.
- [ ] Draconic Sorcerer adds CHA mod to damage of their ancestry type.
- [ ] Empowered Evocation Wizard adds INT mod to evocation cantrip damage.
- [ ] Aura of Devotion Paladin grants charm immunity (populates `conditionsImmunities`).
- [ ] All existing tests pass.

**Prompt sync:** update class-feature narration instructions to note these are now mechanical.

---

### Phase 8: Metamagic subsystem (Days 26-29)

**Goal:** Sorcery points become spendable; the 8 metamagic options modify `cast_spell`.

> **Standalone phase** — Metamagic is a subsystem, not a single feature. It modifies how spellcasting works, so it must touch `cast_spell` itself.

**Modified files:**
- `services/mcp/spellcastingService.ts` — `cast_spell`: add a `metamagic?: { option: string; targets?: string[] }` arg; apply the metamagic modification.
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

**Prompt sync:** add Metamagic instructions to `toolModePrompt.ts` (how to invoke via the `metamagic` param). Add a Quick Action button in `InputArea` for Sorcerers.

---

### Phase 9: Wild Shape subsystem (Days 30-33)

**Goal:** reconcile the disconnected `polymorph_creature` tool with the wild-shape resource pool — the #1 Druid bug.

**Modified files:**
- `services/mcp/mcpService.ts` — `polymorph_creature`: when the caster is a Druid, route through `wild-shape` resource spend (consume a charge), enforce CR limits, use `createWildShapeState` instead of `applyPolymorph`.
- `services/resourceHandlers.ts` — `wild-shape` handler: validate CR (druid_level / 3, no flying before L8, no swimming before L4), consume charge, delegate to transformation engine.
- `services/transformationEngine.ts` — ensure `createWildShapeState` enforces the CR + fly + swim gating.
- `data/beastForms.ts` (or existing) — tag each beast form with CR + swim/fly flags for filtering.

**Acceptance criteria:**
- [ ] Druid can Wild Shape (consumes a charge from the `wild-shape` pool).
- [ ] CR limit enforced (CR ≤ druid_level / 3, min ¼).
- [ ] No flying forms before L8; no swimming forms before L4.
- [ ] Wild Shape HP is temporary (reverts on dropping to 0 or on duration end).
- [ ] L20 Druid has unlimited Wild Shape (pool max = ∞).
- [ ] Non-Druid `polymorph_creature` still works (does not consume wild-shape).
- [ ] All existing transformation tests pass.

**Prompt sync:** update Druid instructions — Wild Shape now consumes charges mechanically; the LLM should use `polymorph_creature` for Wild Shape (the engine auto-detects Druid class and routes correctly).

---

### Phase 10: Testing, polish & documentation (Days 34-36)

**Tasks:**
1. Full test suite run — zero regressions.
2. Edge-case sweep: effect stacking (verify §2.2 rules), effect conflicts (multiple AC formulas), temporary effects, effect removal (concentration break).
3. Performance profiling — verify `getEffects` is sub-millisecond per call (§2.3); add WeakMap cache if needed.
4. Documentation: update `AGENTS.md` (new effect-dispatcher section, correct stale claims like "no monk ki pool"), `ARCHITECTURE.md` (dispatcher in the service diagram), `README.md` if it references class/race mechanics.
5. Correct stale doc claims discovered during this refactor: AGENTS.md "there is no monk ki pool in `recalculateResourcePools` yet" (the pool exists; the spend was missing).

**Acceptance criteria:**
- [ ] All unit + integration tests pass.
- [ ] No performance regression (>50ms added per tool call).
- [ ] `AGENTS.md`, `ARCHITECTURE.md` updated.
- [ ] `WorkingVsBroken.md` reassessment: re-tier the classes/races with their new status.

---

## 5. Cross-cutting subsystem notes

### 5.1 Bardic Inspiration (cross-character deferred effect)

Bardic Inspiration does not fit the "spend now, effect now" model — the Bard grants a die to an ally, and the ally later rolls it on their own roll. Design:

- New field on `Character`: `inspirationDice?: Array<{ sourceCharId: string; dieSize: number }>` — dice granted TO this character.
- `use_resource('bardic-inspiration', { targetId })` creates an entry on the target's `inspirationDice`.
- A new hook `onAnyRoll` (or extend `onAttackRoll`/`onSaveRoll`/`onSkillCheck`) checks for available inspiration dice and offers them. The consuming character (or LLM) chooses to add the die; on use, the entry is removed.
- Die size scales by Bard level: d6 → d8 (L5) → d10 (L10) → d12 (L15).
- UI: a Bardic Inspiration die chip on the target's sheet; a "use inspiration" option in the roll-resolution flow.

This is scoped within Phase 5 but flagged as the most complex handler.

### 5.2 Divine Smite (spell-slot-consuming feature, not a pool)

Divine Smite is not a resource pool — it expends a spell slot on a melee hit. Two implementation options:

**Option A (preferred):** a `player_attack` arg `divineSmite?: { slotLevel: number }`. When present, the attack expends the slot and adds `1d8 + slotLevel`d8 radiant damage (capped 5d8 + 1d8 vs undead/fiends). Self-contained in `player_attack`.

**Option B:** a separate `divine_smite` tool called after `player_attack` — rejected (violates the "never split damage across calls" rule in AGENTS.md).

Option A requires a `player_attack` schema change (Phase 3 or 6). Listed in Phase 6 acceptance criteria.

---

## 6. File Change Summary

### New files (5)
| File | Purpose |
|------|---------|
| `services/effectDispatcher.ts` | Core dispatcher: `applyEffects`, `getEffects`, `HOOK_REGISTRY`, hook types |
| `services/effectDispatcher.test.ts` | Unit tests |
| `services/resourceHandlers.ts` | Resource spend-handler registry |
| `tests/services/effectDispatcher.integration.test.ts` | Integration tests across hooks |
| `tests/services/resourceHandlers.test.ts` | Resource handler tests |

### Modified files
| File | Phases | Changes |
|------|--------|---------|
| `types/character.ts` | 0, 6 | `EffectKind` union; `languages?` field; `inspirationDice?` field |
| `data/classes.ts` | 0, 3, 5, 7, 8 | Data fixes; add `damage-bonus`/`crit-range`/`healing-bonus`/`metamagic-option` effect payloads; domain spells |
| `data/races.ts` | 0, 6 | Data fixes (`dieSize`, `hellish-rebellion`); `languages`; `skill-proficiency` effects; Tiefling spell gating |
| `data/feats.ts` | 0 | Unify to `effect: { kind, payload }` shape |
| `services/classEngine.ts` | 1, 4 | `calculateAc`/`calculateSpeed`/`getSavingThrowBonus` route through dispatcher |
| `services/mcp/combatService.ts` | 2, 3, 4 | `player_attack` + `make_save` integrate dispatcher hooks |
| `services/mcp/spellcastingService.ts` | 2, 5, 8 | `use_resource` → registry; `cast_spell` metamagic arg |
| `services/inventoryEngine.ts` | 2 | `inflictDamageOnTarget` player branch → `onDamageTaken` |
| `services/mcp/inventoryService.ts` | 2 | `inflict_damage` MCP bridge to `inflictDamageOnTarget` |
| `services/conditionEngine.ts` | 4 | `applyCondition` reads dispatcher-populated immunities |
| `services/characterCreationService.ts` | 6 | `onCharacterCreated` hook; languages, profs, domain spells |
| `services/mcp/mcpService.ts` | 9 | `polymorph_creature` wild-shape routing |
| `services/transformationEngine.ts` | 9 | `createWildShapeState` CR/fly/swim gating |
| `services/featsService.ts` | 0, 1 | Route through dispatcher |
| `services/llm/prompts/toolModePrompt.ts` | 2, 3, 4, 5, 8, 9 | Prompt sync per phase (stop narrating now-mechanical effects) |
| `services/llm/tools/spells.ts` | 8 | `cast_spell` metamagic param |
| `services/llm/tools/combat.ts` | 6 | `player_attack` divine-smite param |

### UI changes (revised — UI work IS expected)
| Component | Phase | Change |
|---|---|---|
| `InputArea.tsx` | 5, 8 | Quick Action buttons for Bardic Inspiration, Metamagic |
| `CharacterSheet.tsx` | 5 | Bardic Inspiration die chip display |
| `SpellbookModal` / new modal | 9 | Wild Shape beast-form picker (mirrors Arcane Recovery modal pattern) |

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `calculateAc` migration breaks existing AC values | Medium | High | Exhaustive byte-identical comparison tests for all class/race/armor combos before merge; Phase 1 is data-routing-only (no formula changes) |
| Dual damage pipeline diverges again | Medium | High | Phase 2 bridges the MCP tool to the pure function; full consolidation is a documented follow-up |
| LLM double-applies now-mechanical effects | High | Medium | Prompt sync is an explicit sub-task of every mechanical phase; each phase's tests include a prompt-assertion check |
| Effect stacking bugs | Medium | Medium | Stacking rules defined up-front (§2.2); reducer tests cover multi-source scenarios |
| Bardic Inspiration cross-character complexity | Medium | Medium | Scoped as the most complex Phase 5 handler; dedicated integration tests |
| Performance regression from dispatcher overhead | Low | Medium | Profile in Phase 10; WeakMap cache design ready (§2.3) if needed |
| Wild Shape reconciliation breaks non-druid polymorph | Medium | Medium | `polymorph_creature` branches on Druid class; non-Druid path preserved byte-identical |
| Metamagic `cast_spell` changes break non-sorcerer casting | Low | High | `metamagic` param is optional; absent = byte-identical path |

---

## 8. Success Metrics

| Metric | Current (verified) | Target |
|--------|---------|--------|
| Class/race effect kinds read by engine | 3 of 16 (1 mechanical) | 16 of 16 |
| Feat effect kinds read via payload | 1 of 22 | 22 of 22 |
| Hardcoded class-ID branches in `classEngine.ts` | 10+ | 0 (all via dispatcher) |
| Resource IDs with mechanical `use_resource` effects | 4 of 14 | 12 of 14 (2 deferred: `indomitable`, `arcane-recovery` exempt) |
| Classes with working core features | 5 of 12 | 11 of 12 (Monk Flurry deferred to action-economy phase) |
| Races with working signature features | 4 of 9 | 9 of 9 |
| Damage pipeline paths applying player resistances | 0 of 2 | 2 of 2 |

---

## 9. Out of Scope

Explicitly **not** part of this refactor (follow-ups after the dispatcher lands):

1. **Action economy system** (§10) — bonus-action counter, per-turn attack counter, general reaction gate. Precondition for Extra Attack, Flurry of Blows, Action Surge's extra-action, Indomitable's save-reroll, Cunning Action, Uncanny Dodge. The dispatcher's hook design (`onTurnStart`, `onActionDeclared`) is ready to receive this.
2. **Subraces** — High/Wood/Dark elf, Hill/Mountain dwarf, etc. Trivially additive once the dispatcher exists (subraces = race variants with extra traits), but a separate data + UI effort.
3. **New classes or races** — this refactor fixes existing ones.
4. **VTT battle map changes** — grid movement, token placement (unrelated).
5. **Multiplayer sync changes** — the dispatcher is local-state only; no sync implications.
6. **Save file migration** — per the backward-compat policy (§2.1), existing saves are not migrated; per-roll effects apply immediately, stored derivations follow new-characters-only.

---

## 10. Deferred: Action Economy System (follow-up)

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

**Estimated:** 5-7 days after Phase 10. Separate plan.

---

## 11. Post-Implementation Follow-Ups

After this refactor + the action-economy follow-up:

1. **Subrace system** — subraces as race variants with additional traits (pure data).
2. **Missing subclasses** — Battle Master, Totem Warrior, Moon Druid, Hexblade, Vengeance Paladin, Arcane Trickster, Wild Magic Sorcerer (pure data once their effect kinds exist).
3. **Feat expansion** — Lucky, War Caster, Sentinel, Polearm Master, Crossbow Expert, Sharpshooter (Sharpshooter's -5/+10 is already mechanical via the `sharpshooter` arg; the feat's other benefits would be data-driven).
4. **Magic items** — items define effects the dispatcher applies (a `flaming` weapon adds `damage-bonus`).
5. **Conditions as effects** — refactor `ActiveCondition` to use the same dispatcher for condition-applied effects (poisoned → disadvantage on attacks via `onAttackRoll`).

---

## 12. Appendix: Effect Kind Reference

### 12.1 Class/Race effect kinds (post-unification)

| Effect kind | Payload shape | Sources | Phase wired |
|---|---|---|---|
| `ac-formula` | `{ formula: string }` | Barbarian, Monk, Sorcerer (Draconic) | 0 (merge), 1 (wire) |
| `speed-bonus` | `{ bonus: number; condition?: string }` | Barbarian, Monk, Mobile feat, Athlete feat | 1 |
| `damage-resistance` | `{ type: string }` | Dwarf, Tiefling, Dragonborn, Barbarian (raging) | 2 |
| `damage-immunity` | `{ type: string }` | (future) | 2 |
| `damage-vulnerability` | `{ type: string }` | (future) | 2 |
| `advantage-on-save` | `{ against: string; stat?: string }` | Gnome, Halfling, Elf, Half-Elf, Barbarian, Dwarf | 4 |
| `condition-immunity` | `{ condition: string }` | Paladin, Barbarian (Berserker), Monk (future) | 4 |
| `crit-bonus-dice` | `{ count: number }` | Barbarian, Half-Orc | 3 |
| `crit-range` | `{ min: number }` | Fighter (Champion) | 3 |
| `reroll-ones` | `{ scope: string }` | Halfling | 3 |
| `damage-bonus` | `{ amount: string; condition?: string; types?: string[] }` | Barbarian (rage), Sorcerer (Elemental Affinity), Cleric (Divine Strike) | 3, 7 |
| `sneak-attack` | `{ extraDiceAtLevel: Record<number, number> }` | Rogue | 3 |
| `healing-bonus` | `{ amount: string }` | Cleric (Life Domain) | 7 |
| `attack-bonus` | `{ amount: string }` | Paladin (Sacred Weapon) | 7 |
| `weapon-damage-extra-die` | — | **Deprecated** — merged into `crit-bonus-dice` in Phase 0 | 0 |
| `unarmored-defense-13-dex` | — | **Deprecated** — merged into `ac-formula` in Phase 0 | 0 |
| `reckless-attack` | `{ }` | Barbarian | Deferred (action economy) |
| `extra-attack` | `{ count: number }` | Fighter, Barbarian, Monk, Paladin, Ranger | Deferred (action economy) |
| `pact-magic` | `{ }` | Warlock | N/A (already wired by class-ID; data marker only) |
| `spellcasting` | `{ }` | All casters | N/A (caster detection via `classDef.spellcasting`) |

### 12.2 Feat effect kinds (post-unification, Phase 0)

All 22 migrate from flat `effectPayload` to `effect: { kind, payload }`. Key ones:

| Effect kind | Feats | Wired in phase |
|---|---|---|
| `speed-bonus` | Mobile, Athlete | 1 |
| `gwf-reroll` | Great Weapon Fighting | (already mechanical via `hasFeat`; migrate to dispatcher in Phase 3) |
| `offhand-modifier` | Two-Weapon Fighting | 3 |
| `damage-reduction` | Heavy Armor Master | (already mechanical; migrate in Phase 2) |
| `save-proficiency` | Resilient | 4 |
| `shield-bonus-to-save` | Shield Master | 4 |
| `hp-per-level` | Tough | (already mechanical in `calculateMaxHp`; migrate to dispatcher) |
| `initiative-bonus` | Alert | (future — initiative not yet modeled) |
| `dual-wielder-ac` | Dual Wielder | (already mechanical; migrate to `computeAc`) |

---

## Sign-Off

Before implementation begins, confirm:

1. **Key Design Decisions (§2)** — especially the backward-compatibility policy (§2.1), stacking rules (§2.2), and action-economy deferral (§2.5).
2. **Phase breakdown** — the 10-phase + 1-deferred structure, with Metamagic and Wild Shape as standalone phases.
3. **Dual damage pipeline** — the bridge approach (§3.5).
4. **Scope** — what's in (mechanical fixes via dispatcher) and out (action economy, subraces, new content).

Once approved, implementation proceeds on `feature/effect-dispatcher`, Phase 0 first.
