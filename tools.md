# Tool System Overhaul Plan (Revised — Hallucination-First)

## Executive Summary

**Current state:** 29 tools, rigid boundaries, major capability gaps (NPC actions, reactions, conditions, environmental effects, skill challenges). Nine tools hit the `formatToolResult` default case — the LLM gets only an 80-char truncated message back, flying blind after those calls. This is the #1 hallucination driver.

**Target state:** 31 unified tools with clean schemas, full NPC support (temporary + combat allies), complete reaction system, bonus action enforcement, and all missing D&D 5e mechanics. Zero tools hit the `formatToolResult` default. Strict engine validation blocks illegal actions so the LLM self-corrects.

**Net change:** −4 tools removed (via 3 safe merges), +6 new tools added = **31 tools total** (7% increase, 100% increase in capability surface).

**Priority order:** Zero hallucinations > full fidelity > fewer LLM calls.

---

## Design Principles

1. **Small, single-purpose tools beat polymorphic tools.** A `kind:` discriminator with kind-specific optional fields is exactly the JSON Schema `oneOf`/`anyOf` shape that triggers field-name hallucinations in tool-calling models. Merges are only safe when tools share visibility gating, have adjacent semantics, and the merged schema stays small.

2. **Every tool must have a dedicated `formatToolResult` case.** The LLM must receive rich, structured feedback after every call. The current 9 tools that hit the default (80-char truncation) are a higher hallucination risk than any tool-count reduction.

3. **Engine-side validation blocks illegal actions.** When the LLM calls a tool with invalid parameters, the engine returns a clear failure message. The LLM self-corrects on the next iteration. This is more reliable than prompt-only enforcement.

4. **Alias dispatch, not history rewriting.** Old tool names route to merged handlers via a lookup table in `executeToolCall`. Saved campaign message history is untouched. Old names are accepted forever.

---

## Tool Consolidation Map

### Safe Merges (3, saving 4 tool names)

| Removed Tools | Replaced By | Kind/Action Values | Why Safe |
|---|---|---|---|
| `summon_creature`, `teleport_creature`, `polymorph_creature` | `manage_creature` | `action: 'summon' \| 'teleport' \| 'polymorph'` | All caster-gated (same `toolFilter` rule), all inline dispatch, all currently hit `formatToolResult` default. Clean `action:` discriminator. |
| `check_skill`, `make_save` | `roll_d20` | `kind: 'skill' \| 'save'` | Both use `BRANCH_NARRATION_PROPERTIES`, both d20-vs-DC, both always-visible, near-identical `formatToolResult` shapes. |
| `upsert_quest`, `log_lore` | `record_journal` | `kind: 'quest' \| 'lore'` | Low-frequency journal tools, near-identical schemas, both use `END_OF_TURN_PROPERTIES`. |

### Rejected Merges (preserve as separate tools)

| Proposed Merge | Verdict | Reason |
|---|---|---|
| `update_inventory` + `adjust_currency` + `upsert_quest` + `log_lore` → `record_outcome` | ❌ Reject | High-frequency, distinct semantics. Already inline-finalize (zero call savings). Polymorphic 20-field schema *increases* hallucination. |
| `player_attack` + `roll_death_save` + `roll_dice` → into `roll_check` | ❌ Reject | `player_attack` is combat-gated + mechanically massive (Sharpshooter/GWM/Smite/Extra Attack). `roll_dice` has no actor. `roll_death_save` is mechanically distinct (success/failure tracking, nat-20 revive). |

---

## New Tools (6)

| Tool | Purpose | Resolution Model |
|---|---|---|
| `npc_action` | NPC healing, buffing, attacking, casting on PCs | Direct execution |
| `combat_action` | Help, Dodge, Dash, Disengage, Ready, Grapple, Shove | Direct execution |
| `use_reaction` | Opportunity attacks, Counterspell, Hellish Rebuke, Protection, Cutting Words, Death Ward | **Strict validation**: reject if no pending trigger / reaction already used / trigger expired. Engine pre-computes AoO result so LLM decision is yes/no; mechanics stay deterministic. |
| `apply_effect` | Conditions, temp HP, speed/AC modifiers, concentration drop, cover bonuses | Direct execution. **Boundary**: non-spell effects only (cover, lair, environmental mods, GM conditions). Documented in prompt to prevent overlap with `cast_spell`. |
| `environmental_effect` | Terrain, weather, hazards, persistent zones | Direct execution + tick hook at turn start. `persistsAcrossCombat` survives `end_combat`. |
| `skill_challenge` | Multi-stage challenges with cumulative tracking | **Declare-once, resolve-batch**: LLM calls once with DC + stakes + allowed skills; engine rolls all party attempts, tallies S/F, applies rewards/consequences deterministically; LLM narrates the outcome. |

