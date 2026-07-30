# Dice on Rails — Reboot Blueprint

> **Version:** 1.0  
> **Status:** Approved for execution  
> **Last updated:** 2025

## Executive Summary

Dice on Rails is a **universal AI-driven dice-engine platform**. It is not just a D&D 5e game — it is a modular engine capable of running any dice-based tabletop RPG (5e, Pathfinder, Call of Cthulhu, Shadowrun, FATE, etc.) with an AI Game Master as a first-class citizen.

This document is the complete architectural blueprint for rebooting the existing Dice on Rails codebase into this universal platform. The 5e system is the **first module** — not the only product.

### Core Insight

Every dice-based tabletop RPG shares the same fundamental operation:

```
value = base_number folded through modifiers at an event point
```

The **Effect Dispatcher** (the "spine") is the universal mechanism that performs this fold. Everything else — dice, classes, conditions, AI — hangs off it.

---

## Design Principles

1. **The dispatcher is the spine.** Every numeric outcome in any dice game is "a value folded through modifiers at an event point." Make that fold first-class and universal; everything else hangs off it.

2. **A game system is a data package, not code in the engine.** 5e, Pathfinder, CoC, Shadowrun, FATE are each a directory of schema + catalogs + rules + prompt fragments. The kernel knows zero game specifics.

3. **AI is an actor, not a special case.** Human input and LLM input pass through the *same* action API. The AI's tools, context, and prompt are **auto-generated from the registered system** — adding a system gives you a working AI GM for free.

4. **Type safety by schema + codegen, not hard-coding.** Runtime is a property-bag; dev-time is fully typed via generated accessors from each system's schema.

5. **Determinism via injection.** RNG, time, persistence, and the LLM client are all injected ports. Core is pure functions → fully testable, fully replayable.

---

## Locked Architectural Decisions

| Decision | Choice |
|---|---|
| Entity model | Schema + codegen (runtime property-bag, dev-time typed interfaces) |
| AI authority | Cooperative (engine validates mechanics + rejects with structured hints; AI owns narration/scene/NPC behavior; numbers always engine-truthful) |
| Dice families v1 | d20, dice-pool, percentile, Fudge (4 `RollPolicy` implementations) |
| Build path | Fresh engine in a monorepo; current app's 5e data + UI port over as first system module + host |
| Repo | Single pnpm workspace, one CI gate |
| Engine brand | **Dice on Rails** (the universal platform itself) |

---

## Monorepo Layout

```
dice-on-rails/                          # Project root
  packages/
    engine/         @dor/engine         Kernel: EntityStore • Dispatcher • Dice • RNG • Resources
                                        (pure, zero I/O, zero game knowledge)
    rules/          @dor/rules          Hooks • Sources (permanent/transient/equipment) •
                                        Reducers • Stacking • Conditions • Abilities • TurnModel
    dice/           @dor/dice           Four v1 RollPolicy implementations:
                                        d20, pool, percentile, fudge
    cognition/      @dor/cognition      AI layer: ToolGenerator • ContextAssembler •
                                        PromptAssembler • VerbDispatcher
                                        (one universal agent loop)
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
├─ 5. AI COGNITION ─────────────────── tool-gen • context-gen • narration        │
├─ 4. ACTOR LAYER ──────────────────── HumanAdapter ⇄ ActionAPI ⇄ AgentAdapter   │
├─ 3. GAME SYSTEM PACKAGE ──────────── schema • data • rules • prompt  ← "mod"   │
├─ 2. RULES ENGINE ─────────────────── hooks • sources • reducers • stacking     │
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

### The Dispatcher (The Spine)

The single universal operation:

```typescript
type HookName = string;  // base set + system-registered

interface HookContext {
  readonly _hook: HookName;
  [key: string]: unknown;
}

interface Modifier {
  kind: string;
  payload: Record<string, unknown>;
  stackGroup?: string;       // for stacking rules
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
  priority: number;          // lower runs first (multipliers before additives)
  reduce(ctx: C, modifier: Modifier, entity: Entity): C;
}

