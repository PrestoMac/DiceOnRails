# Known Bugs — Tracked for Review

This file lists bugs identified during the condition/spell/effect tracking audit that are **not** addressed by the duration/UI fix cluster currently being implemented. Each entry has a file:line, plain-English explanation, and severity.

The implemented fixes cover: duration literals, `applyAcBuff` recast stacking, exhaustion UI aggregation, buffs-vs-debuffs panel split, duration badge formatting, `Infinity` JSON survival, and the `'permanent'` duration unit type gap. Everything else is below.

---

## CRITICAL — Break core gameplay right now

### C1. `spell_effect` (Dispel Magic / Counterspell) is a no-op stub
**File:** `services/mcp/spellcastingService.ts:572-597`

The function rolls an ability check and returns a "you dispelled it!" message, but **never actually removes any condition, breaks any concentration, or clears any DoT**. The `targetId` parameter is accepted by the schema but completely ignored.

**Symptom:** The LLM repeatedly "dispels" conditions that never go away. The `TOOL_MODE_INSTRUCTION` prompt explicitly tells the LLM to use this tool, so it trusts it to work.

**Fix direction:** When `mode === 'dispel'` succeeds, look up the target via `deps.getTarget(targetId)` / `state.combat?.enemies`, call `removeCondition` for each condition whose `source` matches a spell ID, break concentration if the target is concentrating, and clear any matching `activeDoTs` entries.

---

### C2. Fresh concentration spells break the first time any time passes
**Files:** `services/spellcastingEngine.ts:207-216` + `services/mcp/spellcastingService.ts:184-194`

When a caster first casts a concentration spell (not replacing an existing one), `concentrationStarted` stays `false`, so `runtime.concentrationStartTime` is never set. The next `narrate_turn` with `timePassed > 0` reads `startTime = 0`, computes `elapsed = gameTime - 0 = hundreds of minutes`, and instantly ends the spell.

**Symptom:** Every out-of-combat concentration spell (Hold Person, Bless, Moonbeam, Fly, Invisibility) silently breaks the first time the party moves or rests.

**Fix direction:** In `spellcastingEngine.ts`, set `concentrationStarted = true` for every concentration spell, not just the replacement branch.

---

### C3. Prior tool results are orphaned in LLM history every turn
**Files:** `services/llm/llmApiClient.ts:31-42` + `types/common.ts:62-71`

OpenAI's API requires every `role: "tool"` message to be paired with the assistant `tool_calls` that produced it. The persisted `Message` type has no field to store assistant `tool_calls`, so `mapHistoryToMessages` produces orphan tool messages whose `tool_call_id` doesn't match any stored assistant message.

**Symptom:** The LLM has no memory of prior `cast_spell` results, applied conditions, or damage. The model can't reason about state it can't see. Most providers will reject the request or silently drop the orphan tool messages.

**Fix direction:** Add a `toolCalls?: Array<{id, name, arguments}>` field to `Message` and persist a synthetic assistant message with `tool_calls` immediately before each tool-message group; emit it in `mapHistoryToMessages`.

---

### C4. Long Rest wipes ALL exhaustion instead of 1 level
**File:** `services/mcp/travelService.ts:646-648`

Per 5e RAW, a long rest removes one exhaustion level. The code strips every `exhaustion-N` condition for the entire party at once.

**Symptom:** A character at level 6 exhaustion wakes up at level 0 after one night's sleep.

**Fix direction:** Mirror the `greater-restoration` logic at `spellcastingService.ts:291-300` — find the highest `exhaustion-N`, remove only that one.

---

### C5. Long Rest clears exhaustion for characters at 0 HP
**File:** `services/mcp/travelService.ts:646-648` vs HP check at `:664-668`

The exhaustion-clear loop runs *before* the "is this character conscious enough to rest?" check. A dying character has all exhaustion removed even though the function itself prints "X is unconscious and cannot benefit from the rest."

**Fix direction:** Move the exhaustion-reduction logic inside the HP-gated loop, after the conscious check.

---

### C6. `end_combat` leaves Stunned/Paralyzed/Prone etc. on every combatant forever
**File:** `services/mcp/combatService.ts:479-491`

When combat ends, the engine just sets `state.combat = undefined`. It does not clean up conditions applied during the fight. Many combat conditions have `duration: null` so they never tick down.

**Symptom:** After combat, the party stays Paralyzed / Stunned / Prone indefinitely until a long rest partially clears them.

**Fix direction:** At end of combat, sweep each party member and clear conditions with `duration == null` (the "until save/end-of-combat" cases). Keep long-duration buffs (`durationUnit === 'minute'` or `'permanent'`).

