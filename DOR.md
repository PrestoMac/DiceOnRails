# Dice on Rails — Reboot Blueprint v2

> **Version:** 2.0 (Architecturally Revised)  
> **Status:** Approved for execution  
> **Last updated:** 2025

## Executive Summary

Dice on Rails is a **universal AI-driven dice-engine platform**. It is not just a D&D 5e game — it is a modular engine capable of running any dice-based tabletop RPG (5e, Pathfinder, Call of Cthulhu, Shadowrun, etc.) with an AI Game Master as a first-class citizen.

This document is the complete architectural blueprint for rebooting the existing Dice on Rails codebase into this universal platform. The 5e system is the **first module** — not the only product.

### Core Insight

Every dice-based tabletop RPG shares the same fundamental operation:

```
value = base_number folded through modifiers at an event point
```

The **Effect Dispatcher** (the "spine") is the universal mechanism that performs this fold. Everything else — dice, classes, conditions, AI — hangs off it.

### Viability Assessment

| Subsystem | Viability | Risk |
|---|---|---|
| **Kernel Store & Schema** | High | Cyclical derived data dependencies; schema migration friction |
| **Effect Dispatcher** | Medium (revised to multi-phase) | Single-pass cannot handle reactions/interrupts; fixed in v2 |
| **Dice Families** | High | Post-roll luck expenditure needs meta-currency hooks |
| **AI Cognition Layer** | Medium (revised to static verbs) | Dynamic tool generation breaks prompt caching; fixed in v2 |
| **System Module SDK** | High | Requires strict runtime validation contracts |

---

## Design Principles

1. **The dispatcher is the spine.** Every numeric outcome in any dice game is "a value folded through modifiers at an event point." Make that fold first-class and universal; everything else hangs off it.

2. **A game system is a data package, not code in the engine.** 5e, Pathfinder, CoC, Shadowrun, FATE are each a directory of schema + catalogs + rules + prompt fragments. The kernel knows zero game specifics.

3. **AI is an actor, not a special case.** Human input and LLM input pass through the *same* action API. The AI's tools are **static universal verbs** with system-specific payload schemas — preserving prompt caching and controlling token usage.

4. **Type safety by schema + codegen, not hard-coding.** Runtime is a property-bag; dev-time is fully typed via generated accessors from each system's schema.

5. **Determinism via injection.** RNG, time, persistence, and the LLM client are all injected ports. Core is pure functions → fully testable, fully replayable.

6. **Multi-phase execution.** The dispatcher runs in structured phases (Base → Modifiers → Derived → Async Yield) to support reactions, interrupts, and dependency-ordered evaluation.

---

## Locked Architectural Decisions

| Decision | Choice |
|---|---|
| Entity model | Schema + codegen (runtime property-bag, dev-time typed interfaces) |
| AI authority | Cooperative with rejection budgeting (max 2 retries, then fallback) |
| AI tool model | Static universal verbs with parametric payloads (preserves prompt caching) |
| Dice families v1 | d20, dice-pool, percentile, Fudge (4 `RollPolicy` implementations) |
| Dispatcher model | Multi-phase lifecycle with async yield windows for reactions |
| Stacking model | Typed multi-pass (Item/Status/Circumstance/Untyped categories) |
| Build path | Fresh engine in a monorepo; current app's 5e data + UI port over as first system module + host |
| Repo | Single pnpm workspace, one CI gate |
| Engine brand | **Dice on Rails** (the universal platform itself) |

---

## Monorepo Layout

```
dice-on-rails/                          # Project root
  packages/
    engine/         @dor/engine         Kernel: EntityStore • Multi-phase Dispatcher • Dice • RNG • Resources
                                        (pure, zero I/O, zero game knowledge)
    rules/          @dor/rules          Hooks • Sources (permanent/transient/equipment) •
                                        Reducers • Typed Stacking • Conditions • Abilities • TurnModel
    dice/           @dor/dice           Four v1 RollPolicy implementations:
                                        d20, pool, percentile, fudge
    cognition/      @dor/cognition      AI layer: Static Verb Dispatcher • ContextAssembler •
                                        PromptAssembler • Cooperative Authority with rejection budgeting
    system-sdk/     @dor/system-sdk     Schema format • Codegen • SystemLoader • CLI
                                        (validate / codegen / replay)
  systems/
    dnd5e/                              FIRST system module:
                                        schema + data + rules + prompt  ← ported from current data/*
    fate-lite/                          (Phase E) Second-system proof of universality
  apps/
    host/                               The playable game:
                                        React UI + persistence/realtime ports + adapters  ← ported from current app
  tests/
    fixtures/                           Deterministic replay scenarios (golden state per system)
```

---

## Layer Architecture

```
┌─ 7. HOST ─────────────────────────── web / desktop / server shell              │
├─ 6. TRANSPORT ────────────────────── persistence port + realtime sync          │
├─ 5. AI COGNITION ─────────────────── static verbs • context-gen • narration    │
├─ 4. ACTOR LAYER ──────────────────── HumanAdapter ⇄ ActionAPI ⇄ AgentAdapter   │
├─ 3. GAME SYSTEM PACKAGE ──────────── schema • data • rules • prompt  ← "mod"   │
├─ 2. RULES ENGINE ─────────────────── multi-phase hooks • typed stacking        │
└─ 1. KERNEL ───────────────────────── entity-store • event-bus • DISPATCHER     │
```

Only layers 1–2 are game-agnostic. Layer 3 is the swappable game. Layers 4–6 are game-agnostic services driven by layer 3's declarations.

---

## The Kernel (`@dor/engine`)

### Entity Store (Schema-Driven)