### Rejected New Tool

| Tool | Verdict | Reason |
|---|---|---|
| `spend_resource` | ❌ Reject | Folds into existing `RESOURCE_HANDLERS` registry (`services/resourceHandlers.ts`). Add `hit_dice`, `inspiration`, `healers_kit`, `potion_of_healing` as 4 handlers. Zero new tool, zero engine changes. |

---

## Remaining Tools (unchanged)

`add_enemy`, `end_combat`, `cast_spell`, `spell_effect`, `cast_ritual`, `manage_spellbook`, `level_up`, `use_resource`, `move_to`, `move_token`, `init_battle_map`, `narrate_turn`, `next_turn`, `roll_dice`, `player_attack`, `roll_death_save`, `update_inventory`, `adjust_currency`, `inflict_damage`

---

## Final Tool Count

| Category | Count |
|---|---|
| Current tools | 29 |
| Merges remove | −4 |
| New tools add | +6 |
| **Total** | **31** |

---

## Phase 0: Hallucination Fixes (No Schema Changes) [1 day]

**Highest ROI, zero risk. Do first regardless of anything else.**

### 0.1 Dedicated `formatToolResult` Cases

File: `services/llm/narration.ts`, function at lines 112-136.

Add dedicated slim-JSON cases for the 9 tools currently hitting the `default` case (80-char truncation):

| Tool | Slim JSON keys to emit |
|---|---|
| `spell_effect` | `tool, success, message, mode, targetSpell, affectedTargets` |
| `cast_ritual` | `tool, success, message, spell, timeAdvanced` |
| `summon_creature` | `tool, success, message, creatureName, count, creatureIds` |
| `teleport_creature` | `tool, success, message, creatureName, destination` |
| `polymorph_creature` | `tool, success, message, targetName, newForm, duration` |
| `move_token` | `tool, success, message, tokenName, fromX, fromY, toX, toY, distance, warning` |
| `init_battle_map` | `tool, success, message, label, width, height, placedTokens` |
| `level_up` | `tool, success, message, characterName, newLevel, hpChange, newSlots` |
| `narrate_turn` | `tool, success, message, timePassed, xpAwarded, suggestions` |

### 0.2 Fix `toolSuccess` Inconsistency

File: `services/llm/narration.ts`, lines 123 and 127.

Change `toolSuccess` → `success` for `check_skill` and `make_save` to match all other tools. Update any downstream parsing that reads `toolSuccess`.

### 0.3 Fix `cast_spell` Schema Bug

File: `services/llm/tools/spells.ts`.

Line 13 defines property `slotLevel` (singular). Line 25 defines `required: ['casterId', 'spellId', 'slotLevels']` (plural). The dispatch at `mcpService.ts:506` reads `args.slotLevel`. Fix: change `required` to `['casterId', 'spellId', 'slotLevel']`.

---

## Phase 1: Type System Foundation [1 day]

### 1.1 New Types (`types/game.ts`)

```typescript
interface NPC {
  id: string;
  name: string;
  type: 'ally' | 'neutral' | 'hostile';
  description?: string;
  abilities?: string[];
  spellList?: string[];
  spellcastingAbility?: 'int' | 'wis' | 'cha';
  hp?: { current: number; max: number };
  ac?: number;
  stats?: Character['stats'];
  speed?: number;
  attacks?: EnemyAttack[];
  conditions?: ActiveCondition[];
  isDead?: boolean;
  faction?: string;
  attitude?: 'friendly' | 'indifferent' | 'hostile';
}

interface ReactionTrigger {
  id: string;
  type: 'enemy_moves_away' | 'spell_cast' | 'ally_damaged' | 'ally_drops_to_0' | 'custom';
  actorId?: string;
  targetId?: string;
  range?: number;
  description?: string;
}

interface ReactionOpportunity {
  trigger: ReactionTrigger;
  availableReactions: Array<{
    characterId: string;
    reactionName: string;
    description: string;
    action: 'opportunity_attack' | 'cast_spell' | 'use_resource' | 'custom';
    spellId?: string;
    resourceId?: string;
  }>;
}

// Add to GameState:
npcs: Record<string, NPC>;
reactionTriggers: ReactionTrigger[];
pendingReaction?: ReactionOpportunity;
```

### 1.2 Updated Types (`types/combat.ts`)

