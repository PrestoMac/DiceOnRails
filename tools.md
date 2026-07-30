# Tool System Overhaul Plan

## Executive Summary

**Current state:** 27 tools, rigid boundaries, major capability gaps (NPC actions, reactions, conditions, environmental effects, skill challenges).

**Target state:** 25 unified tools with `kind` parameters, full NPC support (temporary + combat allies), complete reaction system, bonus action enforcement, and all missing D&D 5e mechanics.

**Net change:** -12 tools removed, +10 new tools added = **25 tools total** (7% reduction, 100% increase in capability surface).

---

## Tool Consolidation Map

| Removed Tools (12) | Replaced By | Kind/Action Values |
|-------------------|-------------|-------------------|
| `update_inventory`, `adjust_currency`, `upsert_quest`, `log_lore` | `record_outcome` | `kind: 'inventory' \| 'currency' \| 'quest' \| 'lore'` |
| `check_skill`, `make_save`, `player_attack`, `roll_death_save`, `roll_dice` | `roll_check` | `kind: 'attack' \| 'skill' \| 'save' \| 'death_save' \| 'ability' \| 'contest'` |
| `summon_creature`, `teleport_creature`, `polymorph_creature` | `manage_creature` | `action: 'summon' \| 'teleport' \| 'polymorph' \| 'command'` |

## New Tools (10)

| Tool | Purpose |
|------|---------|
| `npc_action` | NPC healing, buffing, attacking, casting on PCs |
| `combat_action` | Help, Dodge, Dash, Disengage, Ready, Grapple, Shove |
| `use_reaction` | Opportunity attacks, generic reaction abilities |
| `apply_effect` | Conditions, temp HP, speed/AC modifiers, concentration drop |
| `spend_resource` | Hit Dice, Inspiration dice, Healing Kits, potions |
| `environmental_effect` | Terrain, weather, hazards, persistent zones |
| `skill_challenge` | Multi-stage challenges with cumulative tracking |
| `start_combat` | (unchanged) |
| `narrate_turn` | (unchanged) |
| `next_turn` | (unchanged) |

## Remaining Tools (unchanged)

`add_enemy`, `end_combat`, `cast_spell`, `spell_effect`, `cast_ritual`, `manage_spellbook`, `level_up`, `use_resource`, `move_to`, `move_token`, `init_battle_map`

---

## Phase 1: Type System Foundation (1 day)

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
}
```

---

## Phase 2: Tool Consolidation (2 days)

### 2.1 `record_outcome` Schema

```typescript
{
  kind: 'inventory' | 'currency' | 'quest' | 'lore',
  
  // inventory fields:
  items?: Array<{
    name: string;
    action: 'add' | 'remove' | 'edit';
    quantity?: number;
    type?: string;
    rarity?: string;
    description?: string;
    cost_gp?: number;
    cost_sp?: number;
    cost_cp?: number;
    equipped?: boolean;
    craft?: boolean;
  }>,
  autoDeductMarketPrice?: boolean;
  
  // currency fields:
  gp?: number;
  sp?: number;
  cp?: number;
  targetId?: string;
  
  // quest fields:
  title?: string;
  description?: string;
  status?: 'active' | 'completed' | 'failed';
  difficulty?: 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
  reputationChanges?: Array<{ faction: string; amount: number }>;
  
  // lore fields:
  content?: string;
  category?: 'NPC' | 'Location' | 'History' | 'Item';
  
  // Shared (END_OF_TURN_PROPERTIES):
  narration?: string;
  timePassed?: number;
  suggestions?: string[];
  xp?: number;
}
```

### 2.2 `roll_check` Schema

```typescript
{
  kind: 'attack' | 'skill' | 'save' | 'death_save' | 'ability' | 'contest',
  actorId: string;
  targetId?: string;
  
  // attack fields:
  weaponName?: string;
  isOffHand?: boolean;
  isSneakAttack?: boolean;
  sharpshooter?: boolean;
  greatWeaponMaster?: boolean;
  divineSmite?: { slotLevel: number };
  isReaction?: boolean;
  
  // skill fields:
  skill_name?: string;
  difficulty?: number;
  
  // save fields:
  stat?: string;
  dc?: number;
  charmSave?: boolean;
  
  // ability fields:
  ability?: string;
  
  // contest fields:
  opposedBy?: string;
  
  // Shared extension mechanisms:
  narrationOnSuccess?: string;
  narrationOnFailure?: string;
  timePassed?: number;
  suggestions?: string[];
  onSuccess?: {
    awardCurrency?: { gp: number; sp: number; cp: number };
    logLore?: { title: string; content: string; category: string };
    updateInventory?: { items: [...] };
    stabilize?: boolean;
  };
}
```

### 2.3 `manage_creature` Schema

```typescript
{
  action: 'summon' | 'teleport' | 'polymorph' | 'command',
  casterId: string;
  
  // summon fields:
  creatureName?: string;
  template?: string;
  count?: number;
  
  // teleport fields:
  targetId?: string;
  destination?: string;
  range?: number;
  
  // polymorph fields:
  newForm?: string;
  duration?: number;
  
  // command fields:
  command?: 'attack' | 'defend' | 'move' | 'cast' | 'help';
  targetId?: string;
  spellId?: string;
  
  narration?: string;
}
```

---

## Phase 3: New Tools (3 days)

### 3.1 `npc_action`

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

### 3.2 `combat_action`

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

### 3.3 `use_reaction`

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

### 3.4 `apply_effect`

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

### 3.5 `spend_resource`

```typescript
{
  characterId: string;
  resource: 'hit_dice' | 'inspiration' | 'healers_kit' | 'potion_of_healing',
  amount?: number;
  targetId?: string;
  
  narration?: string;
}
```

### 3.6 `environmental_effect`

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

### 3.7 `skill_challenge`

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
  
  progress?: {
    successes: number;
    failures: number;
    attempts: Array<{ characterId: string; skill: string; roll: number; success: boolean }>;
  };
  
  narration?: string;
}
```

