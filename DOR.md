# Dice on Rails — Reboot Blueprint v4

> **Version:** 4.0 (Production-Hardened Architecture)  
> **Status:** Approved for execution  
> **Last updated:** 2025

## Executive Summary

Dice on Rails is a **universal AI-driven dice-engine platform**. It is not just a D&D 5e game — it is a modular engine capable of running any dice-based tabletop RPG (5e, Pathfinder, Call of Cthulhu, Shadowrun) with an AI Game Master as a first-class citizen.

This document is the complete architectural blueprint for rebooting the existing Dice on Rails codebase into this universal platform. The 5e system is the **first module** — not the only product.

### Core Insight

Every dice-based tabletop RPG shares the same fundamental operation:

```
value = base_number folded through modifiers at an event point
```

The **Effect Dispatcher** (the "spine") is the universal mechanism that performs this fold. Everything else — dice, classes, conditions, AI — hangs off it.

### Viability Assessment

| Subsystem | Viability | Risk | Mitigation |
|---|---|---|---|
| **Kernel Store & Schema** | High | Dynamic runtime mutations bypassing schema | Build-time JSON Schema + runtime type guards |
| **Data Preparation** | High | Cross-tier feedback loops | Strict unidirectional dependency graph |
| **Effect Dispatcher** | High | Priority deadlocks in overrides | Multi-tier deterministic sorting tuple |
| **Async Interrupts** | High | Stack explosion, context staleness | Bounded snapshot frames + checksum verification |
| **Dice Families** | High | External entropy breaking determinism | Pure functional execution with injected RNG |
| **AI Cognition Layer** | High | Cache eviction, illegal fallbacks | Multi-vendor cache boundaries + action-aware fallbacks |
| **System Module SDK** | High | Contract breaking | Build-time validation + runtime guards |

---

## Design Principles

1. **The dispatcher is the spine.** Every numeric outcome in any dice game is "a value folded through modifiers at an event point." Make that fold first-class and universal; everything else hangs off it.

2. **A game system is a data package, not code in the engine.** 5e, Pathfinder, CoC, Shadowrun are each a directory of schema + catalogs + rules + prompt fragments. The kernel knows zero game specifics.

3. **AI is an actor, not a special case.** Human input and LLM input pass through the *same* action API. The AI's tools are **static universal verbs** with system-specific payload schemas — preserving prompt caching and controlling token usage.

4. **Type safety by schema + codegen, not hard-coding.** Runtime is a property-bag; dev-time is fully typed via generated accessors from each system's schema.

5. **Determinism via injection.** RNG, time, persistence, and the LLM client are all injected ports. Core is pure functions → fully testable, fully replayable.

6. **Strictly synchronous dispatcher.** The dispatcher is a pure, synchronous function. Async operations (reactions, user input) are handled via bounded state suspension snapshots — never inline blocking.

7. **Stratified data preparation.** Entity data resolves in strict unidirectional tiers (Base → Modifiers → Derived → Override) to prevent cyclical dependencies.

8. **Prompt cache hygiene.** System prompts are strictly static. Dynamic state lives in user messages. Timestamps are quantized to turn indices.

---

## Locked Architectural Decisions

| Decision | Choice |
|---|---|
| Entity model | Schema + codegen (runtime property-bag, dev-time typed interfaces) |
| AI authority | Cooperative with rejection budgeting (max 2 retries, then action-aware fallback) |
| AI tool model | Static universal verbs with parametric payloads (preserves prompt caching) |
| Dice families v1 | d20, dice-pool, percentile, Fudge (4 `RollPolicy` implementations) |
| Dispatcher model | Strictly synchronous; reactions via bounded State Suspension + Continuation |
| Data preparation | Stratified unidirectional: Base → Modifiers → Derived → Override |
| Stacking model | Typed multi-pass (Item/Status/Circumstance/Untyped) |
| Override sorting | Multi-tier deterministic: (subPhase, priority, timestamp, entityId) |
| Build path | Fresh engine in a monorepo; current app's 5e data + UI port over as first system module + host |
| Repo | Single pnpm workspace, one CI gate |
| Engine brand | **Dice on Rails** (the universal platform itself) |

---

## Monorepo Layout

```
dice-on-rails/                          # Project root
  packages/
    engine/         @dor/engine         Kernel: EntityStore • Synchronous Dispatcher • Dice • RNG • Resources
                                        (pure, zero I/O, zero game knowledge)
    rules/          @dor/rules          Hooks • Sources (permanent/transient/equipment) •
                                        Reducers • Typed Stacking • Conditions • Abilities • TurnModel
    dice/           @dor/dice           Four v1 RollPolicy implementations:
                                        d20, pool, percentile, fudge
    cognition/      @dor/cognition      AI layer: Static Verb Dispatcher • ContextAssembler •
                                        PromptAssembler • Cooperative Authority with action-aware fallbacks
    system-sdk/     @dor/system-sdk     Schema format • Codegen • SystemLoader • CLI
                                        (validate / codegen / replay)
  systems/
    dnd5e/                              FIRST system module:
                                        schema + data + rules + prompt  ← ported from current data/*
    coc-lite/                           (Phase E) Second-system proof (d100 percentile)
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
├─ 2. RULES ENGINE ─────────────────── stratified hooks • typed stacking         │
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

### Stratified Data Preparation (Unidirectional)

To prevent cyclical dependencies, entity data resolves in strict unidirectional tiers. Data flows only downward — higher tiers can read lower tiers, but never write back.

```
Tier 1: Base Properties        ──► Raw entity props (stats, level, class, race)
        │                              No computation, just data access
        │                              READ-ONLY for all other tiers
        ▼
Tier 2: Base Ability Scores  ──► Ability modifiers, proficiency bonus
        │                              Depends only on Tier 1
        │                              READ-ONLY for Tiers 3-4
        ▼