```typescript
interface Enemy {
  // ... existing fields ...
  speed?: number;  // Promote from beastFields
  legendaryActions?: LegendaryAction[];
  lairActions?: LairAction[];
  spellList?: string[];
  spellcastingAbility?: 'int' | 'wis' | 'cha';
}

interface LegendaryAction {
  name: string;
  description: string;
  cost: number;
  maxPerRound: number;
}

interface LairAction {
  name: string;
  description: string;
  initiative: number;
}

// Add to CombatState:
environmentalEffects?: EnvironmentalEffect[];

interface EnvironmentalEffect {
  id: string;
  name: string;
  kind: 'terrain' | 'weather' | 'hazard' | 'zone';
  shape: 'square' | 'circle' | 'line' | 'cube';
  size: number;
  origin: { x: number; y: number };
  effects: Array<{
    kind: 'speed_mod' | 'damage' | 'condition' | 'visibility';
    amount?: number;
    damageType?: string;
    condition?: string;
    save?: { stat: string; dc: number; onSuccess: 'half' | 'none' };
  }>;
  duration: number;
  durationUnit: 'rounds' | 'minutes' | 'hours' | 'permanent';
  persistsAcrossCombat: boolean;
}

// InitiativeEntry.type: add 'ally'
type InitiativeEntryType = 'player' | 'enemy' | 'ally';
```

### 1.3 Updated Types (`types/character.ts`)

```typescript
interface Character {
  // ... existing fields ...
  bonusActionUsedThisTurn?: boolean;
  actionsUsedThisTurn?: number;
  isDodging?: boolean;
  isDisengaging?: boolean;
  hasRanThisTurn?: boolean;
  readiedTrigger?: string;
  readiedAction?: string;
  hasAdvantageThisTurn?: boolean;
  reactionUsedThisTurn?: boolean;
}
```

---

## Phase 2: Merges + Alias Dispatch [2 days]

### 2.1 `roll_d20` Schema

File: `services/llm/tools/character.ts` (new tool, adjacent to existing d20 tools).

```typescript
{
  kind: 'skill' | 'save',
  actorId: string;
  targetId?: string;

  // skill fields (kind: 'skill'):
  skill_name?: string;
  difficulty?: number;

  // save fields (kind: 'save'):
  stat?: string;
  dc?: number;
  charmSave?: boolean;

  // Shared (BRANCH_NARRATION_PROPERTIES):
  narrationOnSuccess?: string;
  narrationOnFailure?: string;
  timePassed?: number;
  suggestions?: string[];

  // onSuccess chaining (ON_SUCCESS_PROPERTIES):
  onSuccess?: {
    awardCurrency?: { gp: number; sp: number; cp: number };
    logLore?: { title: string; content: string; category: string };
    updateInventory?: { item_name: string; quantity: number };
    stabilize?: boolean;
  };
}
```

**Dispatch**: routes to `this.travel.check_skill(...)` when `kind === 'skill'`, `this.combat.make_save(...)` when `kind === 'save'`. Wrapped in `maybeFinalizeTurn` for branch finalization.

**Alias dispatch**: `check_skill` and `make_save` remain valid in `TOOL_ALIAS` table. Old calls normalize: `{ ...args, kind: 'skill' }` or `{ ...args, kind: 'save' }` then fall through to `roll_d20` case.

### 2.2 `manage_creature` Schema

File: `services/llm/tools/spells.ts` (new tool, replaces 3 inline creature tools).

```typescript
{
  action: 'summon' | 'teleport' | 'polymorph',
  casterId: string;

  // summon fields (action: 'summon'):
  creatureName?: string;
  template?: string;
  count?: number;

  // teleport fields (action: 'teleport'):
  targetId?: string;
  destination?: string;
  range?: number;

  // polymorph fields (action: 'polymorph'):
  newForm?: string;
  duration?: number;
  characterId?: string;
  targetId?: string;
  beastForm?: string;

  narration?: string;
}
```

**Dispatch**: routes to existing inline handlers in `mcpService.executeToolCall` based on `action`. Each action gets a dedicated `formatToolResult` case.

**Alias dispatch**: `summon_creature`, `teleport_creature`, `polymorph_creature` remain valid. Old calls normalize: `{ ...args, action: 'summon' }` etc.

### 2.3 `record_journal` Schema

File: `services/llm/tools/journal.ts` (new tool, replaces `upsert_quest` + `log_lore`).

```typescript
{
  kind: 'quest' | 'lore',

  // quest fields (kind: 'quest'):
  title?: string;
  description?: string;
  status?: 'active' | 'completed' | 'failed';
  difficulty?: 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
  reputationChanges?: Array<{ faction: string; amount: number }>;

  // lore fields (kind: 'lore'):
  content?: string;
  category?: 'NPC' | 'Location' | 'History' | 'Item';

  // Shared (END_OF_TURN_PROPERTIES):
  narration?: string;
  timePassed?: number;
  suggestions?: string[];
  roleplay?: 'dialogue' | 'creative';
  xp?: number;
}
```

**Dispatch**: routes to `this.content.upsert_quest(...)` when `kind === 'quest'`, `this.content.log_lore(...)` when `kind === 'lore'`. Wrapped in `maybeFinalizeTurn` for inline finalization.