---

## Phase 4: Engine Changes (3 days)

### 4.1 Bonus Action Enforcement

**`combatService.next_turn`:**
```typescript
// At start of each character's turn:
player.bonusActionUsedThisTurn = false;
player.actionsUsedThisTurn = 0;
player.isDodging = false;
player.isDisengaging = false;
player.hasRanThisTurn = false;
```

**Tools that consume bonus action** check `!character.bonusActionUsedThisTurn`:
- `use_resource('rage')`
- `use_resource('second-wind')`
- `use_resource('ki')` for Flurry/Patient Defense/Step of the Wind
- `combat_action` with certain actions
- `roll_check` with `isOffHand: true`

### 4.2 Extra Attack Enforcement

**`combatService.player_attack`:**
```typescript
const extraAttacks = getExtraAttackCount(character);
if (character.actionsUsedThisTurn >= extraAttacks) {
  return fail(`${character.name} has already used their attacks this turn.`);
}
character.actionsUsedThisTurn++;
```

### 4.3 Reaction System

**New `services/mcp/reactionService.ts`:**
```typescript
interface ReactionService {
  registerTrigger(trigger: ReactionTrigger): void;
  checkTriggers(event: { type: string; actorId: string; targetId?: string }): ReactionOpportunity | null;
  consumeReaction(characterId: string): void;
}

// Trigger checks called from:
// - move_token (enemy moves away → opportunity attack)
// - cast_spell (spell cast → Counterspell opportunity)
// - inflict_damage (ally damaged → Hellish Rebuke, Protection, Cutting Words)
// - next_turn (ally drops to 0 → Death Ward, etc.)
```

**LLM flow:**
1. Trigger fires → engine pauses, adds SYSTEM message: "Reaction opportunity: [details]"
2. LLM can call `use_reaction` for any character with `reactionAvailable`
3. If LLM doesn't respond (or calls other tools first), trigger expires at end of current turn
4. Timeout: shares 60s turn processing timeout

### 4.4 NPC Registry

**New `services/mcp/npcService.ts`:**
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

### 4.5 Inspiration Integration

**`diceEngine.ts`:**
```typescript
const inspirationDie = target.inspirationDice?.[0];
if (inspirationDie && shouldApplyInspiration) {
  const bonus = cryptoRoll(inspirationDie.dieSize);
  total += bonus;
  target.inspirationDice.shift();
}
```

### 4.6 Dodge/Disengage Mechanics

**`combatService.resolveEnemySingleAttack`:**
```typescript
if (target.isDodging) {
  roll2 = cryptoRoll(20);
  toHit = Math.min(roll, roll2) + modifiers;
}
```

**`move_token`:**
```typescript
if (actor.isDisengaging) {
  // Skip opportunity attack trigger
}
```

### 4.7 Environmental Effects

- Applied at start of each affected creature's turn
- Stored in `CombatState.environmentalEffects`
- `persistsAcrossCombat: true` effects survive `end_combat`

---

## Phase 5: Prompt Updates (1 day)

- Rewrite `TOOL_MODE_INSTRUCTION` with new unified tools
- Document NPC actions, reaction system, bonus action enforcement
- Remove all "cannot" / "forbidden" language for now-supported mechanics
- Update `SYSTEM_INSTRUCTION` and `MULTIPLAYER_PROMPT`

---

## Phase 6: UI Changes (2 days)

- New Quick Actions: NPC Action, Use Reaction, Combat Action, Apply Effect, Spend Resource, Start Skill Challenge
- Reaction opportunity UI (SYSTEM message + highlighted button)
- NPC Panel (sidebar showing registered NPCs)
- Environmental effects display in battle map

---

## Phase 7: Migration Script (1 day)