Tier 3: Modifier Aggregation ──► Active effects from all sources
        │                              Depends on Tiers 1-2
        │                              Applies typed stacking rules
        ▼
Tier 4: Derived + Override   ──► AC, Save DC, Initiative, Max HP, control-flow
                                       Depends on Tiers 1-3
                                       NEVER feeds back into lower tiers
```

**Invariant:** A value computed in Tier N cannot modify any value in Tier M where M < N within the same evaluation pass. This guarantees termination in predictable linear time.

### Synchronous Dispatcher with Bounded State Suspension (The Spine, v4)

The dispatcher is a **pure, synchronous function**. It never blocks on async operations.

```typescript
type HookName = string;  // base set + system-registered

interface HookContext {
  readonly _hook: HookName;
  readonly _phase: 'base' | 'modifiers' | 'derived' | 'override';
  readonly _tier: 1 | 2 | 3 | 4;
  [key: string]: unknown;
}

interface Modifier {
  kind: string;
  payload: Record<string, unknown>;
  stackGroup?: string;
  stackCategory?: 'item' | 'status' | 'circumstance' | 'untyped';
  source: SourceRef;
}

interface SourceProvider {
  id: string;
  weight: number;
  collect(entity: Entity, hook: HookName): Modifier[];
}

interface Reducer<C extends HookContext = HookContext> {
  kind: string;
  hook: HookName;
  phase: 'base' | 'modifiers' | 'derived' | 'override';
  tier: 1 | 2 | 3 | 4;
  priority: number;
  reduce(ctx: C, modifier: Modifier, entity: Entity): C;
}

// THE universal fold — strictly synchronous
function resolve(
  store: EntityStore,
  entity: Entity,
  hook: HookName,
  ctx: HookContext
): HookContext | StateSnapshot;
```

#### Execution Lifecycle

```
Phase 1: Base Initialization (Tiers 1-2)
        ──► Raw properties → ability scores → proficiency
        │
        ▼
Phase 2: Modifier Resolution (Tier 3)
        ──► Collect modifiers → typed stacking (Item/Status/Circumstance/Untyped)
        │
        ▼
Phase 3: Derived Computation (Tier 4)
        ──► AC, Save DC, Initiative, Max HP
        │
        ▼
Phase 4: Post-Evaluation Override
        ──► Control-flow mutations, clamps, boolean flags
        │   (Reliable Talent, immunity, absolute caps)
        │
        ▼
  Check for reaction triggers
        │
        ├──► No triggers: Return result synchronously
        │
        └──► Triggers present: Create bounded snapshot frame
                                      │
                                      ▼
                            Return snapshot to host (synchronous)
                                      │
                                      ▼
                            Host handles async notification out-of-band
                                      │
                                      ▼
                            Reaction decision arrives or timeout
                                      │
                                      ▼
                            Host calls continueWithReaction(snapshot, decision)
                                      │
                                      ▼
                            Engine verifies checksum, restores, completes
```

### Bounded State Suspension and Continuation

Instead of inline async blocking, the engine uses bounded frame stacks with checksum verification:

```typescript
interface StateSnapshot {
  id: string;                    // Unique suspension ID
  frameDepth: number;            // Nested reaction depth (max: 5)
  parentSnapshotId?: string;     // Parent frame for nested reactions
  entityId: string;
  hook: HookName;
  context: HookContext;          // Frozen at suspension point
  stateChecksum: string;         // SHA-256 of entity store at suspension
  timestamp: number;             // For timeout tracking
  reactionTriggers: ReactionTrigger[];
}

interface ReactionTrigger {
  triggerType: string;           // 'attack_roll' | 'spell_cast' | 'damage_taken'
  source: EntityRef;
  validReactions: string[];      // Ability IDs that can respond
}

interface ReactionDecision {
  snapshotId: string;
  reactions: Array<{
    ability: string;
    actor: string;
    payload: Record<string, unknown>;
  }>;
}

// Constants
const MAX_SNAPSHOT_DEPTH = 5;   // Prevents infinite reaction chains
const SNAPSHOT_TTL_MS = 30000;  // 30 second timeout
```

**Why bounded frames:**
- Prevents stack explosion from nested reactions (Shield → Counterspell → Counterspell...)
- Frame depth ceiling ensures termination
- Parent-child linking enables proper resumption order
- Checksum verification detects stale state

### Checksum Verification

To prevent world state desynchronization during suspension windows:

```typescript
function computeStateChecksum(store: EntityStore): string {
  // SHA-256 of all entity props + collections
  // Changes if ANY entity mutates during suspension
  const stateString = JSON.stringify({
    entities: store.query(() => true).map(e => ({
      id: e.id,
      props: e.props,
      collections: e.collections,
    })),
  });
  return sha256(stateString);
}

function continueWithReaction(snapshot: StateSnapshot, decision: ReactionDecision): HookContext {
  // Verify state hasn't changed during suspension
  const currentChecksum = computeStateChecksum(store);
  if (currentChecksum !== snapshot.stateChecksum) {
    throw new StateDesynchronizationError(
      `Snapshot ${snapshot.id} is stale. ` +
      `Expected checksum ${snapshot.stateChecksum}, got ${currentChecksum}`
    );
  }
  
  // Verify timeout
  if (Date.now() - snapshot.timestamp > SNAPSHOT_TTL_MS) {
    throw new SnapshotTimeoutError(`Snapshot ${snapshot.id} expired`);
  }
  
  // Restore frozen context and apply reactions
  let ctx = { ...snapshot.context };
  for (const reaction of decision.reactions) {
    const ability = getAbility(reaction.ability);
    ctx = ability.run(ctx, reaction.actor, reaction.payload);
  }
  
  return finalizeResolution(ctx);
}
```

### Multi-Tier Override Sorting

To eliminate priority parity deadlocks, override rules use a deterministic sorting tuple:

```typescript
interface OverrideRule {
  condition: (ctx: HookContext) => boolean;
  apply: (ctx: HookContext) => HookContext;
  