---

### C7. Concentration is never broken when caster falls unconscious or gets Paralyzed/Stunned
**File:** `services/spellcastingEngine.ts:461`

`breakConcentration(character, reason)` accepts `'incapacitated'` as a reason, but no caller ever passes it. Grep confirms only `'damaged'` and `'voluntary'` are ever used.

**Symptom:** A wizard at 0 HP keeps concentrating on Moonbeam forever. The 5e rule "concentration ends if you are incapacitated or killed" is not enforced.

**Fix direction:** In every place that adds an incapacitating condition, or simpler: at the top of `combatService.next_turn` after the save loop and in `inflict_damage` after HP→0, call `engineBreakConcentration(c, 'incapacitated')` if `isIncapacitated(c) || isUnconscious(c)`.

---

### C8. `handleExecuteBatch` calls `rollbackTransaction()` without ever calling `beginTransaction()`
**File:** `hooks/useGameActions.ts:212-275`

Multiplayer batched turns have a try/catch that tries to roll back on failure, but the rollback is a no-op because no transaction was started.

**Symptom:** If a batch fails partway (e.g., player A's buff landed, player B's tool threw), all partial state sticks. The only recovery is the user manually clicking Rewind.

**Fix direction:** Call `mcpServer.beginTransaction()` immediately after `mcpServer.loadState(lockedState)`, and `mcpServer.commitTransaction()` after `runAgentLoop` succeeds.

---

### C9. `isEndOfTurn` / `timeAdvancedThisTurn` look at LLM input args, not actual success
**Files:** `services/llm/agentLoop.ts:252-257, 335-343`

When the LLM calls `long_rest(narration="X")` and the rest **fails** (e.g., on cooldown), the loop still thinks "time advanced" because it inspects the args, not the result, so it skips the enforcement `narrate_turn`.

**Symptom:** Failed rests cause conditions to silently stop ticking. Compounding with C9, no `narrate_turn` runs at all for the turn.

**Fix direction:** Check `result.success` and `result.data?.timePassed > 0`, not just the input args / message text prefix. Better: snapshot `state.gameTime` before/after the loop and check whether it actually advanced.

---

## HIGH — Visible misbehavior or state corruption

### H1. `handleUpdateInventory` / `handleUpdateCurrency` silently route to character #1
**File:** `hooks/useGameState.ts:161-171`

TypeScript types claim `handleUpdateInventory(charId, items)` but the implementation drops `charId` and always targets `party[0]`.

**Symptom:** If you view party member #2 and edit inventory or drink a potion, the change applies to member #1. Silent state corruption.

**Fix direction:** Thread `character.id` through `onUpdateInventory`/`onUpdateCurrency`, change `useGameState` signatures to accept it, pass to `updateInventoryDirectly(newInventory, charId)`.

---

### H2. Combat-end (`state.combat = undefined`) doesn't propagate to remote multiplayer clients
**File:** `services/mcp/stateService.ts:75-76` + `services/mcp/combatService.ts:485`

`JSON.stringify` omits undefined fields. When combat ends locally and `combat` becomes undefined, the sync payload has no `combat` key. Remote clients run `Object.assign(state, remoteState)` which doesn't delete `state.combat`.

**Symptom:** Other players see the combat tracker with stale enemies forever.

**Fix direction:** In `loadState`, explicitly delete fields that should be cleared:
```ts
if (!('combat' in savedState) || savedState.combat == null) {
    delete (state as any).combat;
}
```

---

### H3. Concentration duration isn't checked during combat
**File:** `services/mcp/combatService.ts:367-383`

The `runtime.concentrationEffectiveDuration` check lives only in `travelService.narrate_turn`. Combat never advances `gameTime` and never calls that check.

**Symptom:** A 1-minute concentration spell cast in combat ticks its associated *condition* down via rounds, but `caster.concentrationSpellId` is not cleared when the condition expires. The UI/LLM keeps advertising a finished concentration; the caster cannot re-cast because the engine thinks they're still concentrating.

**Fix direction:** In `combatService.next_turn`, after the round-tick loop, also run the `runtime.concentrationEffectiveDuration` check. Extract that block from `travelService.narrate_turn` into a shared helper.

---

### H4. `applyCondition` / `breakConcentration` mutate arrays in place
**Files:** `services/conditionEngine.ts:22-38`, `services/spellcastingEngine.ts:461-482`

They `push` and `splice` the conditions array rather than creating a new one. The array reference doesn't change, so any future `React.memo` or `useMemo([conditions])` will silently fail to recompute.

**Symptom:** UI happens to re-render today because nothing is memoized, but this is a landmine for any future memoization.