**Location:** `hooks/useGameState.ts` inside `loadGameData`, after the `actionQueue` migration block.

```typescript
const TOOL_MIGRATION: Record<string, { newName: string; kind?: string; action?: string }> = {
  'update_inventory': { newName: 'record_outcome', kind: 'inventory' },
  'adjust_currency': { newName: 'record_outcome', kind: 'currency' },
  'upsert_quest': { newName: 'record_outcome', kind: 'quest' },
  'log_lore': { newName: 'record_outcome', kind: 'lore' },
  'check_skill': { newName: 'roll_check', kind: 'skill' },
  'make_save': { newName: 'roll_check', kind: 'save' },
  'player_attack': { newName: 'roll_check', kind: 'attack' },
  'roll_death_save': { newName: 'roll_check', kind: 'death_save' },
  'roll_dice': { newName: 'roll_check', kind: 'ability' },
  'summon_creature': { newName: 'manage_creature', action: 'summon' },
  'teleport_creature': { newName: 'manage_creature', action: 'teleport' },
  'polymorph_creature': { newName: 'manage_creature', action: 'polymorph' },
};

for (const msg of migratedMessages) {
  if (msg.role === MessageRole.MODEL && msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      const migration = TOOL_MIGRATION[tc.name];
      if (migration) {
        const args = JSON.parse(tc.arguments);
        if (migration.kind) args.kind = migration.kind;
        if (migration.action) args.action = migration.action;
        tc.name = migration.newName;
        tc.arguments = JSON.stringify(args);
      }
    }
  }
}
```

---

## Phase 8: Testing (3 days)

### Unit Tests
- `tests/services/npcService.test.ts`
- `tests/services/reactionService.test.ts`
- `tests/services/skillChallengeService.test.ts`
- `tests/services/rollCheck.test.ts`
- `tests/services/recordOutcome.test.ts`
- `tests/services/combatAction.test.ts`

### Integration Tests
- NPC cleric heals player → HP actually increases
- Opportunity attack triggers when enemy moves away
- Bonus action enforcement blocks second bonus action
- Environmental effects persist across combats

### Live Tests
- Full combat round with reactions
- NPC ally in combat (healing, attacking, taking turns)
- Multi-stage skill challenge

---

## Implementation Order & Effort

| Order | Phase | Days | Dependencies |
|-------|-------|------|--------------|
| 1 | Type System Foundation | 1 | None |
| 2 | Tool Consolidation | 2 | Phase 1 |
| 3 | New Tools (core) | 3 | Phase 1, 2 |
| 4 | Engine Changes | 3 | Phase 1, 2, 3 |
| 5 | Remaining New Tools | 2 | Phase 3, 4 |
| 6 | Prompt Updates | 1 | Phase 2-5 |
| 7 | UI Changes | 2 | Phase 3-5 |
| 8 | Migration Script | 1 | Phase 2 |
| 9 | Testing | 3 | All previous |
| **Total** | | **~18 days** | |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Breaking saved campaigns | High | High | One-time migration script rewrites tool names in message history |
| LLM confusion with fewer tools | Medium | Medium | Thorough prompt engineering, `oneOf` JSON schemas |
| Reaction system performance | Low | Medium | Limit concurrent triggers, timeout after 1 round |
| NPC registry bloat | Medium | Low | Auto-cleanup NPCs not used in 10 turns |
| Bonus action enforcement false positives | Medium | Medium | Whitelist known bonus actions, log violations |

---

## Capability Gap Coverage

| Gap | Solution |
|-----|----------|
| NPC healing/buffing | `npc_action` + NPC registry |
| Stabilize dying ally | `roll_check` (kind: 'skill') with `onSuccess.stabilize` |
| Opportunity attacks | `use_reaction` + reaction trigger system |
| Help/Dodge/Dash/Disengage | `combat_action` |
| Grapple/Shove | `roll_check` (kind: 'contest') |
| Ready action | `combat_action` with `readiedTrigger` |
| Concentration drop | `apply_effect` (kind: 'remove_condition') |
| Hit Dice outside short rest | `spend_resource` (resource: 'hit_dice') |
| Inspiration consumption | `spend_resource` (resource: 'inspiration') |
| Healing Kit stabilization | `spend_resource` (resource: 'healers_kit') |
| Difficult terrain | `environmental_effect` (kind: 'terrain') |
| Cover bonuses | `apply_effect` (kind: 'ac_mod') |
| Weather effects | `environmental_effect` (kind: 'weather') |
| Persistent zones | `environmental_effect` with `persistsAcrossCombat: true` |
| Skill challenges | `skill_challenge` |
| Bonus action enforcement | Engine-side `bonusActionUsedThisTurn` tracking |
| Extra Attack enforcement | Engine-side `actionsUsedThisTurn` tracking |
| Legendary actions | `Enemy.legendaryActions` + `next_turn` logic |
| Lair actions | `Enemy.lairActions` + initiative count logic |