  // Multi-tier sorting key for deterministic execution order
  sortKey: {
    subPhase: 'transform' | 'clamp' | 'floor' | 'boolean';  // Execution band
    priority: number;                                        // Within-band priority
    timestamp: number;                                       // Tiebreaker 1
    entityId: string;                                        // Tiebreaker 2
  };
}

// Sub-phase execution order (deterministic):
// 1. transform — Absolute property transformations (set roll = 20)
// 2. clamp     — Numerical value clamps (speed ≤ maxSpeed)
// 3. floor     — Minimum thresholds (roll ≥ 10)
// 4. boolean   — State flag overrides (isCrit = false)

// Example: Reliable Talent
const RELIABLE_TALENT: OverrideRule = {
  condition: (ctx) => ctx._hook === 'onSkillCheck' && ctx.roll <= 9,
  apply: (ctx) => ({ ...ctx, roll: 10 }),
  sortKey: {
    subPhase: 'floor',
    priority: 100,
    timestamp: Date.now(),
    entityId: ctx.character.id,
  },
};

// Example: Critical Immunity
const CRITICAL_IMMUNITY: OverrideRule = {
  condition: (ctx) => ctx._hook === 'onAttackDamage' && ctx.isCrit,
  apply: (ctx) => ({ ...ctx, isCrit: false }),
  sortKey: {
    subPhase: 'boolean',
    priority: 200,
    timestamp: Date.now(),
    entityId: ctx.target.id,
  },
};
```

**Sorting algorithm:**
```typescript
function compareOverrides(a: OverrideRule, b: OverrideRule): number {
  // 1. Sub-phase order (transform < clamp < floor < boolean)
  const subPhaseOrder = { transform: 0, clamp: 1, floor: 2, boolean: 3 };
  const subDiff = subPhaseOrder[a.sortKey.subPhase] - subPhaseOrder[b.sortKey.subPhase];
  if (subDiff !== 0) return subDiff;
  
  // 2. Priority (higher first)
  if (a.sortKey.priority !== b.sortKey.priority) {
    return b.sortKey.priority - a.sortKey.priority;
  }
  
  // 3. Timestamp (earlier first)
  if (a.sortKey.timestamp !== b.sortKey.timestamp) {
    return a.sortKey.timestamp - b.sortKey.timestamp;
  }
  
  // 4. Entity ID (deterministic string sort)
  return a.sortKey.entityId.localeCompare(b.sortKey.entityId);
}
```

### Dependency-Tracked Reactive Caching

```typescript
interface DependencyGraph {
  // Maps computed property → set of source IDs it depends on
  dependencies: Map<string, Set<string>>;
  // Maps source ID → set of computed properties that become dirty
  reverseDeps: Map<string, Set<string>>;
  // Spatial dependency tracking (for auras, adjacency)
  spatialDeps: Map<string, Set<string>>;  // entityId → set of affected entityIds
  
  markDirty(sourceId: string): void;
  markSpatialDirty(entityId: string): void;  // Special handling for position changes
  isDirty(propertyId: string): boolean;
  clearDirty(propertyId: string): void;
}
```

**Spatial dependency optimization:**
- Position changes mark only nearby entities dirty (within aura range)
- Distant entities retain cached values
- Prevents cascade invalidation during tactical combat

### Dice Engine: Expression + Policy

A roll is `RollSpec { expression, policy, modifiers }`. The *expression* says what dice; the *policy* says how to interpret them.

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

### Meta-Currency Hooks (Pre/Post-Resolution)

To handle luck expenditure, inspiration dice, and other post-roll adjustments without breaking determinism:

```typescript
interface MetaCurrencyHook {
  timing: 'pre-roll' | 'post-roll';
  condition: (ctx: HookContext) => boolean;
  apply: (ctx: HookContext, rng: RNG) => HookContext;
  resourceCost: { pool: string; amount: number };
}

// Examples:
const LUCK: MetaCurrencyHook = {
  timing: 'post-roll',
  condition: (ctx) => ctx.roll < 10,
  apply: (ctx, rng) => ({ ...ctx, roll: rng.roll(20) }),
  resourceCost: { pool: 'luck', amount: 1 },
};

const BARDC_INSPIRATION: MetaCurrencyHook = {
  timing: 'post-roll',
  condition: (ctx) => hasCondition(ctx.target, 'bardic-inspiration'),
  apply: (ctx, rng) => ({ ...ctx, roll: ctx.roll + rng.roll(8) }),
  resourceCost: { pool: 'bardic-inspiration', amount: 1 },
};
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
| `computeSpeed` | `{ speed, character, maxSpeed }` | Movement speed |
| `computeMaxHp` | `{ hp, character }` | Maximum hit points |
| `computeAttackCount` | `{ count, character, weapon }` | Extra Attack |
| `onAttackRoll` | `{ roll, character, weapon, target, isRanged }` | Attack roll resolution |
| `onAttackDamage` | `{ damage, character, weapon, isCrit, isRanged }` | Damage calculation |
| `onDamageTaken` | `{ amount, damageType, target, source }` | Damage application |
| `onSaveRoll` | `{ roll, stat, character, source }` | Saving throw |
| `onSkillCheck` | `{ roll, skill, character }` | Skill check |
| `onHeal` | `{ amount, target, source, spellLevel }` | Healing |
| `onCastSpell` | `{ character, spellDef, slotLevel }` | Spell casting |
| `onInitiative` | `{ roll, character }` | Initiative |
| `onDeathSave` | `{ roll, character }` | Death saving throw |
| `onTurnStart` | `{ character }` | Turn start |
| `onTurnEnd` | `{ character }` | Turn end |
| `onRoundEnd` | `{}` | Round end |
| `onReactionCheck` | `{ trigger, character, source }` | Reaction trigger evaluation |
| `onLongRest` | `{ character }` | Long rest |
| `onShortRest` | `{ character }` | Short rest |
| `onLevelUp` | `{ character, newLevel }` | Level up |