**Fix direction:** Replace with immutable operations: `target.conditions = [...target.conditions, condition]` and `target.conditions = target.conditions.filter(...)`.

---

### H5. `applyCondition` refresh branch only updates `duration` — ignores saveDC, saveEnd, onRemove, durationUnit
**File:** `services/conditionEngine.ts:32-34`

Re-casting Hold Person on a held target refreshes the timer but keeps the **old save DC** even after the caster levels up.

**Symptom:** Saves against refreshed conditions use stale DCs forever.

**Fix direction:** Replace with `Object.assign(existing, condition)` or explicitly copy `duration`, `saveDC`, `saveEnd`, `durationUnit`, `onRemove`.

---

### H6. `ActiveCondition.onRemove` function form is silently destroyed by JSON serialization
**File:** `types/character.ts:131` + every JSON round-trip

Functions can't survive JSON. Any condition set up with a function callback loses its cleanup logic after the first save/load.

**Symptom:** Cleanup callbacks for `onRemove` (if any caller uses the function form) silently vanish.

**Fix direction:** Drop the function form from the type, require all onRemove effects to be serializable declarative payloads (`{ kind: 'acBonus', value }`, etc.).

---

### H7. Tool filter hides `long_rest` / `short_rest` whenever HP and hit dice are full
**File:** `services/llm/toolFilter.ts:16-18, 52`

A party at full HP but with exhaustion, depleted spell slots, or used Rage/Ki cannot call long_rest because the tool is filtered out.

**Symptom:** The LLM has no way to recover resources or remove exhaustion if HP is already full.

**Fix direction:** Replace `partyAtFull` with a stricter predicate that also checks `resources.some(r => r.current < r.max)`, `c.conditions.some(c => c.id.startsWith('exhaustion-'))`, etc.

---

### H8. Context message omits active DoTs, transformations, temp HP, AC bonuses
**File:** `services/llm/agentLoop.ts:104-137`

The "current state" context message is missing: Moonbeam/Flaming Sphere/Spirit Guardians damage ticks, Polymorph/Wild Shape state, temporary HP, mage armor's +3 AC numeric value, enemy-sourced DoTs.

**Symptom:** The LLM can't plan around state it can't see.

**Fix direction:** Extend the `effects` block to dump `activeDoTs`, `acMinimum`, `runtime.transformationState`, `tempHp`, and any active buff condition with its numeric AC delta.

---

### H9. Malformed JSON in any tool-call arg aborts the loop without rolling back
**File:** `services/llm/agentLoop.ts:249`

No try/catch around `JSON.parse(tc.function.arguments)`. If a weaker LLM emits one bad JSON arg, the whole loop throws.

**Symptom:** All earlier successful tool calls in that turn (applied conditions, damage) persist while the user sees an error and no narration.

**Fix direction:** Wrap the `.map` in try/catch; on parse failure for a specific tool call, push a synthetic tool result with `success:false`. Also, in `useGameActions.ts`'s catch, restore from `mcpServer.loadRewindPoint()` when an error is thrown mid-turn.

---

### H10. `inlineNarration` from long_rest/short_rest/move_to is discarded — extra LLM call wasted
**File:** `services/llm/agentLoop.ts:259-298`

When long_rest produces narration internally, the agent loop doesn't capture it as `inlineNarration` because there was no top-level `narrate_turn` call. `useGameActions` then makes a *second* LLM call to generate narration that was already produced.

**Fix direction:** After the `preEndCalls` batch, if any of those calls returned `data.narration` of length ≥50, set `inlineNarration` from it.

---

## MEDIUM — Cosmetic / edge cases

### M1. Elf Trance (4h rest) still uses 8h exhaustion offset
**File:** `services/mcp/travelService.ts:508-509`

Elves gain exhaustion as if they needed 8 hours of sleep, defeating the purpose of Trance.

**Fix direction:** `const restAllowance = char.racialTraits?.includes('trance') ? 240 : 480;`

---

### M2. Heroism duration hardcoded to 1 minute regardless of slot level
**File:** `services/mcp/spellcastingService.ts:384-391`

Also, temp HP granted only once at cast, not refreshed each turn per the spell text.

**Fix direction:** Compute duration from `spellDef.durationScaling`; hook into the per-turn tick to refresh `tempHp = max(tempHp, chaMod)` while heroism is active.

---

### M3. Loading-state race: realtime subscription can overwrite fresher local state
**File:** `hooks/useGameState.ts:36-76 + 118-159`

If the SELECT returns newer data than the subscription's first delivery (during Supabase replication lag), the older subscription payload overwrites the newer SELECT result.

