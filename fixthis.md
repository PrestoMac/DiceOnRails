# Dice On Rails — Full Cleanup Instructions

## Ground Rules

1. **One phase at a time.** Run `npm test` after each phase. Never commit with failing tests.
2. **Commit after each phase** with `[GREEN]` prefix (all phases are fixes, not new features).
3. **If a phase gets complex, split into multiple commits.** The commit-msg hook requires `[RED]` or `[GREEN]` when mixing test and source files — you'll almost always be `[GREEN]` here.
4. **Bypass pre-commit with `--no-verify` if lint gripes about something unrelated** to your change. Don't let lint noise block a bugfix.

---

## Phase 0 — Fix the 3 Unfixed Criticals

### Step 0.1 — C3: Tool results orphaned in LLM history

**Files:** `types/common.ts`, `services/llm/llmApiClient.ts`

**What to do:**

1. In `types/common.ts`, add a `toolCalls` field to the `Message` interface (line 68):
```ts
export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  senderName?: string;
  timestamp: number;
  isToolCall?: boolean;
  toolCallId?: string;
  rollData?: RollData;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}
```

2. In `services/llm/llmApiClient.ts`, replace `mapHistoryToMessages` entirely:

```ts
export function mapHistoryToMessages(history: Message[]) {
  const result: Array<{
    role: string;
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  }> = [];

  let i = 0;
  while (i < history.length) {
    const msg = history[i];

    if (msg.role === MessageRole.TOOL) {
      // Skip orphan tool messages — they'll be attached to their parent assistant
      i++;
      continue;
    }

    const entry: (typeof result)[number] = {
      role: (msg.role === MessageRole.MODEL ? 'assistant'
        : msg.role === MessageRole.SYSTEM ? 'system'
        : 'user') as string,
      content:
        msg.role === MessageRole.USER && msg.senderName && msg.senderName !== 'You'
          ? `[${msg.senderName}]: ${msg.text}`
          : msg.text || '',
    };

    // If this assistant message has tool_calls, emit them and collect the tool results
    if (msg.role === MessageRole.MODEL && msg.toolCalls && msg.toolCalls.length > 0) {
      entry.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
      result.push(entry);

      // Emit the tool result messages that follow
      let j = i + 1;
      while (j < history.length && history[j].role === MessageRole.TOOL) {
        result.push({
          role: 'tool',
          content: history[j].text,
          tool_call_id: history[j].toolCallId || history[j].id,
        });
        j++;
      }
      i = j;
    } else {
      result.push(entry);
      i++;
    }
  }

  return result;
}
```

3. In `services/llm/agentLoop.ts`, after `runAgentLoop` returns its `toolMessages`, the caller needs to insert synthetic model messages with `toolCalls` before each contiguous block of tool messages. Find where the tool messages are spread into the persisted messages array (currently in `hooks/useGameActions.ts` in both `handleSendMessage` and `handleExecuteBatch`), and add a helper:

```ts
function insertToolCallMessages(
  messages: Message[],
  toolMessages: Message[],
  syntheticModelId: string
): Message[] {
  const result: Message[] = [];
  let i = 0;
  while (i < toolMessages.length) {
    const batch: Message[] = [];
    while (i < toolMessages.length && toolMessages[i].role === MessageRole.TOOL) {
      batch.push(toolMessages[i]);
      i++;
    }
    if (batch.length > 0) {
      const toolCalls = batch
        .filter((m) => m.toolCallId)
        .map((m) => ({
          id: m.toolCallId!,
          name: 'tool_call',
          arguments: '{}',
        }));
      if (toolCalls.length > 0) {
        result.push({
          id: `${syntheticModelId}-tc-${i}`,
          role: MessageRole.MODEL,
          text: '',
          timestamp: Date.now(),
          toolCalls,
        });
      }
      result.push(...batch);
    }
  }
  return result;
}
```

Then insert the returned messages where toolMessages are currently appended (around lines 120-130 and 265-280 in `useGameActions.ts`).

---

### Step 0.2 — C5: Exhaustion cleared on 0-HP characters

**File:** `services/mcp/travelService.ts`, lines 637-668