### Source Providers

| Provider | Emits | Examples |
|---|---|---|
| `permanent` | Race, class, subclass, feat, background effects | Elf darkvision, Fighter Extra Attack |
| `equipment` | Equipped item effects | Magic sword +1, armor |
| `transient` | Condition/buff effects | Rage, bless, haste, Bardic Inspiration |
| `environment` | Area effects | Darkness, difficult terrain |

**Condition-as-effect-carrier** is the keystone pattern. `ActiveCondition` carries an optional `effects[]` field. When a condition is applied, its effects flow through the dispatcher automatically while active.

### Typed Multi-Pass Stacking Engine

```
Typed Stacking Pipeline:

Collected Modifiers
         │
         ├──► Item Bonuses         ──► Select Highest (per stack group)
         ├──► Status Bonuses       ──► Select Highest (per stack group)
         ├──► Circumstance Bonuses ──► Select Highest (per stack group)
         └──► Untyped Bonuses      ──► Sum All Values
                                             │
                                             ▼
                                  Sum Active Category Values
```

```typescript
interface StackingPolicy {
  categories: ('item' | 'status' | 'circumstance' | 'untyped')[];
  categoryPolicy: Record<string, 'replace' | 'sum' | 'highest'>;
  overrides?: Record<string, string[]>;
}
```

### Abilities Registry

```typescript
interface AbilityDescriptor {
  id: string;
  resourceId?: string;
  cost?: number;
  targeting: 'self' | 'ally' | 'enemy' | 'aoe' | 'none';
  aoe?: { shape: 'cone' | 'line' | 'radius'; range: number };
  run(ctx, characterId, targetId?, amount?, opts?): Promise<MCPResponse>;
}
```

### Initiative / Turn Scheduler

Pluggable `TurnModel`:

| Model | System | Behavior |
|---|---|---|
| `CyclicModel` | D&D 5e, Pathfinder | d20+mod, one pass per round |
| `PassModel` | Shadowrun | Initiative score decrements, multiple passes |
| `PopcornModel` | FATE, Cortex | Current actor picks who goes next |

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

### 2. Dice Pool Policy

```typescript
interface PoolPolicyOptions {
  dieSides: number;              // default 6
  hitThreshold: number;          // default 5 (Shadowrun)
  explodingValue?: number;       // default 6 (rule of six)
  glitchDetection?: boolean;     // >half 1s = glitch
}
```

### 3. Percentile Policy

```typescript
interface PercentilePolicyOptions {
  difficulty?: 'regular' | 'hard' | 'extreme';
  fumbleThreshold?: number;      // default 96
  critThreshold?: number;        // default 5
}
```

### 4. Fudge Policy

```typescript
interface FudgePolicyOptions {
  diceCount: number;             // default 4
  ladder?: Record<number, string>;
}
```

---

## The AI Cognition Layer (`@dor/cognition`)

### Static Universal Verbs

Four static top-level tools — preserves provider prompt caching:

```typescript
interface UniversalVerbs {
  act(verb: string, payload: Record<string, unknown>): Promise<ActionResult>;
  query(aspect: string, filters?: Record<string, unknown>): Promise<QueryResult>;
  narrate(text: string, tone?: string): Promise<void>;
  advance_turn(mode: string): Promise<TurnResult>;
}
```

System packages provide JSON Schema definitions for the `payload` object.

### Multi-Vendor Cache Boundary Managers

To optimize token usage across different LLM providers, the cognition layer uses provider-specific payload formatters:

```typescript
interface CacheBoundaryConfig {
  provider: 'anthropic' | 'openai' | 'google';
  formatPayload(request: LLMRequest): LLMRequest;
}

// Anthropic: Explicit cache_control markers
const ANTHROPIC_CACHE: CacheBoundaryConfig = {
  provider: 'anthropic',
  formatPayload: (request) => ({
    ...request,
    system: [
      {
        type: 'text',
        text: STATIC_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },  // 5-minute TTL
      },
    ],
    tools: request.tools.map(tool => ({
      ...tool,
      cache_control: { type: 'ephemeral' },
    })),
  }),
};

// OpenAI: Automatic prefix hash matching (requires 1024+ token static prefix)
const OPENAI_CACHE: CacheBoundaryConfig = {
  provider: 'openai',
  formatPayload: (request) => ({
    ...request,
    // Ensure static prefix exceeds 1024 tokens for automatic caching
    messages: [
      { role: 'system', content: STATIC_SYSTEM_PROMPT },  // Static, cached
      { role: 'system', content: STATIC_TOOL_DEFINITIONS },  // Static, cached
      ...request.messages,  // Dynamic, processed fresh
    ],
  }),
};
```

### Prompt Cache Hygiene

**CRITICAL:** To preserve prompt caching benefits, the cognition module enforces strict structural prompt hygiene:

```typescript
// ✅ CORRECT: Static system prompt (cacheable)
const SYSTEM_PROMPT = `You are a Game Master for a tabletop role-playing game.
Follow the rules of the system module.
Use the provided tools to resolve actions.
Never narrate numbers you did not roll through the engine.`;

// ❌ WRONG: Dynamic content in system prompt (breaks cache)
const BAD_SYSTEM_PROMPT = `You are a GM. Turn: ${gameState.turnCounter}. HP: ${hp}. Time: ${new Date().toISOString()}.`;

// ✅ CORRECT: Dynamic state in user message
const userMessage = {
  role: 'user',
  content: `Turn ${gameState.turnCounter}. Party status: ${partyStatus}.`,
};
```