**Alias dispatch**: `upsert_quest` and `log_lore` remain valid. Old calls normalize: `{ ...args, kind: 'quest' }` or `{ ...args, kind: 'lore' }`.

### 2.4 Alias Dispatch Table

File: `services/mcpService.ts`, add near the top of `executeToolCall` (before the switch at line 420).

```typescript
const TOOL_ALIAS: Record<string, { newName: string; defaults: Record<string, string> }> = {
  'check_skill': { newName: 'roll_d20', defaults: { kind: 'skill' } },
  'make_save': { newName: 'roll_d20', defaults: { kind: 'save' } },
  'upsert_quest': { newName: 'record_journal', defaults: { kind: 'quest' } },
  'log_lore': { newName: 'record_journal', defaults: { kind: 'lore' } },
  'summon_creature': { newName: 'manage_creature', defaults: { action: 'summon' } },
  'teleport_creature': { newName: 'manage_creature', defaults: { action: 'teleport' } },
  'polymorph_creature': { newName: 'manage_creature', defaults: { action: 'polymorph' } },
};

// In executeToolCall, before the switch:
if (TOOL_ALIAS[name]) {
  const alias = TOOL_ALIAS[name];
  name = alias.newName;
  args = { ...alias.defaults, ...args };
}
```

**Also update** `VALID_TOOL_NAMES` in `agentLoop.ts:25` to include both old (alias) and new names.

### 2.5 `toolFilter.ts` Updates

File: `services/llm/toolFilter.ts`.

- Replace `check_skill` + `make_save` with `roll_d20` in the always-visible list.
- Replace `upsert_quest` + `log_lore` with `record_journal` in the always-visible list.
- Replace `summon_creature` + `teleport_creature` + `polymorph_creature` with `manage_creature` in the caster-only list.

---

## Phase 3: Resource Registry Expansion [0.5 day]

File: `services/resourceHandlers.ts`.

Add 4 new handlers to the `RESOURCE_HANDLERS` registry:

```typescript
RESOURCE_HANDLERS['hit_dice'] = (ctx, characterId, targetId, amount) => {
  // Heal target for amount * character's hitDie size + CON mod
  // Consume hitDice.current by amount
};

RESOURCE_HANDLERS['inspiration'] = (ctx, characterId, targetId, amount) => {
  // Grant inspiration die (d6) to target
  // Consume inspiration resource
};

RESOURCE_HANDLERS['healers_kit'] = (ctx, characterId, targetId, amount) => {
  // Stabilize dying target (auto-success death saves)
  // Consume 1 use from inventory
};

RESOURCE_HANDLERS['potion_of_healing'] = (ctx, characterId, targetId, amount) => {
  // Heal target for potion amount (2d4+2 for standard potion)
  // Consume from inventory
};
```

Each follows the existing `RESOURCE_HANDLERS[id](ctx, characterId, targetId, amount)` signature. No new tool needed — `use_resource` already dispatches to this registry.

---

## Phase 4: New Tools [3 days]

### 4.1 `npc_action`

File: `services/llm/tools/npc.ts` (new file).

```typescript
{
  npcId: string;
  action: 'heal' | 'cast' | 'buff' | 'attack' | 'interact',
  targets?: string[];

  // heal/cast fields:
  spellId?: string;
  slotLevel?: number;

  // buff fields:
  effect?: {
    kind: 'condition' | 'temp_hp' | 'speed_mod' | 'ac_mod';
    value?: string | number;
    duration?: number;
  };

  // attack fields:
  attackIndex?: number;

  // interact fields:
  dialogue?: string;
  attitudeChange?: 'friendlier' | 'more_hostile';

  narration?: string;
  timePassed?: number;
}
```

**Dispatch**: routes to `this.npc.npcAction(...)` in `NPCService`.

**`formatToolResult`**: `tool, success, message, npcName, action, targets, result`.

**Visibility**: always visible (NPCs can act in and out of combat).

### 4.2 `combat_action`

File: `services/llm/tools/combat.ts` (new tool).

```typescript
{
  actorId: string;
  action: 'help' | 'dodge' | 'dash' | 'disengage' | 'ready' | 'grapple' | 'shove',
  targetId?: string;

  // help fields:
  helpTargetId?: string;
  helpAbility?: string;

  // ready fields:
  readiedTrigger?: string;
  readiedAction?: string;

  // grapple/shove fields:
  contestAbility?: 'athletics' | 'acrobatics';

  narration?: string;
}
```

**Dispatch**: routes to `this.combat.combatAction(...)` in `CombatService`.

**`formatToolResult`**: `tool, success, message, actorName, action, targetName, effect`.