// THE universal fold
function resolve(
  store: EntityStore,
  entity: Entity,
  hook: HookName,
  ctx: HookContext
): typeof ctx;
```

How `resolve()` works:

```
resolve(store, entity, hook, ctx) =
  sources(entity, hook)                         // all active modifier sources, ordered
    .flatMap(mod => reducers(hook, mod.kind)
      .sortBy(priority)
      .map(r => r.reduce(ctx, mod, entity)))
    .applyStackingRules(ctx)                    // per stack-group policy
```

Three registries (pluggable): **sources**, **reducers**, **hooks**. A "game system" populates them. Nothing here knows what a "save" or a "wizard" is.

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
| `computeAttackCount` | `{ count, character, weapon }` | Extra Attack (NEW) |
| `onAttackRoll` | `{ roll, character, weapon, target, isRanged }` | Attack roll resolution |
| `onAttackDamage` | `{ damage, character, weapon, isCrit, isRanged }` | Damage calculation |
| `onDamageTaken` | `{ amount, damageType, target, source }` | Damage application (resistance/immunity) |
| `onSaveRoll` | `{ roll, stat, character, source }` | Saving throw |
| `onSkillCheck` | `{ roll, skill, character }` | Skill check |
| `onHeal` | `{ amount, target, source, spellLevel }` | Healing (NEW) |
| `onCastSpell` | `{ character, spellDef, slotLevel, damageDealt }` | Spell casting (NEW) |
| `onInitiative` | `{ roll, character }` | Initiative (NEW) |
| `onDeathSave` | `{ roll, character, isSuccess }` | Death saving throw (NEW) |
| `onTurnStart` | `{ character }` | Turn start (auras, rage-end) (NEW) |
| `onTurnEnd` | `{ character }` | Turn end |
| `onRoundEnd` | `{}` | Round end |
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

### Stacking Rules

Each modifier declares a `stackGroup`. A system-wide policy resolves same-group conflicts:

| Policy | Behavior | Example |
|---|---|---|
| `replace` | Highest wins | 5e same-source bonus |
| `sum` | Additive | Most damage types |
| `highest` | Keep highest | AC from different sources |
| `lowest` | Keep lowest | (rare) |
| `supertype-limits` | No two same-type | "no two competence bonuses" |

Configured per system, not engine code.

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

---

## The Dice Families (`@dor/dice`)

### 1. D20 Policy

```typescript
interface D20PolicyOptions {
  critThreshold?: number;        // default 20 (Champion: 19)
  fumbleThreshold?: number;      // default 1
  advantagePolicy?: 'keep-higher' | 'keep-lower' | 'roll-once';
}
```

Handles: advantage/disadvantage, critical hits (configurable threshold), fumbles.

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

The AI layer is **introspective**: it reads the registered system and generates three things automatically.

### Tool Generation

Instead of hand-writing tool schemas, tools are emitted from registered data:

- **Universal verbs** always present: `act`, `narrate`, `advance_turn`, `query_state`
- **Entity verbs** generated from schemas: every ability/resource a character has becomes a typed tool param
- **Catalog verbs**: `cast_spell`'s param schema is built from the spell catalog's fields; adding a spell field auto-extends the tool

```typescript
interface ToolSchema {
  name: string;
  description: string;
  params: JSONSchema;
}