**Rules:**
1. System prompts contain ONLY core engine instructions and permanent rules
2. Dynamic state (HP, position, conditions) goes in user messages
3. Timestamps are quantized to turn indices (`turn: 5`), not ISO dates
4. Cache control markers share normalized TTL settings

### Cooperative Authority with Action-Aware Fallbacks

| Engine Validates | AI Owns |
|---|---|
| Resources sufficient | Narrative tone |
| Target exists & is legal | Target selection rationale |
| Action economy slot available | Scene description |
| Prerequisites met | NPC behavior |
| **Numbers** (always engine-truthful) | **Prose** (always AI-generated) |

```typescript
interface RejectionBudget {
  maxRetries: number;            // Default: 2
  currentRetries: number;
  
  canRetry(): boolean;
  exhaust(): FallbackAction;     // Action-aware fallback
}

// Action-aware fallback matrix
function selectFallback(ctx: {
  isReactionWindow: boolean;
  currentTurn: string;
  actorTurn: string;
  availableActions: string[];
}): FallbackAction {
  // Out-of-turn reaction window: decline the reaction
  if (ctx.isReactionWindow && ctx.currentTurn !== ctx.actorTurn) {
    return { type: 'decline_reaction', reason: 'fallback' };
  }
  
  // In-turn: passive defensive action
  if (ctx.availableActions.includes('dodge')) {
    return { type: 'dodge' };
  }
  if (ctx.availableActions.includes('defend')) {
    return { type: 'defend' };
  }
  
  // Last resort: wait
  return { type: 'wait' };
}
```

**Why action-aware:** Forcing a `dodge` action during another player's turn (as a reaction fallback) violates action economy. The fallback must respect turn context.

**Repeated fallback detection:**
```typescript
interface FallbackAlert {
  actorId: string;
  fallbackCount: number;
  threshold: number;             // Default: 3 per encounter
  
  shouldDowngrade(): boolean;    // Switch to deterministic script or alert human
}
```

---

## The System Package Format

```
systems/<system-id>/
  manifest.json              id, name, version, depends-on
  schema/
    character.schema.json    → codegen → typed Character
    enemy.schema.json
    item.schema.json
  data/                      catalogs: classes, races, spells, monsters, items
  rules/
    dice.ts                  RollPolicy config
    initiative.ts            TurnModel impl
    stacking.ts              Typed stacking policy
    reducers/                one file per effect family
    sources/                 condition catalog, aura definitions
    abilities/               active abilities
    overrides/               Post-evaluation override rules with sortKeys
    verbs.json               Payload schemas for static universal verbs
  prompt/
    system.md                Static system prompt (no dynamic content)
    combat.md
    exploration.md
    tone.md
    glossary.md
```

**The contract:** a loader reads `manifest.json`, registers schemas + reducers + sources + abilities + dice policy + initiative model + prompt fragments + verb schemas. The engine is ready. Swap the folder → different game. Multiple systems can coexist (a campaign picks one).

---

## The 5e System Module (`systems/dnd5e/`)

### Reducers (`systems/dnd5e/rules/reducers/`)

| Reducer | Phase | Fixes |
|---|---|---|
| `extra-attack` | modifiers | Fighter/Barbarian/Monk/Paladin/Ranger Extra Attack |
| `reckless-attack` | modifiers | Barbarian Reckless Attack |
| `fighting-style-archery` | modifiers | +2 ranged attack |
| `fighting-style-dueling` | modifiers | +2 one-handed damage |
| `fighting-style-defense` | modifiers | +1 AC when armored |
| `healing-bonus` | modifiers | Disciple of Life, Blessed Healer |
| `evasion` | modifiers | Rogue/Monk Evasion |
| `uncanny-dodge` | modifiers | Rogue Uncanny Dodge |
| `crit-bonus-dice` | modifiers | Brutal Critical, Savage Attacks (FIXED) |

### Overrides (`systems/dnd5e/rules/overrides/`)

| Override | Sub-Phase | SortKey | Fixes |
|---|---|---|---|
| `reliable-talent` | floor | `{subPhase: 'floor', priority: 100}` | Rogue Reliable Talent (roll floor = 10) |
| `critical-immunity` | boolean | `{subPhase: 'boolean', priority: 200}` | Monster immunity to crits |
| `speed-cap` | clamp | `{subPhase: 'clamp', priority: 50}` | Encumbrance, armor speed limits |
| `death-on-exhaustion` | transform | `{subPhase: 'transform', priority: 300}` | Exhaustion level 10 = death |

### Conditions (`systems/dnd5e/rules/sources/`)

| Condition | Carries Effects |
|---|---|
| `rage` | `damage-resistance{B/P/S}`, `damage-bonus{melee-str}`, `advantage-on-save{str}` |
| `bardic-inspiration` | `granted-die` (consumed on next roll) |
| `aura-of-protection` | `save-bonus` = CHA mod |

### Abilities (`systems/dnd5e/rules/abilities/`)

| Ability | What it does |
|---|---|
| `breath-weapon` | AoE: loops targets, rolls saves, applies damage |
| `divine-smite` | Slot-consuming extra radiant damage |
| `wild-shape` | Links to polymorph flow |
| `destroy-undead` | Radius auto-kill at CR limit |

### Result: Every class and race reaches full SRD fidelity