**Current code (637-639) — DELETE these lines:**

```ts
for (const char of state.party) {
  if (char.conditions) char.conditions = char.conditions.filter(c => !c.id.startsWith('exhaustion-'));
}
```

Move the exhaustion-clear logic into the HP-gated loop that starts at line 664. It should become:

```ts
for (const char of state.party) {
  if (char.hp.current <= 0) {
    messages.push(`${char.name} is unconscious and cannot benefit from the rest.`);
    continue;
  }
  // Exhaustion clear moved here — only for conscious characters
  if (char.conditions) char.conditions = char.conditions.filter(c => !c.id.startsWith('exhaustion-'));
  // ... rest of existing healing logic (lines 669+) ...
}
```

---

### Step 0.3 — C8: `handleExecuteBatch` calls `rollbackTransaction()` without `beginTransaction()`

**File:** `hooks/useGameActions.ts`, lines 234-297

**Fix two insertions:**

1. After line 242 (`mcpServer.loadState(lockedState)`), add:
```ts
mcpServer.beginTransaction();
```

2. After line 263 (`const result = await runAgentLoop(...)`), add:
```ts
mcpServer.commitTransaction();
```

Don't remove the `rollbackTransaction()` call in the catch block (line 289) — it becomes a valid cleanup path now.

---

## Phase 1 — Centralize Duplicated Logic

### Step 1.1 — `ensureCharacterFields()` → shared helper

**Files:** `services/mcp/stateService.ts:46-65`, `services/mcp/travelService.ts:64-83`

1. Create `services/characterUtils.ts`:

```ts
import { Character } from '../types';

export function ensureCharacterFields(char: Character): void {
  char.hitDice ??= { current: char.level, max: char.level };
  char.feats ??= [];
  char.featSelections ??= [];
  char.featChoices ??= {};
  char.pendingFeatChoice ??= false;
  if (char.class) char.class = char.class.toLowerCase();
  if (char.race) char.race = char.race.toLowerCase();
  char.resources ??= [];
  char.knownSpells ??= [];
  char.preparedSpells ??= [];
  char.racialTraits ??= [];
  char.unlockedSubclassFeatures ??= [];
  char.pendingSubclassFeature ??= false;
  if (!char.conditionsImmunities && (char.racialTraits || []).includes('fey-ancestry')) {
    char.conditionsImmunities = ['unconscious'];
  }
}

export function ensureAllCharacterFields(party: Character[]): void {
  for (const char of party) ensureCharacterFields(char);
}
```

2. In `stateService.ts`, delete the inline `ensureCharacterFields` (lines 46-65). Import `ensureAllCharacterFields` and replace the call at line 93 with it.
3. In `travelService.ts`, delete the inline `ensureCharacterFields` (lines 64-83). Import `ensureAllCharacterFields` and replace the call at line 629 with it.
4. In `stateService.ts`, update the `StateService` interface to reference the imported function instead of an inline method. The property `ensureCharacterFields` on the returned object should point to the shared import.

---

### Step 1.2 — Death saves → one function

**Files:** `services/combatEngine.ts:204-216` (has exhaustion penalty), `services/mcp/combatService.ts:710-749` (DOES NOT have exhaustion penalty — divergence)

1. Add a `rollDeathSave` function to `services/diceEngine.ts` (or if one already exists, make it the canonical version):