**Visibility**: combat-only (`inCombat === true`).

### 4.3 `use_reaction`

File: `services/llm/tools/combat.ts` (new tool, alongside `combat_action`).

```typescript
{
  characterId: string;
  reaction: 'opportunity_attack' | 'cast_spell' | 'use_resource' | 'custom',
  triggerId?: string;

  // opportunity_attack fields:
  weaponName?: string;
  targetId?: string;

  // cast_spell fields:
  spellId?: string;
  targets?: string[];

  // use_resource fields:
  resourceId?: string;
  amount?: number;

  // custom fields:
  description?: string;
  effect?: { /* apply_effect style */ };

  narration?: string;
}
```

**Dispatch**: routes to `this.combat.useReaction(...)` in `CombatService`.

**Strict validation** (engine-side, returns clear failure on rejection):
1. `state.pendingReaction` must exist and match `characterId`.
2. `!character.reactionUsedThisTurn` must be true.
3. Trigger must not be expired (checked via timestamp).
4. If all pass: for `opportunity_attack`, apply the pre-computed attack result stored in the trigger. For `cast_spell`/`use_resource`, dispatch normally. Set `reactionUsedThisTurn = true`.
5. If any fail: return `{ success: false, message: 'Reaction unavailable: <specific reason>' }`.

**`formatToolResult`**: `tool, success, message, characterName, reaction, targetName, result`.

**Visibility**: combat-only.

### 4.4 `apply_effect`

File: `services/llm/tools/combat.ts` (new tool).

```typescript
{
  targetId: string;
  effects: Array<{
    kind: 'condition' | 'temp_hp' | 'speed_mod' | 'ac_mod' | 'remove_condition' | 'initiative_mod';
    condition?: string;
    duration?: number;
    durationUnit?: 'round' | 'minute' | 'hour' | 'permanent';
    saveEnd?: string;
    saveDC?: number;
    amount?: number;
    source?: string;
  }>;
  actorId?: string;
  narration?: string;
  timePassed?: number;
}
```

**Dispatch**: routes to `this.combat.applyEffect(...)` in `CombatService`.

**Boundary enforcement**: engine returns a warning if `effects[].condition` matches a condition that is typically applied by a spell (e.g., `paralyzed` from Hold Person). The LLM should use `cast_spell` for spell conditions. This is a warning, not a hard block — GM-applied conditions are allowed.

**`formatToolResult`**: `tool, success, message, targetName, effectsApplied, warnings`.

**Visibility**: always visible (GM can apply effects out of combat).

### 4.5 `environmental_effect`

File: `services/llm/tools/combat.ts` (new tool).

```typescript
{
  name: string;
  kind: 'terrain' | 'weather' | 'hazard' | 'zone',

  // area fields:
  shape: 'square' | 'circle' | 'line' | 'cube';
  size: number;
  origin: { x: number; y: number };

  // effect fields:
  effects: Array<{
    kind: 'speed_mod' | 'damage' | 'condition' | 'visibility';
    amount?: number;
    damageType?: string;
    condition?: string;
    save?: { stat: string; dc: number; onSuccess: 'half' | 'none' };
  }>;

  duration: number;
  durationUnit: 'rounds' | 'minutes' | 'hours' | 'permanent';

  narration?: string;
  timePassed?: number;
}
```

**Dispatch**: routes to `this.combat.environmentalEffect(...)` in `CombatService`.

**`formatToolResult`**: `tool, success, message, effectName, affectedTokens, duration`.

**Visibility**: always visible.

### 4.6 `skill_challenge`

File: `services/llm/tools/travel.ts` (new tool).

```typescript
{
  name: string;
  requiredSuccesses: number;
  allowedFailures: number;
  allowedSkills: string[];
  dc: number;

  onSuccess: {
    narration: string;
    xp: number;
    rewards?: Array<{ type: string; item?: string; currency?: { gp: number } }>;
  };
  onFailure: {
    narration: string;
    consequences?: Array<{ type: string; damage?: number; condition?: string }>;
  };

  narration?: string;
}
```

**Dispatch**: routes to `this.travel.resolveSkillChallenge(...)` in `TravelService`.

**Resolution model** (declare-once, resolve-batch):
1. Engine validates `requiredSuccesses` > 0, `allowedFailures` >= 0, `allowedSkills` non-empty, `dc` in valid range.
2. For each party member, engine picks their best allowed skill (highest modifier) and rolls `d20 + skillMod` vs `dc`.
3. Tally successes and failures.
4. If `successes >= requiredSuccesses`: apply `onSuccess` rewards (XP flat to party, items/currency via inventory/currency updates).
5. If `failures > allowedFailures`: apply `onFailure` consequences (damage via `inflict_damage`, conditions via `applyEffect`).
6. Return full sequence: each attempt's roll, final tally, applied rewards/consequences.
7. LLM narrates the outcome (the `onSuccess.narration` or `onFailure.narration` is provided as a hint; LLM can refine).