| Class/Race | Status After Reboot |
|---|---|
| **Wizard** | ✅ Full spellcasting, spellbook, ritual, Arcane Recovery |
| **Sorcerer** | ✅ Full casting + Sorcery Points + Metamagic |
| **Fighter** | ✅ Extra Attack (engine-loop), Fighting Styles, Second Wind |
| **Cleric** | ✅ Full casting + Turn Undead + Disciple of Life |
| **Druid** | ✅ Full casting + Wild Shape (condition-linked) |
| **Paladin** | ✅ Lay on Hands + Divine Smite (slot consumed) + Auras |
| **Ranger** | ✅ Half casting + Hunter features + Extra Attack |
| **Rogue** | ✅ Sneak Attack + Expertise + Evasion + Reliable Talent |
| **Monk** | ✅ Martial Arts + Ki (all features wired) |
| **Warlock** | ✅ Pact Magic + Invocations + Mystic Arcanum |
| **Barbarian** | ✅ Rage (resistance applied) + Reckless Attack + Brutal Critical |
| **Bard** | ✅ Bardic Inspiration (die consumed) + Expertise |
| **Elf** | ✅ Darkvision + Keen Senses + Fey Ancestry |
| **Dwarf** | ✅ Darkvision + Resilience + Stonecunning |
| **Halfling** | ✅ Lucky + Brave |
| **Gnome** | ✅ Darkvision + Gnome Cunning |
| **Half-Elf** | ✅ Flexible ASI + Fey Ancestry |
| **Half-Orc** | ✅ Relentless Endurance + Savage Attacks (FIXED) |
| **Tiefling** | ✅ Darkvision + Hellish Resistance |
| **Dragonborn** | ✅ Draconic Ancestry + Breath Weapon (FIXED) |
| **Human** | ✅ +1 all stats |

---

## Build Phases

### Phase A — Kernel + Rules + Dice (Universal Foundation)

**Scope:** `@dor/engine`, `@dor/rules`, `@dor/dice` (4 policies)

**Deliverables:**
- EntityStore with schema-driven property bags
- **Stratified unidirectional data preparation** (4 tiers, no backward reads)
- **Synchronous dispatcher** with 4 phases (base, modifiers, derived, override)
- **Bounded State Suspension + Continuation** for reactions (max depth 5, checksum verification)
- **Multi-tier override sorting** (subPhase → priority → timestamp → entityId)
- Dependency-tracked reactive caching with spatial optimization
- Dice engine with 4 RollPolicy implementations
- Resource pool engine
- TurnModel interface + CyclicModel
- Typed stacking engine (Item/Status/Circumstance/Untyped)
- Meta-currency hooks (pre-roll, post-roll)

**Gate:** Headless engine resolves a 5e combat from fixtures; deterministic replays pass; 1,000 parallel `resolve()` calls complete within performance budget; nested reaction chains (depth ≤ 5) resolve without memory leaks.

**Tests:**
- Property tests with injected RNG
- Replay fixtures (golden state)
- Each dice policy: pure unit tests
- Stratified lifecycle verification (no cycles)
- Bounded snapshot frame tests (depth limit, checksum verification)
- Multi-tier override sorting tests (deterministic order)
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
- Register all reducers, abilities, conditions, overrides for 5e
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
- **Multi-vendor cache boundary managers** (Anthropic, OpenAI, Google)
- **Prompt cache hygiene enforcement** (static system prompts, dynamic state in user messages)
- PromptAssembler (kernel + system + mode + persona)
- Cooperative authority with **action-aware fallbacks** (respects turn context)
- Fallback alert system (repeated failures → downgrade actor)
- Mock LLM test harness

**Gate:** Headless AI GM runs a full 5e turn via static verbs under cooperative authority with rejection budgeting enforced and prompt cache hit-rate verified (>85%).

**Tests:**
- Mock-LLM tests on verb dispatch
- Context string assertions
- Agent loop scenario tests
- Rejection budget enforcement tests
- **Prompt cache hit-rate verification** (must exceed 85%)
- Action-aware fallback tests (out-of-turn → decline_reaction)

---

### Phase D — Host Integration

**Scope:** `apps/host`, adapters

**Deliverables:**
- engineAdapter (GameState ↔ EntityStore mapping)
- HumanAdapter (UI events → action intents)
- AgentAdapter (LLM tool calls → action intents)
- **State Continuation Handler** (restores snapshots, verifies checksums)
- Persistence port (Supabase + local)
- Realtime port (presence/sync)
- Migrated React UI

**Gate:** Dice on Rails playable on the new engine — behaviorally equivalent to current + fully fixed classes/races.

**Tests:**
- Ported vitest suite (behavioral parity)
- UI integration tests
- Multiplayer sync tests
- Reaction continuation tests (checksum verification)

---

### Phase E — Second System Proof

**Scope:** `systems/coc-lite` (Call of Cthulhu d100 percentile)

**Deliverables:**
- Minimal second system package
- Demonstrates universality (same engine, different rules)

**Gate:** Two systems coexist on one engine → universality demonstrated within scalar domain.

**Why CoC:** Percentile system validates the engine beyond d20; Sanity tracking tests resource pool flexibility; Major Wounds test override rules.

---

## System-by-System Universality Audit

| Game System | Primary Mechanics | Modifier Model | Compatibility | Notes |
|---|---|---|---|---|
| **D&D 5e** | d20 + Additive Modifiers | Additive bonuses, Adv/Dis | Native (95%) | Primary baseline |
| **Pathfinder 2e** | d20 + Modifiers; 4 DoS | Typed stacking (Status/Item/Circumstance) | High (90%) | Fully supported via typed stacking |
| **Call of Cthulhu 7e** | d100 vs Skill; Hard/Extreme | Binary tiers, Sanity tracking | High (85%) | Sanity resource track needed |
| **Shadowrun 6e** | d6 pool vs Threshold | Glitch, exploding dice | Moderate (75%) | Physical/Stun tracks needed |
| **Fate Core** | 4dF vs Ladder | Aspects, Compels, Stress | Low (40%) | Scalar dispatcher insufficient for narrative aspects |

**Boundary acknowledgment:** Dice on Rails is a universal platform for **rules-heavy, numeric, dice-based systems**. Narrative-first mechanics (Fate, PbtA) require a different abstraction layer.

---

## Testing Strategy