function generateTools(system: SystemPackage, entity: Entity): ToolSchema[];
```

### Context Assembly

A `ContextAssembler` walks the entity store + active sources and emits a token-budgeted string. Per-system `prompt/*.md` fragments are injected. Derived values come from `resolve()` so the AI always sees truthful AC/DC/bonuses (no hallucination).

### Prompt Assembly

```
system-prompt = kernel-rules + system.prompt.system + system.prompt[mode] + actor-persona
```

The kernel supplies the universal contract ("use tools, don't narrate numbers you didn't roll, advance time only via tools"); the system package supplies game-specific GMing guidance.

### Verb Dispatcher (Universal Agent Loop)

The agent loop speaks **verbs**, not system jargon. `act(abilityId, targets, opts)` is the same whether it's a 5e Greatsword attack or a CoC Shotgun blast. The system's reducers + dice policy decide what actually happens. **One agent loop implementation serves every system.**

### Cooperative Authority Model

| Engine Validates | AI Owns |
|---|---|
| Resources sufficient | Narrative tone |
| Target exists & is legal | Target selection rationale |
| Action economy slot available | Scene description |
| Prerequisites met | NPC behavior |
| **Numbers** (always engine-truthful) | **Prose** (always AI-generated) |

On violation, the engine returns a structured `Rejection { reason, hint }` (not an exception); the agent loop feeds it back as a tool-result so the LLM self-corrects. This formalizes the existing "warn-stamp" pattern.

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
    stacking.ts              stack-group policies
    reducers/                one file per effect family
    sources/                 condition catalog, aura definitions
    abilities/               active abilities (breath-weapon, divine-smite, ...)
  prompt/
    system.md                "you are a 5e GM…" (system rules for the AI)
    combat.md                guidance for combat narration
    exploration.md           guidance for exploration
    tone.md                  narrative style guidance
    glossary.md              term definitions injected on demand
```

**The contract:** a loader reads `manifest.json`, registers schemas + reducers + sources + abilities + dice policy + initiative model + prompt fragments. The engine is ready. Swap the folder → different game. Multiple systems can coexist (a campaign picks one).

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
| **Rogue** | ✅ Sneak Attack (engine-validated trigger) + Expertise + Evasion |
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
| `agentLoop` + 27 hand-written tool schemas | `@dor/cognition` VerbDispatcher (auto-tools) |
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
- Dispatcher with three registries (sources, reducers, hooks)
- Dice engine with 4 RollPolicy implementations
- Resource pool engine
- TurnModel interface + CyclicModel

**Gate:** Headless engine resolves a 5e combat from fixtures; deterministic replays pass.

**Tests:**
- Property tests with injected RNG
- Replay fixtures (golden state)
- Each dice policy: pure unit tests

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
- All "Effects 2.0" fixes live as 5e data

**Gate:** `dor validate-system dnd5e` green; codegen emits typed `Character`; all class/race fixes verified.

**Tests:**
- Schema validation tests
- Codegen output tests
- System package golden-state replays

---

### Phase C — Cognition (AI Layer)

**Scope:** `@dor/cognition`

**Deliverables:**
- ToolGenerator (auto-generates tool schemas from system)
- ContextAssembler (token-budgeted state serialization)
- PromptAssembler (kernel + system + mode + persona)
- VerbDispatcher (universal agent loop)
- Cooperative authority model (structured rejections)

**Gate:** Headless AI GM runs a full 5e turn via verbs under cooperative authority.

**Tests:**
- Mock-LLM tests on generated tool schemas
- Context string assertions
- Agent loop scenario tests

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

## Testing Strategy

| Layer | Approach | Examples |
|---|---|---|
| **Kernel** | Property tests, injected RNG, replay fixtures | Same inputs → same outputs across runs |
| **Dice policies** | Pure unit tests, one per kind | d20 advantage, pool hit-count, percentile fumble |
| **Reducers** | Pure unit tests, one per effect kind | extra-attack count, damage-bonus, resistance |
| **System packages** | Golden-state turn replays → exact state-diff | Full 5e combat scenario |
| **Cognition** | Mock-LLM tests | Tool schema generation, context assembly |
| **Host** | Ported vitest suite | UI behavior, multiplayer sync |
| **Integration** | Headless scenarios per system | End-to-end turn resolution |

---

## Risk Matrix

| Risk | Impact | Mitigation |
|---|---|---|
| Codegen friction | High | `dor codegen --watch`; schema is single source of truth |
| Dispatcher perf (fold on every roll) | Medium | Cache derived values, invalidate on source-change |
| Over-abstraction | High | No kernel feature ships without Phase E's second system needing it |
| Cooperative-authority drift | Medium | One authoritative table per verb (engine validates / AI owns) |
| Big-bang risk | High | Strangler via adapter; current game stays playable through Phase D |
| Scope creep | Medium | Phase E enforces "does a second system need this?" |

---

## Migration from Current Code

| Current File/Module | Becomes | Action |
|---|---|---|
| `services/effectDispatcher.ts` | `@dor/engine` dispatcher | Extract + generalize + add stacking |
| `services/conditionEngine.ts` | `@dor/rules` conditions | Finish as transient-source provider |
| `services/resourceHandlers.ts` | `@dor/rules` ability registry | Promote to declarative descriptors |
| `services/classEngine.ts` | `@dor/engine` resource engine | Generalize |
| `services/spellcastingEngine.ts` | `systems/dnd5e/rules/casting.ts` | Port as 5e plugin |
| `services/combatService.ts` | `@dor/rules` + `systems/dnd5e` | Split: generic combat → rules; 5e specifics → system |
| `services/llm/agentLoop.ts` | `@dor/cognition` VerbDispatcher | Rewrite as universal loop |
| `services/llm/tools/*.ts` | Auto-generated by ToolGenerator | Delete (auto-generated) |
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
- Hand-written tool schemas (auto-generated)
- 5e-hardcoded agent loop

---

## Glossary

| Term | Definition |
|---|---|
| **Dispatcher** | The universal fold operation: `resolve(store, entity, hook, ctx)` |
| **Hook** | An event point in the engine lifecycle (onAttackRoll, computeAc, etc.) |
| **Source** | Anything that contributes modifiers (race, class, condition, equipment) |
| **Reducer** | A pure function that folds a modifier into a hook context |
| **Stacking** | Rules for how multiple modifiers of the same kind combine |
| **Condition** | A transient source with duration/tick/removal (the buff system) |
| **Ability** | An active/spendable action with targeting and effects |
| **RollPolicy** | How to interpret a dice expression (d20, pool, percentile, Fudge) |
| **TurnModel** | How initiative/order works (cyclic, pass, popcorn, tick) |
| **System Package** | A directory of schema + data + rules + prompt that defines one game |
| **Cooperative Authority** | Engine validates mechanics; AI owns narration; numbers engine-truthful |
| **Verb** | A universal action (act, narrate, advance_turn, query_state) |
| **Schema + Codegen** | Runtime property-bag, dev-time typed interfaces generated from schema |

---

## Appendices

### A. Dispatcher Pseudocode (Complete)

```typescript
function resolve(store, entity, hook, ctx) {
  // 1. Collect all active sources for this entity+hook
  const sources = getSourceProviders()
    .sort((a, b) => a.weight - b.weight)
    .flatMap(provider => provider.collect(entity, hook));

  // 2. For each source, find matching reducers
  const results = [];
  for (const modifier of sources) {
    const reducers = getReducers(hook, modifier.kind)
      .sort((a, b) => a.priority - b.priority);

    let currentCtx = ctx;
    for (const reducer of reducers) {
      currentCtx = reducer.reduce(currentCtx, modifier, entity);
    }
    results.push(currentCtx);
  }

  // 3. Apply stacking rules per stack-group
  return applyStacking(results, ctx);
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
    { kind: 'damage-resistance', payload: { type: 'bludgeoning' } },
    { kind: 'damage-resistance', payload: { type: 'piercing' } },
    { kind: 'damage-resistance', payload: { type: 'slashing' } },
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

---

## Next Steps

1. **Review this blueprint** with the team
2. **Confirm Phase A scope** (kernel + rules + dice)
3. **Scaffold the monorepo** (pnpm workspace, package structure)
4. **Implement Phase A** (dispatcher spine + dice policies)
5. **Proceed through phases B–E**

The plan is complete and ready for execution.