**`formatToolResult`**: `tool, success, message, name, successes, failures, totalAttempts, outcome, rewards, consequences`.

**Visibility**: always visible.

---

## Phase 5: Engine Mechanics [3 days]

### 5.1 Bonus Action Enforcement

File: `services/mcp/combatService.ts`, in `next_turn()`.

At the start of each character's turn:
```typescript
player.bonusActionUsedThisTurn = false;
player.actionsUsedThisTurn = 0;
player.isDodging = false;
player.isDisengaging = false;
player.hasRanThisTurn = false;
```

Tools that consume bonus action check `!character.bonusActionUsedThisTurn` and set it true on use:
- `use_resource('rage')`
- `use_resource('second-wind')`
- `use_resource('ki')` for Flurry/Patient Defense/Step of the Wind
- `combat_action` with `action: 'help'` (certain help actions are bonus)
- `roll_d20` / `player_attack` with `isOffHand: true`

### 5.2 Extra Attack Enforcement

File: `services/mcp/combatService.ts`, in `player_attack()`.

```typescript
const extraAttacks = getExtraAttackCount(character);
if (character.actionsUsedThisTurn >= extraAttacks) {
  return fail(`${character.name} has already used their attacks this turn.`);
}
character.actionsUsedThisTurn++;
```

### 5.3 Reaction System

File: `services/mcp/reactionService.ts` (new service).

```typescript
interface ReactionService {
  registerTrigger(trigger: ReactionTrigger): void;
  checkTriggers(event: { type: string; actorId: string; targetId?: string }): ReactionOpportunity | null;
  consumeReaction(characterId: string): void;
  clearPending(): void;
}
```

**Trigger checks called from:**
- `move_token` (enemy moves away → opportunity attack)
- `cast_spell` (spell cast → Counterspell opportunity)
- `inflict_damage` (ally damaged → Hellish Rebuke, Protection, Cutting Words)
- `next_turn` (ally drops to 0 → Death Ward, etc.)

**Integration with agent loop** (`services/llm/agentLoop.ts`):
1. Trigger fires during tool execution → engine augments tool result with `reactionOpportunity` field.
2. `formatToolResult` emits `REACTION OPPORTUNITY:` line in slim JSON.
3. Agent loop continues to next iteration — LLM sees opportunity in context.
4. LLM either calls `use_reaction` or ignores (trigger expires at end of current turn).
5. `next_turn` clears all `reactionTriggers` + `pendingReaction`; resets `reactionUsedThisTurn = false` for the character whose turn begins.

**Anti-infinite-loop guard:** Each reaction sets `reactionUsedThisTurn`; max 1 reaction/round/character. Triggers don't fire from reaction tool calls.

### 5.4 NPC Registry

File: `services/mcp/npcService.ts` (new service).

```typescript
interface NPCService {
  registerNPC(npc: NPC): void;
  getNPC(id: string): NPC | undefined;
  removeNPC(id: string): void;
  npcAction(npcId: string, action: string, targets: string[], params: any): MCPResponse;
  addToCombat(npcId: string): void;
  removeFromCombat(npcId: string): void;
}
```

- Combat allies roll initiative independently
- Get `type: 'ally'` in initiative order
- Can take full turns (attack, cast, etc.)

### 5.5 Inspiration Integration

File: `services/diceEngine.ts`.

```typescript
const inspirationDie = target.inspirationDice?.[0];
if (inspirationDie && shouldApplyInspiration) {
  const bonus = cryptoRoll(inspirationDie.dieSize);
  total += bonus;
  target.inspirationDice.shift();
}
```

### 5.6 Dodge/Disengage Mechanics

File: `services/mcp/combatService.ts`, in `resolveEnemySingleAttack`:

```typescript
if (target.isDodging) {
  roll2 = cryptoRoll(20);
  toHit = Math.min(roll, roll2) + modifiers;
}
```

File: `services/mcpService.ts`, in `move_token` dispatch:

```typescript
if (actor.isDisengaging) {
  // Skip opportunity attack trigger
}
```

### 5.7 Environmental Effects

- Applied at start of each affected creature's turn
- Stored in `CombatState.environmentalEffects`
- `persistsAcrossCombat: true` effects survive `end_combat`

### 5.8 Skill Challenge Resolution

File: `services/mcp/travelService.ts`, new method `resolveSkillChallenge`.