| Layer | Approach | Examples |
|---|---|---|
| **Kernel** | Property tests, injected RNG, replay fixtures | Same inputs → same outputs across runs |
| **Dice policies** | Pure unit tests, one per kind | d20 advantage, pool hit-count, percentile fumble |
| **Reducers** | Pure unit tests, one per effect kind | extra-attack count, damage-bonus, resistance |
| **Overrides** | Control-flow tests | Reliable Talent floor, immunity, speed cap |
| **Snapshots** | Bounded frame tests | Depth limit, checksum verification, TTL |
| **System packages** | Golden-state turn replays → exact state-diff | Full 5e combat scenario |
| **Cognition** | Mock-LLM tests | Verb dispatch, context assembly, fallbacks |
| **Host** | Ported vitest suite | UI behavior, multiplayer sync |
| **Integration** | Headless scenarios per system | End-to-end turn resolution |
| **Performance** | Benchmark suite | 1,000 parallel `resolve()` calls |
| **Cache** | Prompt cache hit-rate tests | Must exceed 85% hit rate |

---

## Risk Matrix

| Risk | Impact | Mitigation |
|---|---|---|
| Codegen friction | High | `dor codegen --watch`; schema is single source of truth |
| Dispatcher perf | Medium | Dependency-tracked reactive caching; spatial optimization |
| Over-abstraction | High | No kernel feature ships without Phase E's second system needing it |
| Cooperative-authority drift | Medium | One authoritative table per verb (engine validates / AI owns) |
| Big-bang risk | High | Strangler via adapter; current game stays playable through Phase D |
| Scope creep | Medium | Phase E enforces "does a second system need this?" |
| LLM rejection loops | Medium | Rejection budgeting (max 2 retries → action-aware fallback) |
| Prompt cache misses | High | Static universal verbs + multi-vendor cache boundaries |
| State lock from async | High | Bounded State Suspension (no inline async blocking) |
| Cyclical dependencies | Medium | Stratified unidirectional 4-tier data preparation |
| Snapshot stack explosion | Medium | Bounded frame depth (max 5) + parent-child linking |
| Stale snapshot continuation | Medium | SHA-256 checksum verification before resumption |
| Override priority deadlocks | Medium | Multi-tier deterministic sorting (subPhase, priority, timestamp, entityId) |
| Spatial cache cascades | Medium | Spatial dependency tracking (only nearby entities invalidated) |

---

## Migration from Current Code

| Current File/Module | Becomes | Action |
|---|---|---|
| `services/effectDispatcher.ts` | `@dor/engine` dispatcher | Extract + generalize + add multi-phase + typed stacking + override phase |
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
- Inline async blocking for reactions

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
| **TurnModel** | How initiative/order works (cyclic, pass, popcorn) |
| **System Package** | A directory of schema + data + rules + prompt that defines one game |
| **Cooperative Authority** | Engine validates mechanics; AI owns narration; numbers engine-truthful |
| **Rejection Budgeting** | Max retries before fallback (prevents LLM infinite loops) |
| **Static Verbs** | Fixed top-level AI tools (act, query, narrate, advance_turn) with system payload schemas |
| **State Suspension** | Bounded snapshot-based async handling (no inline async blocking) |
| **Continuation** | Resuming suspended state after reaction decision with checksum verification |
| **Stratified Data** | Unidirectional 4-tier preparation (Base → Modifiers → Derived → Override) |
| **Post-Evaluation Override** | Phase 4 for control-flow mutations (Reliable Talent, immunity, caps) |
| **Meta-Currency Hooks** | Pre-roll/post-roll expenditure (luck, inspiration) |
| **Prompt Cache Hygiene** | Static system prompts, dynamic state in user messages, quantized timestamps |
| **Multi-Vendor Cache** | Provider-specific cache boundary formatting (Anthropic, OpenAI, Google) |
| **Schema + Codegen** | Runtime property-bag, dev-time typed interfaces generated from schema |
| **Dependency Graph** | Dirty-flag caching for derived values with spatial optimization |

---

## Appendices

### A. Synchronous Dispatcher with Bounded State Suspension

```typescript
function resolve(store, entity, hook, initialCtx): HookContext | StateSnapshot {
  // Phase 1: Base Initialization (Tiers 1-2)
  let ctx = { ...initialCtx, _phase: 'base', _tier: 1 };
  ctx = prepareBaseData(store, entity, ctx);
  ctx._tier = 2;
  ctx = prepareAbilityScores(store, entity, ctx);
  
  // Phase 2: Modifier Resolution (Tier 3)
  ctx._phase = 'modifiers';
  ctx._tier = 3;
  const modifiers = collectModifiers(store, entity, hook);
  
  // Typed multi-pass stacking
  for (const category of ['item', 'status', 'circumstance', 'untyped']) {
    const categoryMods = modifiers.filter(m => m.stackCategory === category);
    const stacked = applyStackingRules(categoryMods);
    for (const mod of stacked) {
      ctx = getReducers(hook, mod.kind, 'modifiers')
        .sort((a, b) => a.priority - b.priority)
        .reduce(ctx, (reducer) => reducer.reduce(ctx, mod, entity));
    }
  }
  
  // Phase 3: Derived Computation (Tier 4)
  ctx._phase = 'derived';
  ctx._tier = 4;
  ctx = computeDerivedValues(store, entity, ctx);
  
  // Phase 4: Post-Evaluation Override
  ctx._phase = 'override';
  const overrides = getOverrides(hook)
    .filter(o => o.condition(ctx))
    .sort(compareOverrides);  // Multi-tier deterministic sort
  
  for (const override of overrides) {
    ctx = override.apply(ctx);
  }
  
  // Check for reaction triggers
  const triggers = evaluateReactionTriggers(ctx);
  if (triggers.length > 0) {
    // Create bounded snapshot frame
    return {
      id: generateSnapshotId(),
      frameDepth: getCurrentFrameDepth() + 1,
      parentSnapshotId: getCurrentSnapshotId(),
      entityId: entity.id,
      hook,
      context: ctx,
      stateChecksum: computeStateChecksum(store),
      timestamp: Date.now(),
      reactionTriggers: triggers,
    };
  }
  
  return ctx;
}

function continueWithReaction(snapshot: StateSnapshot, decision: ReactionDecision): HookContext {
  // Verify frame depth
  if (snapshot.frameDepth > MAX_SNAPSHOT_DEPTH) {
    throw new MaxReactionDepthExceededError(
      `Reaction chain exceeded maximum depth of ${MAX_SNAPSHOT_DEPTH}`
    );
  }
  
  // Verify state checksum
  const currentChecksum = computeStateChecksum(store);
  if (currentChecksum !== snapshot.stateChecksum) {
    throw new StateDesynchronizationError(
      `Snapshot ${snapshot.id} is stale. ` +
      `Expected ${snapshot.stateChecksum}, got ${currentChecksum}`
    );
  }
  
  // Verify timeout
  if (Date.now() - snapshot.timestamp > SNAPSHOT_TTL_MS) {
    throw new SnapshotTimeoutError(`Snapshot ${snapshot.id} expired`);
  }
  
  // Restore frozen context and apply reactions
  let ctx = { ...snapshot.context };
  for (const reaction of decision.reactions) {
    const ability = getAbility(reaction.ability);
    ctx = ability.run(ctx, reaction.actor, reaction.payload);
  }
  
  return finalizeResolution(ctx);
}
```