```ts
import { Character, CombatState } from '../types';
import { cryptoRoll } from '../utils/random';
import { getExhaustionPenalty } from './conditionEngine';

export function rollDeathSave(ch: Character, cs?: CombatState): {
  message: string; roll: number; total: number; successes: number;
  failures: number; isStable: boolean; revived: boolean; died: boolean;
} {
  if (!ch.deathSaves) ch.deathSaves = { successes: 0, failures: 0, isStable: false };
  const s = ch.deathSaves;
  if (s.isStable) {
    return { message: `${ch.name} is stable.`, roll: 0, total: 0, successes: s.successes, failures: s.failures, isStable: true, revived: false, died: false };
  }
  const rawRoll = cryptoRoll(20);
  const total = rawRoll - getExhaustionPenalty(ch);
  if (rawRoll === 20) {
    ch.hp.current = 1;
    ch.deathSaves = { successes: 0, failures: 0, isStable: false };
    if (cs) updateCombatantDeathStatus(cs, ch.id, false);
    return { message: `${ch.name} rolls DEATH SAVE: **Natural 20!** Revived with 1 HP!`, roll: rawRoll, total, successes: 0, failures: 0, isStable: false, revived: true, died: false };
  }
  if (total >= 10) {
    s.successes++;
    if (s.successes >= 3) s.isStable = true;
    return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${s.successes >= 3 ? '3 successes! Stabilized.' : `Success (${s.successes}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: s.isStable, revived: false, died: false };
  }
  s.failures++;
  const dead = s.failures >= 3;
  if (dead && cs) updateCombatantDeathStatus(cs, ch.id, true);
  return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${dead ? `3 failures! **${ch.name} has died.**` : `Failure (${s.failures}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: false, revived: false, died: dead };
}
```

(If `updateCombatantDeathStatus` is imported from `combatEngine.ts`, this creates a circular dependency. Move `updateCombatantDeathStatus` and `ensureDeathSaves` into `services/characterUtils.ts` or `services/conditionEngine.ts` instead.)

2. In `combatEngine.ts:204-216`, replace the body with `return rollDeathSave(ch, cs)`.
3. In `combatService.ts:710-749`, replace the body with `return rollDeathSave(ch, cs)`.
4. After this, `getExhaustionPenalty` is applied in both paths (previously only in combatEngine). Run the death-save tests to confirm.

---

### Step 1.3 — Advantage/disadvantage → one function

**Files:** `combatService.ts:93-110`, `:571-582`, `:887-889`, `travelService.ts:193-211`

1. Add to `services/conditionEngine.ts` or `utils/combatUtils.ts`:

```ts
export function resolveAdvantage(
  roll1: number,
  roll2: number,
  hasAdvantage: boolean,
  hasDisadvantage: boolean
): { roll: number; hadAdvantage: boolean; hadDisadvantage: boolean } {
  if (hasAdvantage && hasDisadvantage) {
    return { roll: roll1, hadAdvantage: false, hadDisadvantage: false };
  }
  if (hasAdvantage) {
    return { roll: Math.max(roll1, roll2), hadAdvantage: true, hadDisadvantage: false };
  }
  if (hasDisadvantage) {
    return { roll: Math.min(roll1, roll2), hadAdvantage: false, hadDisadvantage: true };
  }
  return { roll: roll1, hadAdvantage: false, hadDisadvantage: false };
}
```

2. Replace the 4 inline advantage-resolution blocks with `resolveAdvantage(roll, secondRoll, adv, dis)`.

---

### Step 1.4 — Condition `onRemove` cleanup → one helper

**Files:** `conditionEngine.ts` (lines 47-52, 79-85, 109-113, 139-144), `spellcastingEngine.ts` (lines 476-486, 496-506)

1. In `services/conditionEngine.ts`, add:

```ts
export function executeConditionOnRemove(target: Target, condition: ActiveCondition): void {
  if (!condition.onRemove) return;
  if (typeof condition.onRemove === 'function') {
    condition.onRemove(target);
  } else if (condition.onRemove.kind === 'acBonus') {
    target.acBonus = Math.max(0, (target.acBonus || 0) - condition.onRemove.value);
  }
}
```

2. Replace every `if (cond.onRemove) { if (typeof cond.onRemove === 'function') ... }` pattern in `conditionEngine.ts` with `executeConditionOnRemove(target, cond)`.
3. Export and use in `spellcastingEngine.ts` too.

**There are 5 instances total.** Use `rg 'onRemove.*function\|typeof.*onRemove' --type ts` to find them all.

---

## Phase 2 — Unify the Damage Pipeline

### Step 2.1 — Route everything through `inflict_damage`

**Files:** `services/mcp/inventoryService.ts` (canonical `inflict_damage`), `services/mcp/combatService.ts` (`enemy_attack`), `services/combatEngine.ts` (`resolveEnemySingleAttack`)

1. In `inventoryService.ts`, add an `options` parameter to `inflict_damage`:

```ts
async inflict_damage(
  amount: number,
  targetId?: string,
  damageType?: string,
  options?: { skipTargetDerivedReductions?: boolean }
): Promise<MCPResponse> {
```

Inside the function, wrap the HAM check, temp HP subtraction, and resistance/immunity/vulnerability logic in `if (!options?.skipTargetDerivedReductions) { ... }`. Always run the death save logic and concentration break regardless.

2. In `resolveEnemySingleAttack` (`combatEngine.ts:114-143`), replace direct HP mutation with a call to `inflict_damage`. Since `combatEngine.ts` is a separate module, you'll need to import the service. Make it async:

```ts
export async function resolveEnemySingleAttack(...): Promise<{...}> {
  // ... attack roll logic stays ...
  const dmgResult = await inflict_damage(dmg, target.id, atk.damageType, { skipTargetDerivedReductions: true });
  // ... return shape stays ...
}
```

3. In `combatService.ts` (`enemy_attack`), do the same — call `this.inflict_damage(...)` instead of direct mutation.

4. Trace the call chain:
   - `resolveEnemySingleAttack` → made async
   - `resolveEnemySingleTurn` (line 146) → call is now `await`, so make this async
   - `resolveAllEnemyTurns` (line 155) → call is now `await`, so make this async
   - Callers in `combatService.ts` (`next_turn`, `enemy_attack`) → already async

5. After routing, delete the now-unused direct damage mutation code (the HP subtraction and death-save-manual blocks in both files).

---

### Step 2.2 — Extract dice parsing to shared helper

**Files:** `combatService.ts:913-978` (player_attack), `spellcastingEngine.ts:260-280` (spell damage), `combatEngine.ts:131-133` (enemy)

1. In `utils/dice.ts`, add:

```ts
export interface ParsedDamageRoll {
  count: number;
  sides: number;
  flatBonus: number;
}

export function parseDamageDice(diceStr: string): ParsedDamageRoll | null {
  const m = diceStr.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!m) return null;
  return {
    count: parseInt(m[1], 10),
    sides: parseInt(m[2], 10),
    flatBonus: parseInt(m[3] || '0', 10),
  };
}

export function rollDamage(parsed: ParsedDamageRoll, dieRoller: (sides: number) => number): number {
  let total = 0;
  for (let i = 0; i < parsed.count; i++) total += dieRoller(parsed.sides);
  return total + parsed.flatBonus;
}
```

2. Replace all inline regex `match(/(\d+)d(\d+)([+-]\d+)?/)` calls with `parseDamageDice`.

---

## Phase 3 — Kill `JSON.parse(JSON.stringify(...))`

### Step 3.1 — Create `utils/clone.ts`

```ts
/**
 * Deep clones a value via JSON round-trip.
 * Loses: undefined, Date, Map, Set, RegExp, functions.
 * If you need those preserved, use deepCloneWith.
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep clone with a revive callback to restore non-serializable fields
 * that JSON.round-trip destroys.
 */
export function deepCloneWith<T>(obj: T, revive: (cloned: T) => void): T {
  const cloned = deepClone(obj);
  revive(cloned);
  return cloned;
}
```

### Step 3.2 — Replace all ~20 occurrences

Search: `rg 'JSON\.parse\(JSON\.stringify\(' --type ts`

Expected file list:
- `services/mcp/stateService.ts` (7-8 uses: line 129, 134, 144, 148, 153, 154, 162, 171, 175)
- `hooks/useGameActions.ts` (the `JSON.parse(JSON.stringify(...))` around line 130-140 for state snapshots)
- Any test files that use this pattern for fixture cloning

Replace each `JSON.parse(JSON.stringify(x))` with `deepClone(x)`.

### Step 3.3 — Fix the `onRemove` serialization problem

The `onRemove` field (`ActiveCondition.onRemove`) is typed as `((target: Character | Enemy) => void) | RemoveEffect`. Functions cannot survive JSON. After every `deepClone()` replacement, any condition with a function-form `onRemove` will have it silently stripped.

**Audit:**

Search for all places that create `ActiveCondition` objects with an `onRemove` field:
```bash
rg 'onRemove:' --type ts
```

For each match:
1. If the value is `{ kind: 'acBonus', value: number }` — it survives JSON fine. No change needed.
2. If the value is a function — convert it to a `RemoveEffect` data structure.

If you find that no caller actually uses the function form, remove it from the type entirely:

```ts
// In types/character.ts
export interface ActiveCondition {
  // ...
  onRemove?: RemoveEffect;  // was: ((target) => void) | RemoveEffect
}
```

Then simplify `executeConditionOnRemove` (from Step 1.4) to remove the `typeof` check:

```ts
export function executeConditionOnRemove(target: Target, condition: ActiveCondition): void {
  if (!condition.onRemove) return;
  if (condition.onRemove.kind === 'acBonus') {
    target.acBonus = Math.max(0, (target.acBonus || 0) - condition.onRemove.value);
  }
}
```

### Step 3.4 — Add a prevention grep

In `package.json` `"scripts"` section, add:

```json
"check:jsonclone": "rg -n 'JSON\\.parse\\(JSON\\.stringify\\(' --type ts || echo '0 matches'"
```

Run it periodically. Any new `JSON.parse(JSON.stringify(...))` is a code review smell.

---

## Phase 4 — Enable Strict Types

### Step 4.1 — Tighten ESLint rules

**File:** `.eslintrc.cjs`

Change:
```js
'@typescript-eslint/no-explicit-any': 'warn',
'@typescript-eslint/no-non-null-assertion': 'warn',
```

To:
```js
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/no-non-null-assertion': 'error',
```

**Remove the test-file overrides** for these two rules (lines 38-39 in `.eslintrc.cjs`):

```js
// DELETE these lines:
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/no-non-null-assertion': 'error',
```

Tests should follow the same rules. Use `// eslint-disable-next-line` with a comment when a test genuinely needs `any`.

### Step 4.2 — Fix every lint error

Run `npm run lint:fix` first (auto-fixes what it can). Then `npm run lint` for remaining errors.

**Known breakage points:**

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `types/character.ts` | 219 | `featChoices?: Record<string, Record<string, any>>` | Change `any` to `unknown`. Add type guard where consumed. |
| `services/mcp/spellcastingService.ts` | 378 | `(result as unknown as { appliedConditions: unknown[] })` | Add `appliedConditions` to the `engineCastSpell` return type. Remove the cast. |
| `services/mcp/spellcastingService.ts` | 175 | `(entity as unknown as { ac?: number })?.ac` | Either add `ac` to the entity type or add an `ac` field to the enrichment result type. |
| `services/llm/agentLoop.ts` | 181-184 | `as { function: { name: string; ... } }` | Type the filtered tools array properly through the tool definitions. |
| `services/combatEngine.ts` | 219 | `target.stats as Record<string, number>` | Use `as SaveStat` key access or a proper indexed type. |

### Step 4.3 — Run `npx tsc --noEmit`

Fix any type errors the linter didn't catch. Common categories:
- Implicit `any` on function parameters
- Index access on objects without index signatures
- Null checks on optional chaining results

---

## Phase 5 — Pact Magic Support

### Step 5.1 — Detect warlock in slot lookup

**File:** `services/spellcastingEngine.ts`, lines 9-11

```ts
function findSpellSlot(character: Character, level: number) {
  if (character.class === 'warlock') {
    return (character.resources ?? []).find(r => r.id === 'pactMagic');
  }
  return (character.resources ?? []).find(r => r.id === `spell-slot-${level}`);
}
```

This works because Warlocks have a single resource `pactMagic.current` instead of per-level spell slots. `getSpellSlot` and `hasSpellSlot` both check `r.current > 0` — still correct. `consumeSpellSlot` decrements `r.current` — still correct for a unified pool.

The pact slot level is determined by warlock level, not by resource. If Warlocks need to cast spells above their pact slot level, add a check:

```ts
function getMaxPactSlotLevel(character: Character): number {
  if (character.class !== 'warlock') return 0;
  if (character.level >= 17) return 5;
  if (character.level >= 11) return 4;
  if (character.level >= 9) return 3;
  if (character.level >= 5) return 2;
  if (character.level >= 3) return 1;
  return 0; // warlocks don't get pact slots until level 2 technically
}
```

Then in `cast_spell` (`spellcastingService.ts`), validate that `slotLevel <= getMaxPactSlotLevel(char)` for warlocks.

### Step 5.2 — Cover in tests

In `tests/` (likely `tests/live/scenarios/`), add a test:

```ts
it('warlock can cast using pact magic', async () => {
  const warlock = makeWarlock();
  warlock.resources = [{ id: 'pactMagic', current: 2, max: 2 }];
  server.joinParty(warlock);
  // ... cast a warlock spell, verify pactMagic decremented
});
```

---

## Phase 6 — Centralize Lookups

### Step 6.1 — Create `utils/lookups.ts`

```ts
import { SaveStat } from '../types';
import { SPELLS_BY_ID } from './spells';

const STAT_ALIASES: Record<string, SaveStat> = {
  strength: 'str', str: 'str', st: 'str',
  dexterity: 'dex', dex: 'dex', dx: 'dex',
  constitution: 'con', con: 'con', cn: 'con',
  intelligence: 'int', int: 'int', in: 'int',
  wisdom: 'wis', wis: 'wis', ws: 'wis',
  charisma: 'cha', cha: 'cha', ch: 'cha',
};

export function normalizeStat(input: string): SaveStat {
  return STAT_ALIASES[input.toLowerCase().trim()] ?? 'dex';
}

export function normalizeSpellId(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '-').trim();
}

export function lookupSpell(input: string) {
  return SPELLS_BY_ID[normalizeSpellId(input)];
}
```

### Step 6.2 — Replace inline stat matching

**File:** `services/combatEngine.ts:223`:
```ts
// Before:
const ms = vs.find(s => stat.toLowerCase().includes(s) || s.includes(stat.toLowerCase().trim())) || 'dex';
// After:
const ms = normalizeStat(stat);
```

**File:** `services/mcp/combatService.ts` — search for `find(s =>` patterns doing stat matching and replace.

**File:** `services/mcp/travelService.ts` — the `check_skill` function (around line 279-310) uses two lookup tables + fallback fuzzy matching. Replace with `normalizeStat`.

### Step 6.3 — Fix `spellId.toLowerCase()` calls

**File:** `services/mcp/spellcastingService.ts:154`:
```ts
// Before:
const spellDef = SPELLS_BY_ID[spellId.toLowerCase()];
// After:
const spellDef = lookupSpell(spellId);
```

Do the same at line 638 (`manage_spellbook`).

---

## Phase 7 — Combat Engine Readability

### Step 7.1 — Break up one-liners

**File:** `services/combatEngine.ts`

Line 66:
```ts
// Before:
const saveMsgs: string[] = []; const expiryMsgs: string[] = [];
// After:
const saveMsgs: string[] = [];
const expiryMsgs: string[] = [];
```

Line 82-103: Extract the "find next initiative entry" logic into a helper:
```ts
function findNextAliveInitiativeEntry(
  initiative: InitiativeEntry[],
  currentIndex: number,
  party: Character[],
  enemies: Enemy[]
): { entry: InitiativeEntry; index: number } | null {
  const total = initiative.length;
  let idx = currentIndex;
  for (let checked = 0; checked < total; checked++) {
    idx = (idx + 1) % total;
    const e = initiative[idx];
    if (!e.isDead && !e.hasActedThisTurn) {
      const entity =
        e.type === 'player'
          ? party.find((p) => p.id === e.id)
          : enemies.find((en) => en.id === e.id);
      if (entity && (isIncapacitated(entity) || isUnconscious(entity))) {
        e.hasActedThisTurn = true;
        continue;
      }
      return { entry: e, index: idx };
    }
  }
  return null;
}
```

Line 204-216 (`rollDeathSave`): Break the ternary chain into if/else branches (this may already be done by Step 1.2 if you centralize to `diceEngine.ts`).

Line 131: The regex dice parser `atk.damageDice.match(/(\d+)d(\d+)([+-]\d+)?/)` — this is eliminated by Phase 2.2's `parseDamageDice` helper.

---

## Phase 8 — Minor Pain Points

### Step 8.1 — `GARBAGE_NAMES` too aggressive

**File:** `services/mcp/inventoryService.ts:301`

**Problem:** The regex `/^(?:shop|man|woman|person|halfling|dwarf|elf|goblin|me|myself|yourself|out|in|up|down|some|any|of|the|a|an|it|them|this|that|those|these|there|here|someone|anyone|everyone|nobody)$/i` blocks "Gold Ring" (no — actually it doesn't, that's fine), but "Iron Key" matches `key`. The real issue is it blocks too many perfectly valid item names.

**Fix:**
Either use a minimal set:
```ts
const GARBAGE_NAMES = /^(?:me|myself|yourself|someone|anyone|everyone|nobody|the|a|an|it)$/i;
```

Or require descriptive names:
```ts
if (cleanName.split(/\s+/).length < 2 && cleanName.length < 6) {
  return fail(`"${cleanName}" is too generic. Use a more descriptive name (e.g. "iron key" not just "key").`);
}
```

### Step 8.2 — Dead `isActive = false` before `= undefined`

**File:** `services/mcp/combatService.ts:519-520`

```ts
// Before:
state.combat.isActive = false;
state.combat = undefined;

// After:
state.combat = undefined;
```

### Step 8.3 — `criticalToolFailed` never resets

**File:** `services/llm/agentLoop.ts:173`

The variable is declared once at line 173 and set to `true` on lines 276 and 323, but never reset. If iteration 2 has a critical failure, iterations 3+ still suppress narration.

**Fix:** Add at the top of the for-loop body (after `for (let iter = 0; iter < MAX_ITERS; iter++) {`):

```ts
criticalToolFailed = false; // reset each iteration
```

### Step 8.4 — Float drift in `tickConditionsByTime`

**File:** `services/conditionEngine.ts:106`

```ts
// Before:
cond.duration -= minutes;
// After:
cond.duration = Math.round((cond.duration - minutes) * 10) / 10;
```

Prevents cumulative floating-point drift when `minutes` is fractional (e.g., 0.1 for combat rounds).

### Step 8.5 — `end_combat` keeps round-duration conditions

**File:** `services/mcp/combatService.ts`, the `clearEndOfCombatConditions` function (called at line 514-518)

**Problem:** It only clears conditions with `duration == null`. Conditions with explicit round durations (e.g. `Shield: duration: 1, durationUnit: 'round'`) persist indefinitely.

**Fix:**
```ts
function clearEndOfCombatConditions(target: Character | Enemy): string[] {
  if (!target.conditions || target.conditions.length === 0) return [];
  const removed: string[] = [];
  target.conditions = target.conditions.filter(c => {
    if (c.duration == null || c.durationUnit === 'round') {
      if (c.durationUnit === 'round' || c.duration === null) {
        removed.push(c.id);
        return false;
      }
    }
    return true;
  });
  return removed;
}
```

---

## Verification

After each phase:

```bash
npm run lint          # Should pass clean
npm test              # Should pass
npx tsc --noEmit      # Should pass (mandatory after Phase 4)
```

Final full sweep:

```bash
npm run lint && npm test && npx tsc --noEmit
echo "=== All clear ==="
```

---

## Summary Timeline

| Phase | Est. Time | Impact |
|-------|-----------|--------|
| 0 — Three criticals | 2-4 hours | Stops state corruption |
| 1 — Centralize dupes | 4-6 hours | Stops bug divergence |
| 2 — Unify damage | 2-4 hours | Stops mechanical bugs (temp HP, HAM, resistances) |
| 3 — Safe cloning | 2-3 hours | Stops silent data loss |
| 4 — Strict types | 3-5 hours | Stops entire categories of bugs |
| 5 — Pact magic | 1-2 hours | Feature gap closed |
| 6 — Centralized lookups | 1-2 hours | Prevents new fuzzy-match bugs |
| 7 — Readability | 1-2 hours | Maintenance debt |
| 8 — Polish | 1-2 hours | Minor quality |

**Total: ~20-30 hours spread across 8 phases.**

Start with Phase 0. Three bugfixes, no refactoring, immediate payoff.