```typescript
async resolveSkillChallenge(args: {
  name: string;
  requiredSuccesses: number;
  allowedFailures: number;
  allowedSkills: string[];
  dc: number;
  onSuccess: { ... };
  onFailure: { ... };
}): Promise<MCPResponse> {
  // Validate
  // For each party member, pick best allowed skill, roll d20 + mod vs dc
  // Tally S/F
  // Apply rewards/consequences in a transaction (deep-clone snapshot; revert on failure)
  // Return full sequence
}
```

---

## Phase 6: Prompt Updates [1.5 days]

### 6.1 Rewrite `TOOL_MODE_INSTRUCTION`

File: `services/llm/prompts/toolModePrompt.ts`.

- Document all 31 tools with their schemas.
- Document the `apply_effect` vs `cast_spell` boundary explicitly: "Use `cast_spell` for spell conditions (paralyzed, stunned, charmed, etc.). Use `apply_effect` for non-spell effects: cover bonuses, environmental modifiers, lair actions, or GM-applied conditions."
- Document reaction validation rules: "`use_reaction` will fail if no trigger is pending, if the character already used their reaction this round, or if the trigger has expired. The engine returns a clear error message — adjust your call accordingly."
- Document skill_challenge semantics: "Call `skill_challenge` once to declare the challenge. The engine resolves all attempts in one call. You then narrate the outcome."
- Remove "cannot/forbidden" language for now-supported mechanics (Dodge, Help, Grapple, Shove, Ready, reactions, NPC actions, environmental effects).

### 6.2 Update `SYSTEM_INSTRUCTION`

File: `services/constants.ts`.

- Add NPC awareness: "NPCs are registered entities that can act independently. Use `npc_action` for NPC turns."
- Add reaction awareness: "When a reaction trigger fires, a REACTION OPPORTUNITY message appears. You may call `use_reaction` for any character with an available reaction."

### 6.3 Update `MULTIPLAYER_PROMPT`

File: `services/llm/prompts/multiplayerPrompt.ts`.

- Add NPC/reaction awareness for multiplayer context.
- Ensure attribution contract covers NPC actions (NPCs are not players, no `[CharName]` prefix needed).

---

## Phase 7: UI Changes [2 days]

### 7.1 New Quick Actions

File: `components/InputArea.tsx`.

Add Quick Action buttons (gated on game state, mirroring existing patterns):
- "NPC Action" → pre-fills `npc_action` template
- "Use Reaction" → pre-fills `use_reaction` template (only when `pendingReaction` exists)
- "Combat Action" → pre-fills `combat_action` template
- "Apply Effect" → pre-fills `apply_effect` template
- "Environmental Effect" → pre-fills `environmental_effect` template
- "Start Skill Challenge" → pre-fills `skill_challenge` template

### 7.2 Reaction Opportunity UI

File: `components/ChatLog.tsx` or new `components/ReactionBanner.tsx`.

When `gameState.pendingReaction` exists:
- Show a highlighted banner above the input area.
- List available reactions with "Take Reaction" buttons.
- Buttons call `use_reaction` with pre-filled parameters.

### 7.3 NPC Panel

File: `components/NPCPanel.tsx` (new component).

- Sidebar panel (desktop) / tab (mobile) showing registered NPCs.
- Each NPC card: name, type badge, HP bar, AC, conditions, actions.
- Host-only: edit/remove NPC buttons.

### 7.4 Environmental Effects Display

File: `components/BattleMapPanel.tsx`.

- Overlay environmental effects on the battle map.
- Show effect name, area shape, and affected tokens.
- Click to dismiss (if GM).

---

## Phase 8: Testing [3 days]

### 8.1 Unit Tests

- `tests/services/npcService.test.ts`
- `tests/services/reactionService.test.ts`
- `tests/services/skillChallengeService.test.ts`
- `tests/services/rollD20.test.ts`
- `tests/services/recordJournal.test.ts`
- `tests/services/combatAction.test.ts`
- `tests/services/aliasDispatch.test.ts` — every old tool name + identical args must produce byte-identical results to the new name + injected kind/action.

### 8.2 Integration Tests

- NPC cleric heals player → HP actually increases.
- Opportunity attack triggers when enemy moves away.
- Bonus action enforcement blocks second bonus action.
- Environmental effects persist across combats.
- `apply_effect` returns warning when attempting spell-typical condition.
- `use_reaction` rejects call with no pending trigger.
- `use_reaction` rejects call when character already used reaction.
- `skill_challenge` declare-once produces deterministic S/F tally + correct branch rewards.

### 8.3 Live Tests

- Full combat round with reactions.
- NPC ally in combat (healing, attacking, taking turns).
- Multi-stage skill challenge.
- Environmental effect (difficult terrain + weather) across two combats.

---

## Implementation Order & Effort