### B. Condition-as-Source Example (Rage)

```typescript
// When barbarian enters rage:
applyCondition(barbarian, {
  id: 'rage',
  source: barbarian.id,
  duration: null,
  effects: [
    { kind: 'damage-resistance', payload: { type: 'bludgeoning' }, stackCategory: 'status' },
    { kind: 'damage-resistance', payload: { type: 'piercing' }, stackCategory: 'status' },
    { kind: 'damage-resistance', payload: { type: 'slashing' }, stackCategory: 'status' },
    { kind: 'damage-bonus', payload: { amount: '2', condition: 'melee-str' } },
    { kind: 'advantage-on-save', payload: { stat: 'str' } },
    { kind: 'advantage-on-save', payload: { stat: 'con' } },
  ]
});

// When rage ends:
removeCondition(barbarian, 'rage');
```

### C. Bardic Inspiration as Meta-Currency Hook

```typescript
// When bard grants inspiration:
applyCondition(target, {
  id: 'bardic-inspiration',
  source: bard.id,
  duration: 10,
  durationUnit: 'minute',
  effects: [
    { kind: 'meta-currency', payload: { hook: 'post-roll', dieSize: 8 } }
  ]
});

// The meta-currency hook executes after roll resolution:
const BARDC_INSPIRATION_HOOK: MetaCurrencyHook = {
  timing: 'post-roll',
  condition: (ctx) => {
    const inspiration = ctx.character.collections.conditions?.find(
      c => c.id === 'bardic-inspiration' && c.source === ctx.bardId
    );
    return !!inspiration;
  },
  apply: (ctx, rng) => ({
    ...ctx,
    roll: ctx.roll + rng.roll(ctx.inspirationDieSize || 8),
  }),
  resourceCost: { pool: 'bardic-inspiration', amount: 1 },
};
```

### D. Reliable Talent Override

```typescript
const RELIABLE_TALENT: OverrideRule = {
  condition: (ctx) => {
    return ctx._hook === 'onSkillCheck' && 
           ctx.character.class === 'rogue' && 
           ctx.character.level >= 11 &&
           ctx.roll <= 9 &&
           ctx.isProficient === true;
  },
  apply: (ctx) => ({ ...ctx, roll: 10 }),
  sortKey: {
    subPhase: 'floor',
    priority: 100,
    timestamp: Date.now(),
    entityId: ctx.character.id,
  },
};
```

### E. Static Verb Schema Example

```json
{
  "verbs": [
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
  ]
}
```

### F. Prompt Cache Hygiene Example

```typescript
// ✅ CORRECT: Static system prompt (cacheable)
const SYSTEM_PROMPT = `You are a Game Master for a tabletop role-playing game.
Follow the rules of the system module.
Use the provided tools to resolve actions.
Never narrate numbers you did not roll through the engine.`;

// Dynamic state goes in user message (not system prompt)
const userMessage = {
  role: 'user',
  content: `Turn ${gameState.turnCounter}. 
Party status: ${partyStatus}. 
Active conditions: ${activeConditions}.
What happens next?`
};

// ❌ WRONG: Dynamic content in system prompt (breaks cache)
const BAD_PROMPT = `You are a GM. Turn: ${gameState.turnCounter}. HP: ${hp}. Time: ${new Date().toISOString()}.`;
```

### G. Multi-Vendor Cache Formatting

```typescript
// Anthropic: Explicit cache_control markers
const anthropicRequest = {
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  system: [
    {
      type: 'text',
      text: STATIC_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ],
  tools: STATIC_TOOLS.map(tool => ({
    ...tool,
    cache_control: { type: 'ephemeral' },
  })),
  messages: [
    { role: 'user', content: dynamicStatePayload },
  ],
};

// OpenAI: Automatic prefix hashing (requires 1024+ token static prefix)
const openaiRequest = {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: STATIC_SYSTEM_PROMPT + STATIC_TOOL_DEFINITIONS },  // >1024 tokens
    { role: 'user', content: dynamicStatePayload },
  ],
  tools: STATIC_TOOLS,
};
```

---

## Next Steps

1. **Review this blueprint** with the team
2. **Confirm Phase A scope** (kernel + rules + dice)
3. **Scaffold the monorepo** (pnpm workspace, package structure)
4. **Implement Phase A** (stratified dispatcher + bounded snapshots + multi-tier overrides + typed stacking)
5. **Proceed through phases B–E**

The plan is complete and ready for execution.