No hard-coded `Character`. An entity is:

```typescript
interface Entity {
  id: string;
  kind: string;                    // 'character' | 'enemy' | system-defined
  system: string;                  // which system package owns this schema
  props: Record<string, unknown>;  // schema-defined properties
  collections: Record<string, unknown[]>;  // inventory, conditions, resources
}

interface EntityStore {
  get(id: string): Entity | undefined;
  query(predicate: (e: Entity) => boolean): Entity[];
  mutate(id: string, fn: (e: Entity) => void): void;  // transactional
}
```

Each system declares a **schema** (JSON Schema + custom annotations); a codegen step emits typed `Character`, `Enemy`, `Item` interfaces for that system. At runtime it's a property bag; at dev-time it's fully typed.

**Derived values are never stored.** AC, max HP, initiative, spell DC — always computed via `resolve()`.

### Multi-Phase Dispatcher (The Spine, v2)

The single universal operation, now with structured phases:

```typescript
type HookName = string;  // base set + system-registered

interface HookContext {
  readonly _hook: HookName;
  readonly _phase: 'base' | 'modifiers' | 'derived' | 'async_yield';
  [key: string]: unknown;
}

interface Modifier {
  kind: string;
  payload: Record<string, unknown>;
  stackGroup?: string;       // for stacking rules
  stackCategory?: 'item' | 'status' | 'circumstance' | 'untyped';  // typed stacking
  source: SourceRef;         // which source provider emitted this
}

interface SourceProvider {
  id: string;
  weight: number;            // ordering (permanent before transient)
  collect(entity: Entity, hook: HookName): Modifier[];
}

interface Reducer<C extends HookContext = HookContext> {
  kind: string;
  hook: HookName;
  phase: 'base' | 'modifiers' | 'derived';  // which phase this reducer runs in
  priority: number;          // lower runs first (multipliers before additives)
  reduce(ctx: C, modifier: Modifier, entity: Entity): C;
}

// THE universal fold — now multi-phase
function resolve(
  store: EntityStore,
  entity: Entity,
  hook: HookName,
  ctx: HookContext
): typeof ctx;
```

#### Execution Lifecycle

```
Phase 1: Base Initialization    ──► Prepares raw entity properties (prepareBaseData)
                                           │
                                           ▼
Phase 2: Modifier Resolution    ──► Evaluates active effects across category tiers
                                           │  (Item → Status → Circumstance → Untyped)
                                           ▼
Phase 3: Derived Computation    ──► Calculates final AC, Save DCs, stats (prepareDerivedData)
                                           │
                                           ▼
Phase 4: Async Yield Window     ──► Pauses execution for reaction interrupt queries
                                           │  (Shield, Counterspell, Uncanny Dodge)
                                           ▼
                                    Evaluated Derived Context
```