**Fix direction:** Track a `loadedAt` timestamp; in the subscription handler, ignore payloads whose `updated_at` is older than `loadedAt`.

---

### M4. `_tiredWarningFired` only resets on long_rest
**File:** `services/mcp/travelService.ts:502-504, 662`

The fatigue warning fires only once per long-rest cycle. Pushing past 18h / 20h thresholds produces no further warnings.

**Fix direction:** Reset on short_rest too, or re-fire at each new exhaustion threshold.

---

### M5. `cast_spell` lookup `spellId.toLowerCase()` doesn't normalize spaces
**File:** `services/mcp/spellcastingService.ts:154`

If the LLM passes `"Mage Armor"` (which the schema description literally suggests), the lookup fails and the spell silently does nothing.

**Fix direction:** Normalize via `spellId.toLowerCase().replace(/\s+/g, '-')` before lookup.

---

### M6. TOOL_MODE_INSTRUCTION says Rage ends if you don't attack/take damage; engine doesn't enforce this
**File:** `services/llm/prompts/toolModePrompt.ts:56` vs `services/mcp/travelService.ts:585-588`

The LLM is instructed to narrate a rule the engine does not enforce.

**Fix direction:** Either implement the per-turn check in `combatService.next_turn`, or change the prompt to describe the actual engine behavior.

---

### M7. `combatEngine.advanceToNextTurn` skips minute-tick
**File:** `services/combatEngine.ts:93-99`

Only `tickConditions` is called (round-unit only). Minute-based conditions are not decremented at the round boundary.

**Fix direction:** Add `tickConditionsByTime(c, 0.1)` matching `combatService.next_turn:373-374`.

---

### M8. Long_rest clears `concentrationSpellId` only for resting chars — unconscious casters stay "concentrating"
**File:** `services/mcp/travelService.ts:664-674`

An unconscious caster (who per 5e cannot concentrate) retains their `concentrationSpellId` through a long rest.

**Fix direction:** Clear `concentrationSpellId` for every party member at the start of long_rest; call `engineBreakConcentration(char, 'incapacitated')` for 0-HP chars.

---

## LOW — Minor / code quality

### L1. LLM context message emits raw IDs with no readable names or durations
**File:** `services/llm/agentLoop.ts:139-141`

LLM sees `exhaustion-2`, `mage-armor-ac`, etc. with no duration/save info. Brittle.

**Fix direction:** Map IDs through `CONDITION_INFO` and include `{duration}{unit}` summary.

---

### L2. Spell slot level parsed via `slice(-1)` — breaks at slot 10+
**File:** `components/CharacterSheet.tsx:281`

**Fix direction:** `parseInt(slot.id.replace('spell-slot-', ''), 10)`.

---

### L3. CombatTracker shows only condition IDs, no DC / duration / source
**File:** `components/CombatTracker.tsx:88-90, 158-160`

**Fix direction:** Pass full condition objects to `ConditionsList` instead of just IDs.

---

### L4. `move_to` without a route doesn't advance time at all
**File:** `services/mcp/travelService.ts:450-475`

In-town exploration never advances the clock.

**Fix direction:** Add a small default `timePassed` (e.g., 15 min) when no route is given.

---

### L5. `lastLongRestTime = -960` initialization is dead weight
**File:** `services/mcp/stateService.ts:14-15` vs `services/mcp/travelService.ts:498`

**Fix direction:** Either accept `lastLongRestTime < 0` as valid (drop the `>= 0` guard) or initialize to `0`.

---

### L6. Exhaustion level-10 message says "dead" but character is at 0 HP + unconscious (revivable)
**File:** `services/mcp/travelService.ts:524-530`

**Fix direction:** Change copy to "collapses from exhaustion" or actually apply a death effect.

---

### L7. Default model `deepseek/deepseek-v4-flash` likely doesn't exist on OpenRouter
**File:** `services/llm/llmApiClient.ts:15`

Would cause 100% of unconfigured turns to fail.

**Fix direction:** Verify correct model id; likely `deepseek/deepseek-chat`.

---

### L8. Variable shadow: `const state = mcpServer.getFullState()` at `agentLoop.ts:230` shadows the outer `state` from line 99
**File:** `services/llm/agentLoop.ts:99, 230`

**Fix direction:** Rename the inner binding to `currentState`.

---

### L9. `stateService.loadState` uses shallow `Object.assign` — nested arrays share references with caller
**File:** `services/mcp/stateService.ts:75-76`

If the caller still holds `savedState` (for diffing, snapshots, etc.), those references are polluted.

**Fix direction:** Deep clone in loadState or document the "transfer of ownership" contract.