| Order | Phase | Days | Dependencies |
|---|---|---|---|
| 0 | Hallucination Fixes | 1 | None |
| 1 | Type System Foundation | 1 | None |
| 2 | Merges + Alias Dispatch | 2 | Phase 1 |
| 3 | Resource Registry Expansion | 0.5 | Phase 1 |
| 4 | New Tools | 3 | Phase 2, 3 |
| 5 | Engine Mechanics | 3 | Phase 4 |
| 6 | Prompt Updates | 1.5 | Phase 4, 5 |
| 7 | UI Changes | 2 | Phase 4, 5 |
| 8 | Testing | 3 | All previous |
| **Total** | | **~17 days** | |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reaction system infinite-loop (trigger → reaction → new trigger) | Low | Medium | Each reaction sets `reactionUsedThisTurn`; max 1 reaction/round/character. Triggers don't fire from reaction tool calls. |
| `apply_effect` / `cast_spell` overlap hallucination | Medium | Medium | Sharp prompt boundary + engine returns warning if `apply_effect` targets a condition that matches a known spell. |
| NPC initiative ordering bugs | Medium | Medium | NPC allies get `type: 'ally'`; existing `resolveEnemyTurn` logic extended, not replaced. |
| Skill challenge reward/consequence application errors | Low | High | Engine resolves in a transaction (deep-clone snapshot); on any sub-failure, reverts to pre-challenge state. |
| Bonus action false positives | Medium | Medium | Whitelist known bonus-action consumers; log but don't block unrecognized calls (fail-open, prompt-corrects). |
| Alias dispatch drift (old name behaves differently) | Low | High | Integration test: every old name + identical args must produce byte-identical results to the new name + injected kind/action. |
| Breaking saved campaigns | Low | High | Alias dispatch means old tool names remain valid forever. No history rewriting needed. |
| LLM confusion with new tools | Medium | Medium | Thorough prompt engineering, dedicated `formatToolResult` cases for all 31 tools, strict engine validation with clear error messages. |

---

## Capability Gap Coverage

| Gap | Solution |
|---|---|
| NPC healing/buffing | `npc_action` + NPC registry |
| Stabilize dying ally | `roll_d20(kind: 'skill')` with `onSuccess.stabilize` |
| Opportunity attacks | `use_reaction` + reaction trigger system |
| Help/Dodge/Dash/Disengage | `combat_action` |
| Grapple/Shove | `combat_action` with `contestAbility` |
| Ready action | `combat_action` with `readiedTrigger` |
| Concentration drop | `apply_effect(kind: 'remove_condition')` |
| Hit Dice outside short rest | `use_resource('hit_dice')` (via registry expansion) |
| Inspiration consumption | `use_resource('inspiration')` (via registry expansion) |
| Healing Kit stabilization | `use_resource('healers_kit')` (via registry expansion) |
| Potion of Healing | `use_resource('potion_of_healing')` (via registry expansion) |
| Difficult terrain | `environmental_effect(kind: 'terrain')` |
| Cover bonuses | `apply_effect(kind: 'ac_mod')` |
| Weather effects | `environmental_effect(kind: 'weather')` |
| Persistent zones | `environmental_effect` with `persistsAcrossCombat: true` |
| Skill challenges | `skill_challenge` (declare-once, resolve-batch) |
| Bonus action enforcement | Engine-side `bonusActionUsedThisTurn` tracking |
| Extra Attack enforcement | Engine-side `actionsUsedThisTurn` tracking |
| Legendary actions | `Enemy.legendaryActions` + `next_turn` logic |
| Lair actions | `Enemy.lairActions` + initiative count logic |
| `formatToolResult` blindness (9 tools) | Dedicated cases for all 31 tools (Phase 0 + Phase 4) |

---

## Open Items (Watch During Implementation)

1. **`move_token` + `init_battle_map` merge?** Currently both hit `formatToolResult` default and are grid-only. Could merge to `manage_map(action:)`. Left separate in this plan — marginal benefit, low call frequency. Revisit if you want one more reduction.

2. **Legendary/Lair actions:** Types added in Phase 1, but the `next_turn` logic to execute them is Phase 5 scope. If time-boxed, these can slip to a follow-up without breaking anything (they just won't fire).

3. **Mystic Arcanum** (warlock 6th–9th): Still unimplemented per AGENTS.md. Not in this overhaul — separate gap.

4. **`roll_dice` vestigial status:** The AGENTS.md notes "Vestigial attack params removed." Still used for ad-hoc rolls (random tables, stat rolling). Monitor usage — if the LLM never calls it after this overhaul, it's a candidate for removal in a future cleanup.

5. **`spell_effect` boundary:** Currently only supports `mode: 'counter'` (Counterspell/Dispel Magic). With `use_reaction` covering Counterspell as a reaction, consider whether `spell_effect` should also support `mode: 'dispel'` for non-reaction Dispel Magic. Out of scope for this overhaul.