**Why multi-phase:**
- Prevents cyclical evaluation dependencies
- Creates reliable windows for asynchronous reaction handling
- Enables typed stacking (Item bonuses don't stack with Item bonuses, but stack with Status bonuses)
- Supports control-flow overrides (e.g., Reliable Talent replacing a die result, not adding to it)

### Dependency-Tracked Reactive Caching

Because derived values are calculated on-demand via functional folds, repeated `resolve()` calls create performance bottlenecks. The engine incorporates a dirty-flag dependency graph:

```typescript
interface DependencyGraph {
  // Maps computed property → set of modifier sources it depends on
  dependencies: Map<string, Set<string>>;
  // Maps modifier source → set of computed properties that become dirty when it changes
  reverseDeps: Map<string, Set<string>>;
  
  markDirty(sourceId: string): void;  // Flag downstream properties as stale
  isDirty(propertyId: string): boolean;
  clearDirty(propertyId: string): void;
}
```

1. Each entity maintains a dependency map linking computed properties to active modifier sources.
2. When a modifier source changes (equipping armor, expiring condition), downstream calculated properties are flagged as dirty.
3. Subsequent `resolve()` calls return cached values unless flagged dirty.

### Dice Engine: Expression + Policy

A roll is `RollSpec { expression, policy, modifiers }`. The *expression* says what dice; the *policy* says how to interpret them. One abstraction covers every system:

| System | Expression | Policy |
|---|---|---|
| D&D 5e | `1d20` | `keep-higher` (advantage) / `keep-lower` (disadvantage), crit on nat 20 |
| Shadowrun | `12d6` | `count-hits(≥5)` + `exploding(6)` (rule of six) |
| Call of Cthulhu | `1d100` | `target-threshold(skill)`, fumble ≥96, crit ≤5 |
| FATE | `4dF` | `sum` (Fudge dice, range −4..+4) |
| Pathfinder 2e | `1d20` | `degrees-of-success` (4 tiers by ±10) |

```typescript
interface RNG {
  roll(sides: number): number;  // injected (cryptoRoll default)
}

interface RollSpec {
  expression: string;
  policy: string;
  modifiers?: RollModifier[];
}

interface RollResult {
  value: number;
  dice: number[];
  meta: Record<string, unknown>;
}

interface RollPolicy {
  id: string;
  roll(spec: RollSpec, rng: RNG): RollResult;
}
```

### Resources

A `ResourcePool` — HP, hit dice, spell slots, ki, sanity, luck, edge — all the same primitive:

```typescript
interface ResourcePool {
  id: string;
  current: number;
  max: number;
  resetOn: 'turn' | 'round' | 'short' | 'long' | 'scene' | 'session';
}
```

Systems define which pools exist; the engine handles reset bookkeeping generically.

---

## The Rules Engine (`@dor/rules`)

### Base Hooks

| Hook | Context | Purpose |
|---|---|---|
| `computeAc` | `{ baseAc, character, equippedArmor }` | Armor Class calculation |
| `computeSpeed` | `{ speed, character }` | Movement speed |
| `computeMaxHp` | `{ hp, character }` | Maximum hit points |
| `computeAttackCount` | `{ count, character, weapon }` | Extra Attack |
| `onAttackRoll` | `{ roll, character, weapon, target, isRanged }` | Attack roll resolution |
| `onAttackDamage` | `{ damage, character, weapon, isCrit, isRanged }` | Damage calculation |
| `onDamageTaken` | `{ amount, damageType, target, source }` | Damage application (resistance/immunity) |
| `onSaveRoll` | `{ roll, stat, character, source }` | Saving throw |
| `onSkillCheck` | `{ roll, skill, character }` | Skill check |
| `onHeal` | `{ amount, target, source, spellLevel }` | Healing |
| `onCastSpell` | `{ character, spellDef, slotLevel, damageDealt }` | Spell casting |
| `onInitiative` | `{ roll, character }` | Initiative |
| `onDeathSave` | `{ roll, character, isSuccess }` | Death saving throw |
| `onTurnStart` | `{ character }` | Turn start (auras, rage-end) |
| `onTurnEnd` | `{ character }` | Turn end |
| `onRoundEnd` | `{}` | Round end |
| `onReactionTrigger` | `{ trigger, character, source }` | Reaction interrupt window (NEW) |
| `onLongRest` | `{ character }` | Long rest |
| `onShortRest` | `{ character }` | Short rest |
| `onLevelUp` | `{ character, newLevel }` | Level up |

Systems may register additional hooks.

### Source Providers

| Provider | Emits | Examples |
|---|---|---|
| `permanent` | Race, class, subclass, feat, background effects | Elf darkvision, Fighter Extra Attack |
| `equipment` | Equipped item effects | Magic sword +1, armor |
| `transient` | Condition/buff effects (the keystone) | Rage, bless, haste, Bardic Inspiration die |
| `environment` | Area effects | Darkness, difficult terrain |

**Condition-as-effect-carrier** is the keystone pattern. `ActiveCondition` carries an optional `effects[]` field. When a condition is applied, its effects flow through the dispatcher automatically while active. This single mechanism fixes:

- **Rage** → condition carrying `damage-resistance{B/P/S}` + `damage-bonus{melee-str}` + `advantage-on-save{str}`
- **Bardic Inspiration** → condition on target with `granted-die` effect, consumed on next roll
- **Auras** → conditions re-applied to in-range allies each turn
- **Bless/Bane, Haste, etc.** → future spell effects

### Typed Multi-Pass Stacking Engine

The single-pass string-based stacking policy is upgraded to a multi-pass evaluation pipeline:

```
Typed Stacking Pipeline:

Collected Modifiers
         │
         ├──► Item Bonuses         ──► Select Highest Value (per stack group)
         ├──► Status Bonuses       ──► Select Highest Value (per stack group)
         ├──► Circumstance Bonuses ──► Select Highest Value (per stack group)
         └──► Untyped Bonuses      ──► Sum All Values
                                             │
                                             ▼
                                  Sum Active Category Values
```

```typescript
interface StackingPolicy {
  // Category-based stacking (Pathfinder 2e style)
  categories: ('item' | 'status' | 'circumstance' | 'untyped')[];
  // Per-category policy
  categoryPolicy: Record<string, 'replace' | 'sum' | 'highest'>;
  // Override rules (one modifier can upgrade/replace another)
  overrides?: Record<string, string[]>;
}
```

This multi-pass structure allows system modules to define precise modifier interaction rules without requiring custom kernel modifications.

### Abilities Registry

An `Ability` is a declarative descriptor for active/spendable actions:

```typescript
interface AbilityDescriptor {
  id: string;                    // 'breath-weapon', 'divine-smite', ...
  resourceId?: string;           // what it spends (validated upstream)
  cost?: number;
  targeting: 'self' | 'ally' | 'enemy' | 'aoe' | 'none';
  aoe?: {
    shape: 'cone' | 'line' | 'radius';
    range: number;
  };
  run(ctx, characterId, targetId?, amount?, opts?): Promise<MCPResponse>;
}
```

The engine executes AoE, multi-target, and multi-step flows generically — no per-ability engine code.

### Initiative / Turn Scheduler

Pluggable `TurnModel`:

| Model | System | Behavior |
|---|---|---|
| `CyclicModel` | D&D 5e, Pathfinder | d20+mod, one pass per round |
| `PassModel` | Shadowrun | Initiative score decrements, multiple passes |
| `PopcornModel` | FATE, Cortex | Current actor picks who goes next |
| `TickModel` | Exalted, RT | Action-cost on a time track |

The engine emits `onTurnStart`/`onTurnEnd`/`onRoundEnd` events; the dispatcher and conditions tick against them.

### Async Reaction Handling

The `onReactionTrigger` hook creates an interrupt window where reactions can be evaluated before the primary action resolves:

```typescript
interface ReactionWindow {
  trigger: string;              // 'attack_roll' | 'spell_cast' | 'damage_taken'
  source: EntityRef;            // Who triggered the reaction
  validReactions: AbilityDescriptor[];  // Reactions available to relevant entities
  timeout: number;              // Max time to wait for reaction decisions (ms)
}

// The dispatcher yields here, collects reaction decisions, then resumes
interface ReactionResult {
  reactions: Array<{ ability: string; actor: string; payload: unknown }>;
  resolved: boolean;
}
```

This enables:
- **Shield**: Cast after attack roll announced, modifying AC retroactively
- **Counterspell**: Cast when another entity begins casting, interrupting before resolution
- **Uncanny Dodge**: Activated upon taking damage to halve incoming total

---

## The Dice Families (`@dor/dice`)

### 1. D20 Policy

```typescript
interface D20PolicyOptions {
  critThreshold?: number;        // default 20 (Champion: 19)
  fumbleThreshold?: number;      // default 1
  advantagePolicy?: 'keep-higher' | 'keep-lower' | 'roll-once';
  degreesOfSuccess?: boolean;    // Pathfinder 2e ±10 thresholds
}
```

Handles: advantage/disadvantage, critical hits (configurable threshold), fumbles, degrees of success.

### 2. Dice Pool Policy

```typescript
interface PoolPolicyOptions {
  dieSides: number;              // default 6
  hitThreshold: number;          // default 5 (Shadowrun)
  explodingValue?: number;       // default 6 (rule of six)
  glitchDetection?: boolean;     // >half 1s = glitch
}
```

Handles: count-hits, exploding dice, glitch detection.

### 3. Percentile Policy

```typescript
interface PercentilePolicyOptions {
  difficulty?: 'regular' | 'hard' | 'extreme';  // target = skill, ½skill, ⅕skill
  fumbleThreshold?: number;      // default 96 (regular), 100 (hard/extreme)
  critThreshold?: number;        // default 5
}
```

Handles: target-threshold, degrees of success, fumbles, criticals.

### 4. Fudge Policy

```typescript
interface FudgePolicyOptions {
  diceCount: number;             // default 4
  ladder?: Record<number, string>;  // +4 "Legendary", +3 "Superb", ...
}
```

Handles: 4dF sum, ladder mapping.

---

## The AI Cognition Layer (`@dor/cognition`)

### Static Universal Verbs (v2 — fixes prompt caching)

Instead of generating dynamic tool schemas per entity, the AI layer exposes a small set of **static universal verbs** with system-specific payload schemas:

```typescript
// Always the same 4 top-level tools — preserves provider prompt caching
interface UniversalVerbs {
  // Primary action verb — handles combat, spells, skills, features
  act(verb: string, payload: Record<string, unknown>): Promise<ActionResult>;
  
  // Inspect entity state, inventory, environment
  query(aspect: string, filters?: Record<string, unknown>): Promise<QueryResult>;
  
  // Descriptive narrative and scene commentary
  narrate(text: string, tone?: string): Promise<void>;
  
  // Update initiative, turn phases, round states
  advance_turn(mode: string): Promise<TurnResult>;
}
```

System packages provide JSON Schema definitions for the `payload` object of the `act` verb. This stabilizes top-level API signatures, preserves edge prompt caching, and maintains high function-calling accuracy.

### Payload Schema Registry

```typescript
// System packages register payload schemas for each verb
interface PayloadSchema {
  verb: string;                    // 'attack', 'cast_spell', 'check_skill', etc.
  schema: JSONSchema;              // Valid payload shape
  description: string;             // What this verb does
}

// Example: 5e registers these verb schemas:
const DND5E_VERBS = [
  { verb: 'attack', schema: { type: 'object', properties: { weapon: ..., target: ... } } },
  { verb: 'cast_spell', schema: { type: 'object', properties: { spell: ..., slot: ..., targets: ... } } },
  { verb: 'check_skill', schema: { type: 'object', properties: { skill: ..., dc: ... } } },
  // ...
];
```

### Context Assembly

A `ContextAssembler` walks the entity store + active sources and emits a token-budgeted string. Per-system `prompt/*.md` fragments are injected. Derived values come from `resolve()` so the AI always sees truthful AC/DC/bonuses (no hallucination).

### Prompt Assembly

```
system-prompt = kernel-rules + system.prompt.system + system.prompt[mode] + actor-persona
```

The kernel supplies the universal contract ("use tools, don't narrate numbers you didn't roll, advance time only via tools"); the system package supplies game-specific GMing guidance.

### Cooperative Authority with Rejection Budgeting

| Engine Validates | AI Owns |
|---|---|
| Resources sufficient | Narrative tone |
| Target exists & is legal | Target selection rationale |
| Action economy slot available | Scene description |
| Prerequisites met | NPC behavior |
| **Numbers** (always engine-truthful) | **Prose** (always AI-generated) |

On violation, the engine returns a structured `Rejection { reason, hint }`. To prevent unbounded retry loops:

```typescript
interface RejectionBudget {
  maxRetries: number;            // Default: 2
  currentRetries: number;
  
  canRetry(): boolean;
  exhaust(): FallbackAction;     // Safe default (Dodge, Defend, etc.)
}

// In the agent loop:
if (!validation.isValid) {
  if (budget.canRetry()) {
    budget.currentRetries++;
    return { type: 'reject', reason: validation.error, hint: validation.hint };
  } else {
    return { type: 'fallback', action: budget.exhaust() };
  }
}
```

**Why this matters:**
- Prevents token starvation loops
- Prevents session execution lockup
- Ensures turn progression even with a confused LLM

---

## The System Package Format

A game system is a directory/package with a strict contract:

```
systems/<system-id>/
  manifest.json              id, name, version, depends-on
  schema/
    character.schema.json    → codegen → typed Character
    enemy.schema.json
    item.schema.json
  data/                      catalogs: classes, races, backgrounds, spells, monsters, items, feats
  rules/
    dice.ts                  RollPolicy config
    initiative.ts            TurnModel impl
    stacking.ts              Typed stacking policy (Item/Status/Circumstance/Untyped)
    reducers/                one file per effect family
    sources/                 condition catalog, aura definitions
    abilities/               active abilities (breath-weapon, divine-smite, ...)
    verbs.json               Payload schemas for static universal verbs
  prompt/
    system.md                "you are a 5e GM…" (system rules for the AI)
    combat.md                guidance for combat narration
    exploration.md           guidance for exploration
    tone.md                  narrative style guidance
    glossary.md              term definitions injected on demand
```

**The contract:** a loader reads `manifest.json`, registers schemas + reducers + sources + abilities + dice policy + initiative model + prompt fragments + verb schemas. The engine is ready. Swap the folder → different game. Multiple systems can coexist (a campaign picks one).

---

## The 5e System Module (`systems/dnd5e/`)

This is the first system module, ported from the current Dice on Rails `data/*` directory.

### What lives here (vs. engine code)

All "Effects 2.0" fixes become **5e-system data**, not engine code:

#### Reducers (`systems/dnd5e/rules/reducers/`)

| Reducer | Fixes |
|---|---|
| `extra-attack` | Fighter/Barbarian/Monk/Paladin/Ranger Extra Attack (engine-loop) |
| `reckless-attack` | Barbarian Reckless Attack |
| `fighting-style-archery` | +2 ranged attack |
| `fighting-style-dueling` | +2 one-handed damage |
| `fighting-style-defense` | +1 AC when armored |
| `fighting-style-protection` | Reaction disadvantage for adjacent ally |
| `healing-bonus` | Disciple of Life, Blessed Healer, Song of Rest |
| `evasion` | Rogue/Monk Evasion |
| `uncanny-dodge` | Rogue Uncanny Dodge |
| `crit-bonus-dice` (FIXED) | Barbarian Brutal Critical, Half-Orc Savage Attacks |
| `reliable-talent` | Rogue Reliable Talent (control-flow override, not additive) |

#### Conditions (`systems/dnd5e/rules/sources/`)

| Condition | Carries Effects |
|---|---|
| `rage` | `damage-resistance{B/P/S}`, `damage-bonus{melee-str}`, `advantage-on-save{str}` |
| `bardic-inspiration` | `granted-die` (consumed on next attack/save/skill) |
| `aura-of-protection` | `save-bonus` = CHA mod (applied to allies in range each turn) |
| `aura-of-courage` | `condition-immunity{frightened}` |
| `aura-of-devotion` | `condition-immunity{charmed}` |

#### Abilities (`systems/dnd5e/rules/abilities/`)

| Ability | What it does |
|---|---|
| `breath-weapon` | AoE: loops targets, rolls saves, applies damage |
| `divine-smite` | Slot-consuming extra radiant damage on hit |
| `wild-shape` | Links to polymorph flow, tracks form condition |
| `destroy-undead` | Radius auto-kill at CR limit |

#### Verb Schemas (`systems/dnd5e/rules/verbs.json`)

```json
{
  "verbs": [
    {
      "verb": "attack",
      "description": "Make a weapon or unarmed attack against a target",
      "schema": {
        "type": "object",
        "properties": {
          "attackerId": { "type": "string" },
          "weaponName": { "type": "string" },
          "targetId": { "type": "string" },
          "isOffHand": { "type": "boolean" },
          "divineSmite": {
            "type": "object",
            "properties": { "slotLevel": { "type": "integer" } }
          }
        },
        "required": ["attackerId", "weaponName", "targetId"]
      }
    },
    {
      "verb": "cast_spell",
      "description": "Cast a spell from your available spell slots",
      "schema": { ... }
    }
    // ...
  ]
}
```

### Result: Every class and race reaches full SRD fidelity

| Class/Race | Status After Reboot |
|---|---|
| **Wizard** | ✅ Full spellcasting, spellbook, ritual, Arcane Recovery |
| **Sorcerer** | ✅ Full casting + Sorcery Points + Metamagic (twinned/quickened/empowered) |
| **Fighter** | ✅ Extra Attack (engine-loop), Fighting Styles, Second Wind, Action Surge |
| **Cleric** | ✅ Full casting + Turn Undead + Disciple of Life + Channel Divinity |
| **Druid** | ✅ Full casting + Wild Shape (condition-linked) |
| **Paladin** | ✅ Lay on Hands + Divine Smite (slot consumed) + Auras |
| **Ranger** | ✅ Half casting + Hunter features + Extra Attack |
| **Rogue** | ✅ Sneak Attack (engine-validated trigger) + Expertise + Evasion + Reliable Talent |
| **Monk** | ✅ Martial Arts + Ki (all features wired) + Stunning Strike |
| **Warlock** | ✅ Pact Magic + Invocations + Mystic Arcanum |
| **Barbarian** | ✅ Rage (resistance applied) + Reckless Attack + Brutal Critical |
| **Bard** | ✅ Bardic Inspiration (die consumed) + Expertise + Jack of All Trades |
| **Elf** | ✅ Darkvision + Keen Senses + Fey Ancestry |
| **Dwarf** | ✅ Darkvision + Resilience + Stonecunning |
| **Halfling** | ✅ Lucky + Brave |
| **Gnome** | ✅ Darkvision + Gnome Cunning |
| **Half-Elf** | ✅ Flexible ASI + Fey Ancestry + Skill Versatility |
| **Half-Orc** | ✅ Relentless Endurance + Savage Attacks (FIXED) |
| **Tiefling** | ✅ Darkvision + Hellish Resistance + Infernal Legacy |
| **Dragonborn** | ✅ Draconic Ancestry + Resistance + Breath Weapon (FIXED) |
| **Human** | ✅ +1 all stats |

---

## The Host App (`apps/host/`)

The playable game. Ports the current React UI, Supabase persistence, audio/portrait/atmosphere layers.

### What stays (ported)

- React UI components (CharacterSheet, ChatLog, BattleMap, etc.)
- Supabase persistence + realtime sync
- Audio service
- Portrait generation
- Atmosphere overlay
- VTT battle map
- Multiplayer presence (typing indicators)

### What changes

| Current | Replaced By |
|---|---|
| `mcpService` + `effectDispatcher` + `conditionEngine` | `@dor/engine` + `@dor/rules` + `systems/dnd5e` |
| `agentLoop` + 27 hand-written tool schemas | `@dor/cognition` Static Verb Dispatcher |
| `data/classes.ts` etc. | `systems/dnd5e/data/` |
| `resourceHandlers` | `@dor/rules` ability registry |
| `recalculateResourcePools` | Kernel resource engine |
| `storageService`, Supabase channels | `@dor/host` ports (same transports) |

A thin `engineAdapter.ts` maps the existing `GameState` shape to the kernel `EntityStore`, so the UI migrates incrementally without a big-bang rewrite.

---

## Build Phases

### Phase A — Kernel + Rules + Dice (Universal Foundation)

**Scope:** `@dor/engine`, `@dor/rules`, `@dor/dice` (4 policies)

**Deliverables:**
- EntityStore with schema-driven property bags
- **Multi-phase dispatcher** with Base → Modifiers → Derived → Async Yield phases
- Dependency-tracked reactive caching (dirty-flag graph)
- Dice engine with 4 RollPolicy implementations
- Resource pool engine
- TurnModel interface + CyclicModel
- Typed stacking engine (Item/Status/Circumstance/Untyped)
- `onReactionTrigger` hook with reaction window support

**Gate:** Headless engine resolves a 5e combat from fixtures; deterministic replays pass; 1,000 parallel `resolve()` calls complete within performance budget.

**Tests:**
- Property tests with injected RNG
- Replay fixtures (golden state)
- Each dice policy: pure unit tests
- Multi-phase lifecycle verification
- Async reaction handling scenarios
- Performance benchmarking (1,000 parallel resolves)

---

### Phase B — System SDK + 5e System Module

**Scope:** `@dor/system-sdk`, `systems/dnd5e`

**Deliverables:**
- Schema format + validator
- Codegen (schema → typed TS interfaces)
- SystemLoader (reads manifest, registers everything)
- CLI: `dor validate-system`, `dor codegen`, `dor replay`
- Port `data/*` → `systems/dnd5e/data/`
- Register all reducers, abilities, conditions for 5e
- Define verb payload schemas (`systems/dnd5e/rules/verbs.json`)
- All "Effects 2.0" fixes live as 5e data

**Gate:** `dor validate-system dnd5e` green; codegen emits typed `Character`; all class/race fixes verified.

**Tests:**
- Schema validation tests
- Codegen output tests
- System package golden-state replays
- Complete SRD ruleset verification

---

### Phase C — Cognition (AI Layer)

**Scope:** `@dor/cognition`

**Deliverables:**
- Static Verb Dispatcher (4 universal verbs: act, query, narrate, advance_turn)
- Payload schema registry (system-provided verb schemas)
- ContextAssembler (token-budgeted state serialization)
- PromptAssembler (kernel + system + mode + persona)
- Cooperative authority with rejection budgeting (max 2 retries → fallback)
- Mock LLM test harness

**Gate:** Headless AI GM runs a full 5e turn via static verbs under cooperative authority with rejection budgeting enforced.

**Tests:**
- Mock-LLM tests on verb dispatch
- Context string assertions
- Agent loop scenario tests
- Rejection budget enforcement tests
- Prompt cache hit-rate verification

---

### Phase D — Host Integration

**Scope:** `apps/host`, adapters

**Deliverables:**
- engineAdapter (GameState ↔ EntityStore mapping)
- HumanAdapter (UI events → action intents)
- AgentAdapter (LLM tool calls → action intents)
- Persistence port (Supabase + local)
- Realtime port (presence/sync)
- Migrated React UI

**Gate:** Dice on Rails playable on the new engine — behaviorally equivalent to current + fully fixed classes/races.

**Tests:**
- Ported vitest suite (behavioral parity)
- UI integration tests
- Multiplayer sync tests

---

### Phase E — Second System Proof

**Scope:** `systems/fate-lite` (or CoC-lite)

**Deliverables:**
- Minimal second system package
- Demonstrates universality (same engine, different rules)

**Gate:** Two systems coexist on one engine → universality demonstrated.

**Why this matters:** One system is a refactor; two is a platform. Phase E is the credibility gate.

---

## System-by-System Universality Audit

| Game System | Primary Roll Paradigm | Modifier Model | Architecture Fit | Required Adaptations |
|---|---|---|---|---|
| **D&D 5e** | d20 + Mod vs AC/DC; Adv/Dis | Additive; Resistances/Vulnerabilities | Native (95%) | Primary design reference |
| **Pathfinder 2e** | d20 + Mod; 4 DoS tiers | Typed stacking (Status/Item/Circumstance) | High (85%) | Typed stacking engine (built in v2) |
| **Call of Cthulhu 7e** | d100 vs Skill; Hard/Extreme | Sanity tracking; Major Wounds | High (85%) | Sanity resource track |
| **Shadowrun 6e** | d6 pool vs Threshold; Exploding | Success counting; Glitch detection | Moderate (75%) | Physical/Stun damage tracks |
| **Fate Core** | 4dF sum vs Ladder | Aspects, Stress, Consequences | Low (40%) | Scalar dispatcher insufficient; needs narrative state machine |

**Note:** Fate Core's aspect-compel economy and consequence slots don't map cleanly to scalar folds. The engine can run Fate with a custom "narrative state" module, but full universality requires acknowledging this boundary.

---

## Testing Strategy

| Layer | Approach | Examples |
|---|---|---|
| **Kernel** | Property tests, injected RNG, replay fixtures | Same inputs → same outputs across runs |
| **Dice policies** | Pure unit tests, one per kind | d20 advantage, pool hit-count, percentile fumble |
| **Reducers** | Pure unit tests, one per effect kind | extra-attack count, damage-bonus, resistance |
| **System packages** | Golden-state turn replays → exact state-diff | Full 5e combat scenario |
| **Cognition** | Mock-LLM tests | Verb dispatch, context assembly, rejection budgeting |
| **Host** | Ported vitest suite | UI behavior, multiplayer sync |
| **Integration** | Headless scenarios per system | End-to-end turn resolution |
| **Performance** | Benchmark suite | 1,000 parallel `resolve()` calls |

---

## Risk Matrix

| Risk | Impact | Mitigation |
|---|---|---|
| Codegen friction | High | `dor codegen --watch`; schema is single source of truth |
| Dispatcher perf (fold on every roll) | Medium | Dependency-tracked reactive caching; dirty-flag graph |
| Over-abstraction | High | No kernel feature ships without Phase E's second system needing it |
| Cooperative-authority drift | Medium | One authoritative table per verb (engine validates / AI owns) |
| Big-bang risk | High | Strangler via adapter; current game stays playable through Phase D |
| Scope creep | Medium | Phase E enforces "does a second system need this?" |
| LLM rejection loops | Medium | Rejection budgeting (max 2 retries → fallback action) |
| Prompt cache misses | Medium | Static universal verbs (not dynamic per-entity schemas) |
| Async reaction complexity | High | Multi-phase lifecycle with explicit yield windows |

---

## Migration from Current Code

| Current File/Module | Becomes | Action |
|---|---|---|
| `services/effectDispatcher.ts` | `@dor/engine` dispatcher | Extract + generalize + add multi-phase + typed stacking |
| `services/conditionEngine.ts` | `@dor/rules` conditions | Finish as transient-source provider |
| `services/resourceHandlers.ts` | `@dor/rules` ability registry | Promote to declarative descriptors |
| `services/classEngine.ts` | `@dor/engine` resource engine | Generalize |
| `services/spellcastingEngine.ts` | `systems/dnd5e/rules/casting.ts` | Port as 5e plugin |
| `services/combatService.ts` | `@dor/rules` + `systems/dnd5e` | Split: generic combat → rules; 5e specifics → system |
| `services/llm/agentLoop.ts` | `@dor/cognition` Static Verb Dispatcher | Rewrite as universal loop with rejection budgeting |
| `services/llm/tools/*.ts` | Auto-generated verb schemas | Delete (replaced by static verbs + payload schemas) |
| `data/classes.ts` | `systems/dnd5e/data/classes.ts` | Port |
| `data/races.ts` | `systems/dnd5e/data/races.ts` | Port |
| `data/spells.ts` | `systems/dnd5e/data/spells.ts` | Port |
| `data/feats.ts` | `systems/dnd5e/data/feats.ts` | Port |
| `data/monsters.ts` | `systems/dnd5e/data/monsters.ts` | Port |
| React UI components | `apps/host/src/components/` | Port |
| `services/storageService.ts` | `@dor/host` persistence port | Port + adapt |
| `services/supabaseClient.ts` | `@dor/host` realtime port | Port + adapt |

**Discard (rebuilt clean, not migrated):**
- Inline class checks (`character.class === 'monk'`, etc.)
- `char.raging` boolean special-case
- `inspirationDice` array special-case
- Dead `crit-bonus-dice` reducer (replaced by fixed version)
- Hand-written tool schemas (replaced by static verbs + payload schemas)
- 5e-hardcoded agent loop

---

## Glossary

| Term | Definition |
|---|---|
| **Dispatcher** | The universal fold operation: `resolve(store, entity, hook, ctx)` |
| **Hook** | An event point in the engine lifecycle (onAttackRoll, computeAc, etc.) |
| **Source** | Anything that contributes modifiers (race, class, condition, equipment) |
| **Reducer** | A pure function that folds a modifier into a hook context |
| **Stacking** | Rules for how multiple modifiers combine (typed: Item/Status/Circumstance/Untyped) |
| **Condition** | A transient source with duration/tick/removal (the buff system) |
| **Ability** | An active/spendable action with targeting and effects |
| **RollPolicy** | How to interpret a dice expression (d20, pool, percentile, Fudge) |
| **TurnModel** | How initiative/order works (cyclic, pass, popcorn, tick) |
| **System Package** | A directory of schema + data + rules + prompt that defines one game |
| **Cooperative Authority** | Engine validates mechanics; AI owns narration; numbers engine-truthful |
| **Rejection Budgeting** | Max retries before fallback (prevents LLM infinite loops) |
| **Static Verbs** | Fixed top-level AI tools (act, query, narrate, advance_turn) with system payload schemas |
| **Multi-Phase Lifecycle** | Base → Modifiers → Derived → Async Yield execution phases |
| **Schema + Codegen** | Runtime property-bag, dev-time typed interfaces generated from schema |
| **Dependency Graph** | Dirty-flag caching for derived values |

---

## Appendices

### A. Multi-Phase Dispatcher Pseudocode

```typescript
async function resolve(store, entity, hook, initialCtx) {
  let ctx = { ...initialCtx, _phase: 'base' };
  
  // Phase 1: Base Initialization
  ctx = await executePhase(store, entity, hook, ctx, 'base', (c, mod) => {
    return getReducers(hook, mod.kind, 'base')
      .sort((a, b) => a.priority - b.priority)
      .reduce(c, (reducer) => reducer.reduce(c, mod, entity));
  });
  
  // Phase 2: Modifier Resolution (typed stacking)
  ctx._phase = 'modifiers';
  const modifiers = collectModifiers(store, entity, hook);
  
  // Multi-pass: Item → Status → Circumstance → Untyped
  for (const category of ['item', 'status', 'circumstance', 'untyped']) {
    const categoryMods = modifiers.filter(m => m.stackCategory === category);
    const stacked = applyStackingRules(categoryMods);
    for (const mod of stacked) {
      ctx = getReducers(hook, mod.kind, 'modifiers')
        .sort((a, b) => a.priority - b.priority)
        .reduce(ctx, (reducer) => reducer.reduce(ctx, mod, entity));
    }
  }
  
  // Phase 3: Derived Computation
  ctx._phase = 'derived';
  ctx = await executePhase(store, entity, hook, ctx, 'derived', /* same pattern */);
  
  // Phase 4: Async Yield Window (reactions)
  if (hasReactionTriggers(ctx)) {
    ctx._phase = 'async_yield';
    const reactionWindow = await openReactionWindow(store, entity, ctx);
    ctx.reactions = reactionWindow.results;
  }
  
  return ctx;
}
```

### B. Condition-as-Source Example (Rage)

```typescript
// When barbarian enters rage:
applyCondition(barbarian, {
  id: 'rage',
  source: barbarian.id,
  duration: null,  // lasts until conditions end it
  effects: [
    { kind: 'damage-resistance', payload: { type: 'bludgeoning' }, stackCategory: 'status' },
    { kind: 'damage-resistance', payload: { type: 'piercing' }, stackCategory: 'status' },
    { kind: 'damage-resistance', payload: { type: 'slashing' }, stackCategory: 'status' },
    { kind: 'damage-bonus', payload: { amount: '2', condition: 'melee-str' } },
    { kind: 'advantage-on-save', payload: { stat: 'str' } },
    { kind: 'advantage-on-save', payload: { stat: 'con' } },
  ]
});

// When rage ends (no attack/damage on turn):
removeCondition(barbarian, 'rage');
```

### C. Bardic Inspiration as Consumed Condition

```typescript
// When bard grants inspiration:
applyCondition(target, {
  id: 'bardic-inspiration',
  source: bard.id,
  duration: 10,  // 10 minutes
  durationUnit: 'minute',
  effects: [
    { kind: 'granted-die', payload: { dieSize: 8 } }
  ]
});

// The 'granted-die' reducer on onAttackRoll/onSaveRoll/onSkillCheck:
function reduce(ctx, modifier, character) {
  const inspiration = character.collections.conditions?.find(
    c => c.id === 'bardic-inspiration' && c.source === modifier.source
  );
  if (inspiration) {
    const dieSize = modifier.payload.dieSize;
    const bonus = cryptoRoll(dieSize);
    ctx.roll += bonus;
    ctx.inspirationBonus = bonus;
    removeCondition(character, 'bardic-inspiration');
  }
  return ctx;
}
```

### D. Extra Attack Engine-Loop

```typescript
async function player_attack(characterId, weaponName, targetId, opts) {
  const attacker = store.get(characterId);
  const target = store.get(targetId);

  // 1. Compute attack count via dispatcher
  const attackCtx = resolve(store, attacker, 'computeAttackCount', {
    _hook: 'computeAttackCount',
    _phase: 'base',
    count: 1,
    character: attacker,
    weaponName,
    isRanged: false,
  });
  const attackCount = attackCtx.count;

  // 2. Loop N times
  const results = [];
  for (let i = 0; i < attackCount; i++) {
    const result = await resolveSingleAttack(attacker, weaponName, target, opts);
    results.push(result);
  }

  // 3. Return all attacks
  return {
    success: true,
    data: { attacks: results },
    message: `${attacker.name} attacks ${target.name} ${attackCount} time(s)...`
  };
}
```

### E. Static Verb Schema Example

```json
{
  "verb": "act",
  "description": "Perform a game action",
  "payloadSchemas": {
    "attack": {
      "type": "object",
      "properties": {
        "attackerId": { "type": "string" },
        "weaponName": { "type": "string" },
        "targetId": { "type": "string" },
        "isOffHand": { "type": "boolean" },
        "divineSmite": {
          "type": "object",
          "properties": { "slotLevel": { "type": "integer", "minimum": 1, "maximum": 5 } }
        }
      },
      "required": ["attackerId", "weaponName", "targetId"]
    },
    "cast_spell": {
      "type": "object",
      "properties": {
        "casterId": { "type": "string" },
        "spellId": { "type": "string" },
        "slotLevel": { "type": "integer" },
        "targets": { "type": "array", "items": { "type": "string" } },
        "metamagic": {
          "type": "object",
          "properties": {
            "option": { "type": "string", "enum": ["twinned", "quickened", "empowered"] },
            "sorceryPointCost": { "type": "integer" }
          }
        }
      },
      "required": ["casterId", "spellId"]
    }
  }
}
```

---

## Next Steps

1. **Review this blueprint** with the team
2. **Confirm Phase A scope** (kernel + rules + dice)
3. **Scaffold the monorepo** (pnpm workspace, package structure)
4. **Implement Phase A** (multi-phase dispatcher spine + dice policies + typed stacking)
5. **Proceed through phases B–E**

The plan is complete and ready for execution.
