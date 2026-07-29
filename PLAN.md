# Effect Dispatcher Implementation Plan

> **Branch**: `feature/effect-dispatcher`  
> **Created**: July 29, 2026  
> **Status**: Planning — awaiting review before implementation

---

## Executive Summary

This plan describes a complete refactor of how Dice On Rails handles class features, racial traits, and feat effects. The current architecture relies on **hardcoded class-ID and race-ID string branches** scattered across ~10 service files. The data catalogs (`data/classes.ts`, `data/races.ts`, `data/feats.ts`) define structured `effect.kind` payloads that are **never consumed by engine code** — they act as documentation only.

The new architecture introduces a **Generic Effect Dispatcher** (`services/effectDispatcher.ts`) that reads `effect.kind` payloads at runtime and applies them generically. This eliminates hardcoded branches, makes the catalog metadata functional, and enables adding new classes/races/subclasses with catalog data alone — no engine changes required for standard effects.

---

## Problem Statement

### Current State

| Metric | Value |
|--------|-------|
| Unique `effect.kind` values in catalogs | 14 |
| Effect kinds NEVER consumed by engine | 6 (`reckless-attack`, `unarmored-defense-13-dex`, `pact-magic`, `spellcasting`, `reroll-ones`, `breath-weapon`) |
| Hardcoded class-ID branches in `classEngine.ts` | 10 |
| Hardcoded race-ID branches | 0 (race logic goes through trait iteration, but effects aren't consumed) |
| Resource IDs with special `use_resource` behavior | 4 of ~12 defined |
| Classes with broken core features | 4 (Monk, Druid, Sorcerer, Paladin) |
| Races with broken signature features | 3 (Tiefling, Halfling, Gnome) |

### Root Cause

The `effect.kind` metadata in catalogs is **dead code**. Every mechanical effect that works comes from hardcoded `if (character.class === 'X')` branches in specific services. Adding a new subclass that uses an existing effect kind (e.g., a new race with `damage-resistance`) still requires:
1. Adding the catalog entry (already done)
2. Finding every service that needs to check for this effect
3. Adding a new hardcoded branch

This violates the open/closed principle and makes the system increasingly brittle as more classes/races are added.

---

## Proposed Architecture

### Core Concept: Read-Time Effect Evaluation

The new system uses a **read-time evaluation** pattern (consistent with existing `calculateAc`, `calculateSpeed`, `getSavingThrowBonus`). A generic dispatcher function queries the character's class features, racial traits, and feats for effects matching a given `effect.kind`, then applies them.

```typescript
// services/effectDispatcher.ts
interface EffectContext {
  character: Character;
  payload: Record<string, unknown>;
  // Additional context as needed (attack roll, damage type, save stat, etc.)
}

interface EffectHandler {
  kind: string;
  apply: (ctx: EffectContext) => EffectResult;
}

const EFFECT_REGISTRY: Map<string, EffectHandler> = new Map();

function getEffects(character: Character, effectKind: string): Array<{ source: 'race' | 'class' | 'feat' | 'subclass'; payload: Record<string, unknown> }> {
  const results = [];
  // Check racial traits
  const race = getRaceDef(character.race);
  for (const trait of race?.traits || []) {
    if (trait.effect?.kind === effectKind) {
      results.push({ source: 'race' as const, payload: trait.effect.payload || {} });
    }
  }
  // Check class features
  const classDef = getClassDef(character.class);
  for (const feat of classDef?.features || []) {
    if (feat.level <= character.level && feat.effect?.kind === effectKind) {
      results.push({ source: 'class' as const, payload: feat.effect.payload || {} });
    }
  }
  // Check subclass features
  const subclass = getSubclassDef(character.class, character.subclassId || '');
  for (const feat of subclass?.features || []) {
    if (feat.level <= character.level && feat.effect?.kind === effectKind) {
      results.push({ source: 'subclass' as const, payload: feat.effect.payload || {} });
    }
  }
  // Check feats
  for (const featId of character.feats || []) {
    const featDef = getFeatById(featId);
    if (featDef?.effect?.kind === effectKind) {
      results.push({ source: 'feat' as const, payload: featDef.effect.payload || {} });
    }
  }
  return results;
}
```

### Integration Points

The dispatcher hooks into existing query functions:

| Function | Current Behavior | New Behavior |
|----------|-----------------|--------------|
| `calculateAc()` | Hardcodes `barbarian`, `monk`, `sorcerer+draconic` | Calls `getEffects(character, 'ac-formula')` for generic unarmored defense |
| `calculateSpeed()` | Only checks racial traits | Also checks class features and feats via dispatcher |
| `getDamageResistances()` | Only checks racial traits | Also checks class features and feats |
| `getConditionsImmunities()` | Only checks racial traits (none exist) | Also checks class features and feats |
| `getSavingThrowBonus()` | Hardcodes Rogue L15+ | Calls `getEffects(character, 'advantage-on-save')` |
| `player_attack()` | Hardcodes sneak attack, GWF, TWF | Calls dispatcher for `sneak-attack`, `crit-bonus-dice`, `reroll-ones` |
| `make_save()` | Hardcodes Fey Ancestry | Calls `getEffects(character, 'advantage-on-save')` |
| `inflictDamageOnTarget()` | Only checks enemy resistances | Calls `getDamageResistances()` for characters too |
| `use_resource()` | 4 hardcoded handlers | Registry of resource handlers |

---

## Implementation Phases

### Phase 1: Foundation — Effect Dispatcher Core (Days 1-3)

**New files:**
- `services/effectDispatcher.ts` — Core dispatcher with registry pattern
- `services/effectDispatcher.test.ts` — Unit tests for dispatcher

**Modified files:**
- `services/classEngine.ts` — Refactor `calculateAc`, `calculateSpeed`, `getDamageResistances`, `getConditionsImmunities` to use dispatcher
- `types/character.ts` — Add `appliedEffects?` field (optional, for debugging)

**Effect handlers to implement:**
1. `ac-formula` — Evaluates AC formulas like `"10 + DEX + CON"`
2. `speed-bonus` — Adds speed bonuses with condition checking
3. `damage-resistance` — Collects damage resistance types
4. `condition-immunity` — Collects condition immunities
5. `advantage-on-save` — Returns save advantage conditions

**Acceptance criteria:**
- [ ] `getEffects(character, 'ac-formula')` returns correct formula for Barbarian, Monk, Draconic Sorcerer
- [ ] `getEffects(character, 'speed-bonus')` returns Barbarian Fast Movement and Monk Unarmored Movement
- [ ] `getDamageResistances(character)` includes Dwarf poison, Dragonborn ancestry, Tiefling fire
- [ ] All existing tests pass

---

### Phase 2: Combat Integration (Days 4-7)

**Modified files:**
- `services/mcp/combatService.ts` — Integrate dispatcher for attack effects
- `services/mcp/spellcastingService.ts` — Integrate dispatcher for save effects
- `services/inventoryEngine.ts` — Apply character damage resistances
- `services/conditionEngine.ts` — Check condition immunities from dispatcher

**Effect handlers to implement:**
6. `sneak-attack` — Computes sneak attack dice from level mapping
7. `crit-bonus-dice` — Adds extra crit dice (Brutal Critical, Savage Attacks)
8. `reroll-ones` — Rerolls natural 1s (Halfling Lucky)
9. `extra-attack` — Returns attack count for character level
10. `damage-bonus` — Adds flat damage bonuses (Rage, Elemental Affinity)

**Acceptance criteria:**
- [ ] Dwarf takes half poison damage (resistance applied)
- [ ] Halfling rerolls natural 1 on attack rolls
- [ ] Barbarian L9+ adds extra crit dice (Brutal Critical)
- [ ] Rogue sneak attack dice calculated from level (not just stored field)
- [ ] Gnome has advantage on INT/WIS/CHA saves vs magic
- [ ] All existing combat tests pass

---

### Phase 3: Resource Spend System (Days 8-10)

**New files:**
- `services/resourceHandlers.ts` — Registry of resource spend handlers

**Modified files:**
- `services/mcp/spellcastingService.ts` — Refactor `use_resource` to use registry

**Resource handlers to implement:**
| Resource ID | Handler Action |
|-------------|---------------|
| `ki` | Enable Flurry of Blows (extra unarmed), Patient Defense (Dodge), Step of the Wind (Dash/Disengage) |
| `sorcery-points` | Enable metamagic options (Twinned, Quickened, Subtle, etc.) |
| `bardic-inspiration` | Grant inspiration die to target (d6/d8/d10/d12 by level) |
| `channel-divinity` | Enable Turn Undead or domain-specific channel |
| `wild-shape` | Transform into beast (CR check, consume charge) |
| `action-surge` | Grant extra action this turn |
| `indomitable` | Reroll failed save |
| `arcane-recovery` | Recover spell slots during short rest |

**Acceptance criteria:**
- [ ] Monk can spend ki for Flurry of Blows (2 unarmed strikes as bonus action)
- [ ] Sorcerer can spend sorcery points for metamagic
- [ ] Bard can grant Bardic Inspiration die
- [ ] Druid can Wild Shape (consume charge, transform)
- [ ] Fighter can use Action Surge (extra action)
- [ ] All existing resource tests pass

---

### Phase 4: Character Creation Fixes (Days 11-14)

**Modified files:**
- `services/characterCreationService.ts` — Process racial features at creation
- `types/character.ts` — Add `languages` field

**Features to process at creation:**
1. **Racial languages** — Add `languages: string[]` to Character, populate from race definition
2. **Racial skill proficiencies** — Auto-add Perception for Elves, 2 skills for Half-Elves
3. **Racial spell-like abilities** — Auto-learn Infernal Legacy spells for Tieflings
4. **Racial weapon/armor proficiencies** — Grant Dwarven weapon training
5. **Racial speed** — Apply base speed from race definition
6. **Racial darkvision** — Set darkvision range from race definition

**Acceptance criteria:**
- [ ] Elf character has Perception proficiency auto-added
- [ ] Half-Elf character has 2 additional skill proficiencies
- [ ] Tiefling character knows thaumaturgy cantrip
- [ ] Dwarf character has battleaxe, handaxe, light hammer, warhammer proficiency
- [ ] All characters have `languages` populated from race
- [ ] All existing creation tests pass

---

### Phase 5: Subclass Feature Effects (Days 15-17)

**Modified files:**
- `services/mcp/progressionService.ts` — Apply subclass features on level-up
- `services/effectDispatcher.ts` — Extend to check subclass features

**Subclass features to implement:**
| Class | Subclass | Feature | Effect Kind |
|-------|----------|---------|-------------|
| Paladin | Oath of Devotion | Sacred Weapon | `attack-bonus` |
| Paladin | Oath of Devotion | Aura of Devotion | `condition-immunity` (charmed) |
| Cleric | Life Domain | Disciple of Life | `healing-bonus` |
| Cleric | Life Domain | Supreme Healing | `maximize-healing` |
| Wizard | Evocation | Sculpt Spells | `spell-protection` |
| Wizard | Evocation | Empowered Evocation | `damage-bonus` |
| Sorcerer | Draconic | Elemental Affinity | `damage-bonus`, `damage-resistance` |
| Rogue | Thief | Fast Hands | `bonus-action-use-object` |
| Barbarian | Berserker | Mindless Rage | `condition-immunity` (charmed/frightened) |

**Acceptance criteria:**
- [ ] Life Domain Cleric adds +2+spell-level to healing
- [ ] Evocation Wizard can protect allies from AoE spells
- [ ] Draconic Sorcerer adds CHA mod to matching damage type
- [ ] All existing progression tests pass

---

### Phase 6: Class Feature Implementation (Days 18-21)

**Modified files:**
- `services/mcp/combatService.ts` — Implement missing class features
- `services/mcp/spellcastingService.ts` — Implement spell-related features

**Features to implement:**
| Class | Feature | Implementation |
|-------|---------|----------------|
| Paladin | Divine Smite | Add radiant damage on melee hit when slot expended |
| Paladin | Improved Divine Smite | +1d8 radiant on all melee hits at L11+ |
| Barbarian | Rage damage | Apply rage bonus to melee damage rolls |
| Barbarian | Rage resistance | Apply B/P/S resistance while raging |
| Monk | Martial Arts DEX | Use DEX for unarmed strike attack/damage |
| Monk | Stunning Strike | CON save or stunned when ki spent |
| Sorcerer | Metamagic | Twinned, Quickened, Subtle, Empowered, Careful, Distant, Extended, Heightened |
| Bard | Bardic Inspiration die | Roll and add to target's roll |
| Rogue | Sneak Attack auto-detect | Check advantage/ally-adjacent/finesse automatically |
| Fighter | Action Surge | Grant extra action (already tracked, now mechanical) |
| Fighter | Second Wind | Already implemented, verify |
| Cleric | Channel Divinity | Turn Undead mechanical effect |

**Acceptance criteria:**
- [ ] Paladin can expend spell slot for Divine Smite radiant damage
- [ ] Barbarian rage adds +2/+3/+4 damage and B/P/S resistance
- [ ] Monk uses DEX for unarmed strikes
- [ ] Monk can spend ki to stun (CON save)
- [ ] Sorcerer can twin a spell (two targets)
- [ ] Rogue sneak attack auto-triggers when conditions met
- [ ] All existing tests pass

---

### Phase 7: Testing & Polish (Days 22-25)

**New files:**
- `tests/services/effectDispatcher.integration.test.ts` — Integration tests
- `tests/services/resourceHandlers.test.ts` — Resource handler tests

**Modified files:**
- All modified service files — Add error handling, edge cases

**Tasks:**
1. Full test suite run — verify no regressions
2. Edge case handling:
   - Effect stacking (do two speed bonuses stack?)
   - Effect conflicts (multiple AC formulas)
   - Temporary effects (duration tracking)
   - Effect removal (concentration break, etc.)
3. Performance testing — ensure dispatcher doesn't add significant overhead
4. Documentation — update AGENTS.md, ARCHITECTURE.md

**Acceptance criteria:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No performance regression (>50ms per tool call)
- [ ] Documentation updated

---

## File Change Summary

### New Files (4)
| File | Purpose |
|------|---------|
| `services/effectDispatcher.ts` | Core dispatcher with registry |
| `services/effectDispatcher.test.ts` | Unit tests for dispatcher |
| `services/resourceHandlers.ts` | Resource spend handler registry |
| `tests/services/effectDispatcher.integration.test.ts` | Integration tests |

### Modified Files (~15)
| File | Changes |
|------|---------|
| `services/classEngine.ts` | Refactor AC, speed, resistances, immunities to use dispatcher |
| `services/mcp/combatService.ts` | Integrate sneak attack, crit bonus, reroll, extra attack |
| `services/mcp/spellcastingService.ts` | Refactor use_resource, integrate save advantage |
| `services/inventoryEngine.ts` | Apply character damage resistances |
| `services/conditionEngine.ts` | Check condition immunities from dispatcher |
| `services/characterCreationService.ts` | Process racial languages, skills, spells, proficiencies |
| `services/mcp/progressionService.ts` | Apply subclass features on level-up |
| `types/character.ts` | Add `languages`, `appliedEffects` fields |
| `data/classes.ts` | Add missing effect payloads (Divine Smite, Metamagic, etc.) |
| `data/races.ts` | Fix effect payloads (Tiefling Infernal Legacy, etc.) |
| `data/feats.ts` | Add effect payloads for feats |
| `services/mcpService.ts` | Wire new dispatcher into tool dispatch |
| `services/mcp/partyService.ts` | No changes expected |
| `services/mcp/travelService.ts` | Integrate resource recovery with dispatcher |
| `services/featsService.ts` | Refactor to use dispatcher |

### Unchanged Files
- All UI components (no UI changes required)
- LLM prompts (no prompt changes required)
- Persistence layer (no schema changes required)
- Test helpers (no changes required)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing campaigns | Medium | High | Deep-clone state before applying effects; validate all effects before committing |
| Performance regression | Low | Medium | Benchmark dispatcher; cache effect lookups per turn |
| Effect stacking bugs | Medium | Medium | Define stacking rules (most bonuses don't stack); document in dispatcher |
| Subclass feature complexity | High | Medium | Phase 5 is scoped to most-requested subclasses; defer edge cases |
| Resource handler edge cases | Medium | Low | Each handler is isolated; failures return error message, don't crash |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Classes with working core features | 5/12 | 12/12 |
| Races with working signature features | 4/9 | 9/9 |
| Effect kinds consumed by engine | 8/14 | 14/14 |
| Hardcoded class-ID branches | 10+ | 0 |
| Resource IDs with mechanical effects | 4/12 | 12/12 |
| Subclasses with mechanical features | 1/12 | 6/12 (Phase 5) |

---

## Out of Scope

The following are explicitly NOT part of this refactor:

1. **UI changes** — No component modifications required
2. **LLM prompt changes** — Prompts already instruct the LLM correctly; the engine just wasn't following through
3. **New classes or races** — This refactor fixes existing ones; adding new ones is a follow-up
4. **Action economy system** — Bonus action tracking, reaction spending — these are separate architectural concerns
5. **VTT battle map changes** — Grid movement, token placement — unrelated to effect system
6. **Multiplayer sync changes** — Effect dispatcher is local-state only; no sync implications
7. **Save file migration** — Existing saves will work; effects are re-derived at load time

---

## Post-Implementation Follow-Ups

After this refactor is complete, the following become tractable:

1. **Subrace system** — Add subrace selection; subraces define additional effects
2. **New subclasses** — Add Battle Master, Totem Warrior, Moon Druid, etc. with catalog data only
3. **Feats expansion** — Add missing feats (Lucky, War Caster, Sentinel, etc.)
4. **Background system** — Add mechanical background features (not just narrative)
5. **Magic items** — Items can define effects that the dispatcher applies
6. **Conditions as effects** — Refactor `ActiveCondition` to use the same dispatcher
7. **Spell effects** — Spell durations/concentrations managed through effect system

---

## Appendix: Effect Kind Reference

### Currently Defined (14 total)

| Effect Kind | Payload Shape | Sources | Status |
|-------------|---------------|---------|--------|
| `ac-formula` | `{ formula: string }` | Barbarian, Monk | Phase 1 |
| `speed-bonus` | `{ bonus: number; condition: string }` | Barbarian, Monk | Phase 1 |
| `damage-resistance` | `{ type: string }` | Dwarf, Dragonborn, Tiefling | Phase 1 |
| `condition-immunity` | `{ condition: string }` | (none currently) | Phase 1 |
| `advantage-on-save` | `{ against: string; stat?: string }` | Gnome, Halfling, Elf, Barbarian | Phase 1 |
| `sneak-attack` | `{ extraDiceAtLevel: Record<number, number> }` | Rogue | Phase 2 |
| `crit-bonus-dice` | `{ count: number }` | Barbarian, Half-Orc | Phase 2 |
| `reroll-ones` | `{ scope: string }` | Halfling | Phase 2 |
| `extra-attack` | `{ count: number }` | Fighter, Paladin, Barbarian, Monk, Ranger | Phase 2 |
| `damage-bonus` | `{ amount: string; type?: string }` | (new — Rage, Elemental Affinity) | Phase 2 |
| `unarmored-defense-13-dex` | none | Sorcerer | Phase 1 (merge into ac-formula) |
| `reckless-attack` | none | Barbarian | Phase 6 |
| `pact-magic` | none | Warlock | Phase 3 |
| `spellcasting` | none | Wizard | Phase 3 |

### Proposed New Effect Kinds

| Effect Kind | Payload Shape | Purpose |
|-------------|---------------|---------|
| `healing-bonus` | `{ amount: string }` | Disciple of Life, etc. |
| `maximize-healing` | none | Supreme Healing |
| `spell-protection` | none | Sculpt Spells |
| `attack-bonus` | `{ amount: string }` | Sacred Weapon |
| `metamagic-option` | `{ id: string; cost: number }` | Twinned, Quickened, etc. |
| `inspiration-die` | `{ dieSize: number }` | Bardic Inspiration |
| `channel-option` | `{ id: string; effect: string }` | Turn Undead, etc. |
| `wild-shape-cr` | `{ maxCR: string; swimming?: boolean; flying?: boolean }` | Druid Wild Shape |

---

## Sign-Off

Please review this plan and confirm:
1. The architecture approach (read-time evaluation) is acceptable
2. The phase breakdown and timeline is reasonable
3. The scope (what's in/out) matches your expectations
4. Any additional requirements or constraints

Once approved, implementation will proceed on this branch.
