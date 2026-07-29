# Class & Race Assessment: Engine Fidelity vs 5e SRD

> **Assessment date**: July 29, 2026  
> **Scope**: All 9 races and 12 classes defined in the codebase, compared against the 5e SRD to determine how faithfully each can actually play mechanically.  
> **Method**: Review of data catalogs (`data/classes.ts`, `data/races.ts`, `data/feats.ts`, `data/spells.ts`), engine services (`classEngine.ts`, `combatService.ts`, `spellcastingService.ts`, `spellcastingEngine.ts`, `conditionEngine.ts`, `inventoryService.ts`, `travelService.ts`, `progressionService.ts`, `featsService.ts`, `mcpService.ts`), LLM prompt instructions (`toolModePrompt.ts`), and agent loop integration.

---

## Three-Tier Definition

- **Clearly Working** — The feature has mechanical engine support that matches 5e SRD. Player gets the intended benefit without LLM fiat.
- **Moderately Working** — Some signature features have engine support; others rely on LLM prompt instructions or are partially implemented. Playable but requires trust in the LLM to enforce rules.
- **Clearly Broken** — The class's core/iconic feature has no engine support or is fundamentally disconnected. Playing the class as intended by 5e SRD is not possible without significant LLM fiat.

---

## RACES

### Clearly Working

| Race | Why |
|------|-----|
| **Human** | +1 all stats, speed 30, medium, common+any language. Simple and fully wired. Missing variant human option (no feat at L1). |
| **Dwarf** | +2 CON / +1 WIS. Darkvision 60. **Dwarven Resilience**: poison save advantage and poison damage resistance both wired via engine (`conditionEngine` poison resistance, `classEngine` save bonus). Stonecunning description present. Missing subraces (Hill, Mountain). |
| **Elf** | +2 DEX / +1 INT. Darkvision 60. **Keen Senses**: Perception proficiency applied. **Fey Ancestry**: charm-save advantage fully wired (`combatService.ts:876-883`), sleep immunity wired (`inventoryService.ts:534` skipping sleep-target Fey Ancestry chars). Trance description. Missing subraces (High, Wood, Dark). |
| **Gnome** | +2 INT. Darkvision 60. **Gnome Cunning**: INT/WIS/CHA save advantage vs magic wired via `conditionEngine` effect system. Missing subraces (Forest, Rock). |
| **Dragonborn** | +2 STR / +1 CHA. **Breath Weapon** resource pool fully wired: `use_resource('breath-weapon')` in `spellcastingService.ts` computes DC (8+CON+prof) and damage dice with level scaling. Missing: subraces (chromatic/metallic), damage resistance from ancestry is **prompt-only** (engine `getDamageResistances` never called in damage pipeline). |
| **Half-Elf** | `flexible-2` ASI system works correctly via `asiUtils.ts` (CHA +2 base from CHA+1 + flexible +1). **Fey Ancestry** wired (see Elf). **Skill Versatility** wired (2 additional skill proficiencies). Missing: +2 CHA baseline (5e PHB gives +2 CHA flat, then two +1s — current system produces equivalent result via different path). |

### Moderately Working

| Race | Why |
|------|-----|
| **Half-Orc** | +2 STR / +1 CON. Darkvision 60. **Savage Attacks**: crit bonus die IS implemented (`combatService.ts` adds extra weapon die on crit). **Relentless Endurance**: resource pool exists (`classEngine.ts:368`), but has **no 0-HP trigger** — when the character drops to 0 HP, the engine does NOT auto-activate it. LLM must notice and apply it narratively. |
| **Tiefling** | +1 INT / +2 CHA. Darkvision 60. **Hellish Resistance**: fire resistance is **prompt-only** (same player-damage-resistance gap as Dragonborn). **Infernal Legacy**: thaumaturgy cantrip known, hellish rebuke resource pool exists, darkness known — but no mechanical trigger or spell-casting integration for any of them. LLM must narratively cast these. Missing subraces (Levistus, Glasya, Dispater, Zariel, etc.). |
| **Halfling** | +2 DEX / +1 CHA. 25ft speed, Small size. **Lucky** (reroll 1s on attacks/checks/saves): **prompt-only** — engine does NOT auto-reroll natural 1s. **Brave** (frightened save advantage): wired via effect system. **Halfling Nimbleness**: narrative only. Missing subraces (Lightfoot, Stout). |

### Structural Race Gaps

| Gap | Detail |
|-----|--------|
| **No subraces** | Every race has a single monolithic profile. No High/Wood/Dark elves, no Hill/Mountain dwarves, no Lightfoot/Stout halflings, no variant human, no chromatic/metallic dragonborn, no Forest/Rock gnomes. |
| **Player damage resistances not applied** | `getDamageResistances()` (`classEngine.ts:219-233`) exists and correctly reads racial trait data, but `inflict_damage` (`inventoryService.ts`) never calls it for player targets. Dwarf poison resistance, Tiefling fire resistance, Dragonborn ancestry resistance — all ignored. The prompt explicitly tells the LLM to apply full damage narratively. |
| **No subrace spell-like abilities** | Drow magic, High Elf cantrip, Tiefling variations — none have engine support. Infernal Legacy's hellish rebuke and darkness exist only as resource pool skeletons. |

---

## CLASSES

---

### CLEARLY WORKING

#### Wizard
| Feature | Status |
|---------|--------|
| Full spellcasting (INT, prepared, ritual) | **Wired** — `spellcastingEngine.ts` handles slot consumption, prepared spells, ritual casting |
| Arcane Recovery | **Wired** — `travelService.ts:658-691` + modal. Recovers `ceil(level/2)` slot levels 1/day |
| School of Evocation subclass | **Present** — Arcane Tradition at L2. Features (Sculpt Spells, Potent Cantrip, Empowered Evocation, Overchannel) are **prompt-only** but subclass identity works |
| Spell Mastery (L18) | **Prompt-only** — no mechanical free-cast tracking |
| Signature Spells (L20) | **Prompt-only** — no mechanical free-cast tracking |
| **Verdict**: The best-supported caster. Spellcasting, Arcane Recovery, and wizard-specific spellbook management (2 spells/level on learn, prepare from spellbook) all work. High-level features are narrative but the core class functions faithfully.

#### Warlock
| Feature | Status |
|---------|--------|
| Full spellcasting (CHA, known, pact magic) | **Wired** — `classEngine.ts:344-358` creates `pactMagic` resource pool. `findSpellSlot()` routes to pact slots. Short-rest recharge. Always maximum-slot-level casting. |
| Eldritch Invocations | **Prompt-only** (correctly — invocations are a complex system) |
| Pact Boon (L3) | **Prompt-only** — no familiar, blade, or tome mechanics |
| Mystic Arcanum (L11+) | **NOT implemented** — 6th-9th level once-per-long-rest spells are missing. This is a real gap at high levels. |
| The Fiend subclass | **Prompt-only** — Dark One's Blessing, Dark One's Own Luck, Fiendish Resilience, Hurl Through Hell are all narrative |
| Eldritch Master (L20) | **Prompt-only** |
| **Verdict**: Pact Magic itself works correctly. The LLM can cast spells at max pact slot level and recover on short rest. The lack of Mystic Arcanum makes high-level play less impactful, and all subclass features are narrative.

#### Fighter
| Feature | Status |
|---------|--------|
| Second Wind | **Wired** — `use_resource('second-wind')` heals `1d10 + fighter level` HP |
| Action Surge | **Pool tracked** (1 use → 2 at L17, short rest). No extra-action mechanic — LLM must narrate the second action |
| Fighting Style | **Partial** — GWF reroll (1s/2s on heavy melee) wired in `combatService.ts:1137-1141`. Dueling (+2 with one-handed) wired. TWF (add mod to off-hand) wired. Archery (+2 ranged) is **prompt-only** (no +2 to ranged attack rolls). Defense (+1 AC) is **prompt-only**. |
| Extra Attack | **Prompt-level** — engine does not enforce attack count per action. LLM can attack any number of times. |
| Indomitable | **Pool tracked** (1→2→3 uses). No mechanical reroll trigger. |
| Champion subclass | **Prompt-only** — Improved Critical (19-20), Remarkable Athlete, Superior Critical (18-20), Survivor. Crit range is NOT expanded in engine (only nat 20 crits). |
| **Verdict**: Second Wind and GWF work. Action Surge and Extra Attack rely on LLM honesty. Crit-focused Champion can't function as intended because the engine doesn't support expanded crit ranges.

#### Cleric
| Feature | Status |
|---------|--------|
| Full spellcasting (WIS, prepared, ritual) | **Wired** |
| Channel Divinity | **Pool tracked** (1→2→3, short rest). **No `use_resource` handler** — cannot mechanically spend it |
| Divine Domain (L1) | **Works** — Life Domain selected at L1 |
| Life Domain: Heavy Armor Proficiency | **Wired** — `canEquipArmor()` handles Life Domain clerics |
| Life Domain: Disciple of Life | **Prompt-only** — no +2+spell-level bonus to healing |
| Life Domain: Blessed Healer | **Prompt-only** — no self-heal on casting healing spells |
| Life Domain: Divine Strike | **Prompt-only** — no 1d8 radiant on weapon hit |
| Life Domain: Supreme Healing | **Prompt-only** — no auto-max on healing dice |
| Destroy Undead | **Prompt-only** — no CR-based destruction on Turn |
| Divine Intervention (L10) | **Prompt-only** |
| **Verdict**: Core casting works. As a heal/buff caster, the class functions. But Channel Divinity (a core class feature from L2) has no mechanical effect, and Life Domain's healing bonuses are purely narrative.

#### Barbarian
| Feature | Status |
|---------|--------|
| Rage resource pool | **Wired** — `classEngine.ts:272-279` creates pool scaling 2→3→4→5→6→unlimited |
| `use_resource('rage')` | **Wired** — sets `char.raging=true`, breaks concentration, returns rage bonus number |
| Rage damage bonus | **NOT applied** — `player_attack` never reads `char.raging` or adds +2/+3/+4 damage. Prompt tells LLM to add it narratively. |
| Rage B/P/S resistance | **NOT applied** — `inflict_damage` never checks `raging` for player resistance |
| Unarmored Defense (10+DEX+CON) | **Wired** — `classEngine.ts:108-110` |
| Reckless Attack (L2) | **Prompt-only** — no advantage on melee attacks, no advantage against you |
| Danger Sense (L2) | **Prompt-only** — no DEX save advantage |
| Extra Attack | **Prompt-level** (see Fighter) |
| Fast Movement (+10ft, no heavy armor) | **Wired** — `classEngine.ts:112` via speed-bonus effect |
| Feral Instinct (L7) | **Prompt-only** — no initiative advantage, no surprise bypass |
| Brutal Critical (L9/13/17) | **Prompt-only** — `player_attack` does not add extra crit dice from class features (only from Half-Orc Savage Attacks) |
| Relentless Rage (L11) | **Prompt-only** — no 0-HP CON save mechanic |
| Persistent Rage (L15) | **Prompt-only** — rage ends only if chosen (currently auto-ends on narrate_turn without combat) |
| Berserker: Frenzy | **Prompt-only** — no bonus action attack, no exhaustion applied after rage |
| **Verdict**: The Rage framework (pool, activation, raging flag) works. But **the actual mechanical benefits of raging — bonus damage and B/P/S resistance — are not applied**. Playing a Barbarian means the LLM must manually adjust damage numbers and narratively skip damage. This is playable but unreliable.

---

### MODERATELY WORKING

#### Rogue
| Feature | Status |
|---------|--------|
| Sneak Attack: dice calculation | **Wired** — `combatService.ts:1158-1163` rolls proper dice count when `isSneakAttack:true`. Scales 1d6 at L1 → 10d6 at L19. Crit doubles. |
| Sneak Attack: conditions | **NOT enforced** — no "once per turn" limit, no "finesse/ranged weapon" check, no "advantage or ally adjacent" check. All LLM-controlled. |
| Expertise (L1, L6) | **Prompt-level** — skill bonus is applied during character creation but can't be freely re-chosen in play |
| Thieves' Cant | **Narrative** |
| Cunning Action (L2) | **Prompt-only** — no bonus action Dash/Disengage/Hide |
| Uncanny Dodge (L5) | **Prompt-only** — no halve-damage reaction |
| Evasion (L7) | **Prompt-only** — no half-or-zero DEX save mechanic |
| Reliable Talent (L11) | **Prompt-only** — no "9 or lower = 10" floor |
| Blindsense (L14) | **Prompt-only** |
| Slippery Mind (L15) | **Wired** — `getSavingThrowBonus` adds WIS proficiency for L15+ Rogues |
| Elusive (L18) | **Prompt-only** |
| Stroke of Luck (L20) | **Prompt-only** |
| Thief subclass | **Prompt-only** — Fast Hands, Second-Story Work, Supreme Sneak, Use Magic Device, Thief's Reflexes are all narrative |
| **Verdict**: Sneak Attack dice roll correctly, which is the core damage feature. But the conditions that gate Sneak Attack (finesse, advantage/ally) are entirely LLM-enforced, and most Rogue utility features (Cunning Action, Uncanny Dodge, Evasion) have zero engine support. A Rogue can deal proper Sneak Attack damage but cannot mechanically perform Rogue-defining actions.

#### Paladin
| Feature | Status |
|---------|--------|
| Half casting (CHA, prepared) | **Wired** |
| Lay on Hands | **Wired** — `use_resource('lay-on-hands-pool')` restores HP (pool = 5 × level) |
| Divine Sense | **Pool tracked** (1+CHA mod, long rest). No mechanical trigger. |
| **Divine Smite (L2)** | **NOT implemented** — **ZERO engine code**. No slot-for-smite mechanic. No bonus radiant damage on `player_attack`. The feature exists only as a text description in `data/classes.ts`. |
| **Improved Divine Smite (L11)** | **NOT implemented** — no +1d8 radiant on all melee hits |
| Fighting Style | Works same as Fighter |
| Divine Health (L3) | **Prompt-only** — disease immunity not tracked |
| Aura of Protection (L6) | **Prompt-only** — no CHA-to-saves for nearby creatures |
| Aura of Courage (L10) | **Prompt-only** — no fear immunity aura |
| Cleansing Touch (L14) | **Prompt-only** |
| Oath of Devotion | **Prompt-only** — Sacred Weapon, Turn the Unholy, Aura of Devotion, Holy Nimbus |
| **Verdict**: Lay on Hands works. But **Divine Smite — arguably the Paladin's most iconic feature — has zero engine support**. A Paladin cannot mechanically expend a spell slot to deal bonus radiant damage on a hit. This is a critical gap for a class whose identity is built around smiting.

#### Ranger
| Feature | Status |
|---------|--------|
| Half casting (WIS, known) | **Wired** |
| Favored Enemy (L1) | **Prompt-only** — no tracking/recall advantage |
| Natural Explorer (L1) | **Prompt-only** — no favored terrain bonuses |
| Fighting Style | Works (GWF and Protection excluded from choices per 5e) |
| Primeval Awareness (L3) | **Prompt-only** |
| Land's Stride (L8) | **Prompt-only** |
| Hide in Plain Sight (L10) | **Prompt-only** |
| Vanish (L14) | **Prompt-only** |
| Feral Senses (L18) | **Prompt-only** |
| Foe Slayer (L20) | **Prompt-only** |
| Hunter subclass | **Prompt-only** — Colossus Slayer, Giant Killer, Horde Breaker, Multiattack options, Evasion — all narrative |
| **Verdict**: Spellcasting works. Everything else a Ranger does — tracking, favored terrain, subclass combat features — is prompt-driven. The class is a competent half-caster martial with no mechanical Ranger identity.

#### Sorcerer
| Feature | Status |
|---------|--------|
| Full spellcasting (CHA, known) | **Wired** |
| Sorcery Points | **Pool tracked** (max=level, long rest). **No `use_resource('sorcery-points')` handler** — cannot mechanically spend them. |
| **Metamagic (L3+)** | **NOT implemented** — no Twin/Quicken/Subtle/Empowered/Careful/Distant/Extended/Heightened. Sorcery points can only exist, never be spent. |
| Sorcerous Origin (L1) | Works — Draconic Bloodline |
| Draconic Resilience: AC | **Wired** — `classEngine.ts:115-117` — AC = 13 + DEX when unarmored |
| Draconic Resilience: +1 HP/level | **Wired** — `calculateMaxHp` (`classEngine.ts:38`) |
| Elemental Affinity (L6) | **Prompt-only** — no CHA mod added to matching damage type |
| Dragon Wings (L14) | **Prompt-only** |
| Draconic Presence (L18) | **Prompt-only** |
| Sorcerous Restoration (L20) | **Prompt-only** |
| **Verdict**: Spellcasting and Draconic Resilience work. But **Metamagic — the Sorcerer's defining feature — has zero engine support**. Sorcery Points cannot be spent on anything. A Sorcerer is functionally just a CHA-based caster with extra HP and AC, missing the entire point of the class.

#### Bard
| Feature | Status |
|---------|--------|
| Full spellcasting (CHA, known, ritual) | **Wired** |
| Bardic Inspiration | **Pool tracked** (max=CHA mod, long rest → short rest at L5). **No mechanical die** — no way to give a BI die, no way to roll it, no way to add it to a roll. Prompt instructs LLM to track it narratively. |
| Jack of All Trades (L2) | **Prompt-only** — no half-proficiency to non-proficient checks |
| Song of Rest (L2) | **Prompt-only** — no extra HP on short rest |
| Expertise (L3, L10) | **Prompt-level** — same as Rogue |
| Countercharm (L6) | **Prompt-only** |
| College of Lore | Cutting Words, Additional Magical Secrets, Peerless Skill — all **prompt-only** |
| **Verdict**: Spellcasting works. But **Bardic Inspiration has no mechanical implementation — the Bard's core support feature is entirely prompt-driven**. The class functions as a CHA caster with extra skills but cannot actually inspire allies mechanically.

---

### CLEARLY BROKEN

#### Monk

The Monk is in the worst state of any class. Its core resource (ki) is technically creatable but fundamentally inoperable at the engine level.

| Feature | Status |
|---------|--------|
| Unarmored Defense (10+DEX+WIS) | **Wired** — `classEngine.ts:112-113` |
| Martial Arts: die scaling (1d4→1d10) | **Wired** — `combatService.ts:1117-1121` |
| Martial Arts: bonus action unarmed | **Prompt-only** — no bonus action economy |
| Ki pool creation | **Wired** — `classEngine.ts:263-264` — max=level, resetOn='short' |
| **`use_resource('ki')` handler** | **MISSING** — `spellcastingService.ts:816-853` switch handles `second-wind`, `rage`, `lay-on-hands-pool`, `breath-weapon` but NOT `ki`. Attempting to spend ki would return an error. |
| Flurry of Blows (L2, 1 ki) | **Zero engine support** — no extra unarmed strikes, no bonus action trigger |
| Patient Defense (L2, 1 ki) | **Zero engine support** — no Dodge action |
| Step of the Wind (L2, 1 ki) | **Zero engine support** — no Dash/Disengage action |
| **Stunning Strike (L5, 1 ki)** | **Zero engine support** — no CON save, no stunned condition |
| Deflect Missiles (L3) | **Prompt-only** |
| Slow Fall (L4) | **Prompt-only** |
| Unarmored Movement | **Wired** — +10ft speed bonus via effect system |
| Stillness of Mind (L7) | **Prompt-only** |
| Purity of Body (L10) | **Prompt-only** |
| Diamond Soul (L14) | **Prompt-only** — proficiency on all saves not implemented |
| Empty Body (L18) | **Prompt-only** |
| Perfect Self (L20) | **Prompt-only** |
| Way of the Open Hand | **Prompt-only** — Open Hand Technique, Wholeness of Body, Tranquility, Quivering Palm |
| **Verdict**: The Monk has the most fundamental engine gap. The ki pool exists but cannot be spent. Flurry of Blows, Stunning Strike — the Monk's identity — have zero mechanical path. The prompt at `toolModePrompt.ts:83` explicitly instructs the LLM that a level-1 monk "has not yet learned to channel ki" and to narrate unarmed strikes via `player_attack`. Every Monk ability is a roleplay prompt. **The Monk cannot function as a Monk in 5e terms.**

#### Druid

| Feature | Status |
|---------|--------|
| Full spellcasting (WIS, prepared, ritual) | **Wired** |
| Wild Shape: resource pool | **Wired** — `classEngine.ts:297-299` — max=2→∞, resetOn='short' |
| **Wild Shape: `use_resource` handler** | **MISSING** — **same problem as Ki**. The pool exists but cannot be spent. |
| **`polymorph_creature` tool** | **Exists** (`mcpService.ts:289-310`) — routes to `transformationEngine.ts`, creates proper TransformationState with beast stats/HP/attacks. **BUT**: it does NOT consume a wild-shape charge, does NOT check remaining uses, does NOT validate CR limits vs druid level. **Two completely disjoint paths that never talk to each other.** |
| Wild Shape: swimming (L4), flying (L8) | **Prompt-only** |
| Circle of the Land: Natural Recovery | **Prompt-only** — no slot recovery on short rest |
| Circle of the Land: Land's Stride | **Prompt-only** |
| Beast Spells (L18) | **Prompt-only** |
| Archdruid (L20) | **Prompt-only** — unlimited Wild Shape not enforced (pool already has max=9999 at L20) |
| **Verdict**: The Wild Shape system is fundamentally broken. Two independent systems exist (resource pool + `polymorph_creature` tool) that are completely disconnected. The druid cannot mechanically wild shape using the resource pool, and shapeshifting via the LLM tool does not interact with the pool at all. CR limits are not checked. **Playing a Druid means either: (a) ignoring Wild Shape charges entirely, or (b) having charges you can never spend.**

---

## Summary Table

### Classes

| Class | Tier | Core Engine Gaps |
|-------|------|------------------|
| **Fighter** | Clearly Working | Second Wind & GWF wired. Action Surge pool tracked, no extra action mechanic. Crit range not expanded for Champion. |
| **Wizard** | Clearly Working | Full casting + Arcane Recovery wired. High-level features (Spell Mastery, Signature Spells) prompt-only. |
| **Cleric** | Clearly Working | Full casting wired. Channel Divinity pool cannot be spent (no handler). Life Domain healing bonuses prompt-only. |
| **Warlock** | Clearly Working | Pact Magic fully wired (short rest, max slot). **Mystic Arcanum missing** (no 6th-9th spells). Subclass entirely prompt-only. |
| **Barbarian** | Clearly Working | Rage framework (pool, activation, raging flag) works. **Rage damage bonus and B/P/S resistance NOT applied** — LLM must adjust. Brute-force path mostly intact. |
| **Rogue** | Moderately Working | Sneak Attack dice calculate correctly. **No condition enforcement** (once/turn, finesse, advantage/ally). Cunning Action, Uncanny Dodge, Evasion — all prompt-only. |
| **Paladin** | Moderately Working | Lay on Hands wired. **Divine Smite has zero engine support** — can't expend slots for radiant damage. Aura features prompt-only. |
| **Ranger** | Moderately Working | Half casting wired. **All class identity features (Favored Enemy, Natural Explorer, subclass)** — prompt-only. Functions as a generic martial half-caster. |
| **Sorcerer** | Moderately Working | Full casting + Draconic Resilience wired. **Metamagic has zero engine support** — sorcery points cannot be spent. |
| **Bard** | Moderately Working | Full casting wired. **Bardic Inspiration has no mechanical die** — cannot be given or rolled. Support functions prompt-only. |
| **Monk** | **Clearly Broken** | Ki pool exists but **has no `use_resource` handler** — cannot be spent. **Flurry of Blows, Stunning Strike, Patient Defense, Step of the Wind — zero engine support.** Unarmored Defense and Martial Arts die work. The class cannot function as a Monk. |
| **Druid** | **Clearly Broken** | Wild Shape pool exists but has **no `use_resource` handler**. `polymorph_creature` tool exists but is **completely disconnected** from the resource pool — no charge consumption, no CR check. Two disjointed systems. |

### Races

| Race | Tier | Core Engine Gaps |
|------|------|------------------|
| **Human** | Clearly Working | No variant human (no L1 feat). |
| **Dwarf** | Clearly Working | Poison resistance + save advantage wired. No subraces. |
| **Elf** | Clearly Working | Fey Ancestry (charm + sleep) wired. Keen Senses wired. No subraces. |
| **Gnome** | Clearly Working | Gnome Cunning (INT/WIS/CHA save vs magic) wired. No subraces. |
| **Dragonborn** | Clearly Working | Breath Weapon fully wired (resource + scaling). Damage resistance prompt-only. No subraces. |
| **Half-Elf** | Clearly Working | Flexible ASI system works. Fey Ancestry wired. Skill Versatility wired. No +2 CHA: the system achieves the same result via a different path. |
| **Half-Orc** | Moderately Working | Savage Attacks (crit bonus) wired. Relentless Endurance pool exists but **0-HP trigger not implemented**. |
| **Tiefling** | Moderately Working | ASI + darkvision correct. Hellish Resistance (fire) prompt-only. Infernal Legacy (hellish rebuke/darkness) pool exists but no mechanical casting integration. |
| **Halfling** | Moderately Working | Brave (frightened advantage) wired. **Lucky (reroll 1s) is prompt-only** — engine does NOT auto-reroll. No subraces. |

### Structural Gaps Across All Races & Classes

| Gap | Impact |
|-----|--------|
| **No subraces** | Every race has exactly one profile. Drow, wood elves, hill dwarves, lightfoot halflings, etc. are unplayable. |
| **1 subclass per class** | Only 1 of ~6+ SRD subclasses is implemented per class. Battle Master, Totem Warrior, Moon Druid, Hexblade, Vengeance Paladin, Arcane Trickster, Wild Magic Sorcerer, etc. — all absent. |
| **Player damage resistances never applied** | `getDamageResistances()` exists but `inflict_damage` never calls it for player targets. All racial/class resistances are prompt-only. |
| **No action economy enforcement** | No bonus action tracking, no "once per turn" enforcement, no reaction spending. Extra Attack, Sneak Attack, Cunning Action, Flurry of Blows — all rely on LLM honesty. |
| **No crit range expansion** | Champion 19-20, Hexblade's curse — only nat 20 crits in engine. |
| **No cover/obstruction** | Ranged-in-melee disadvantage, half/three-quarters cover — all absent. |
| **No opportunity attacks** | Feats like Mobile that reference OA immunity note "engine ignores OAs" in their descriptions. |

---

## Addendum: Corrections & Additional Findings

> **Added**: July 29, 2026  
> **Method**: Deep review of `combatService.ts:make_save`, `characterCreationService.ts`, `conditionEngine.ts`, and `spellcastingService.ts:use_resource`.

### Corrections to Previous Claims

The initial assessment contained several overstated claims about features being "wired." The following features have catalog entries and effect payloads but are **NOT actually consumed by any engine code**:

| Feature | Previous Claim | Actual Status | Evidence |
|---------|---------------|---------------|----------|
| **Gnome Cunning** (INT/WIS/CHA save advantage vs magic) | "Wired via `conditionEngine` effect system" | **NOT wired** — `make_save` in `combatService.ts` only checks for Fey Ancestry (`combatService.ts:876-883`). The `advantage-on-save` effect payload in `data/races.ts` is never read by any save-rolling code. | `Select-String combatService.ts "gnome\|cunning"` returns no matches. |
| **Halfling Brave** (frightened save advantage) | "Wired via effect system" | **NOT wired** — same issue. `make_save` does not check for the `brave` racial trait. The effect payload exists but is never consumed. | `Select-String combatService.ts "brave\|halfling"` returns no matches. |
| **Elf Keen Senses** (Perception proficiency) | "Perception proficiency applied" | **NOT auto-applied** — `characterCreationService.ts` does not add Perception proficiency for Elves. The `allocatedSkills` come entirely from the wizard's `allocatedSkills` state; the race catalog's `keen-senses` trait is never processed during character creation. | `Select-String characterCreationService.ts "perception\|keen"` returns no matches. |

### Additional Engine Gaps

#### Condition Immunities — Class Features Not Supported
- `applyCondition` (`conditionEngine.ts:30-37`) checks `conditionsImmunities` for both Character and Enemy targets. This means **racial** immunities (Elf/Half-Elf sleep immunity from Fey Ancestry) DO work for players.
- However, **class features that grant condition immunities have no mechanism to set `conditionsImmunities`**:
  - **Monk Purity of Body (L10)**: "immune to disease and poison" — no engine path adds these to `conditionsImmunities`. The class catalog lists it as `kind: 'passive'` with no effect payload.
  - **Paladin Aura of Courage (L10)**: "can't be frightened" — no engine implementation.
  - **Druid Nature's Ward (L10)**: "can't be charmed or frightened by elementals or fey" — no engine implementation.
- **Result**: These class features are purely narrative. A Monk can be poisoned, a Paladin can be frightened, despite their class features saying otherwise.

#### No Advantage/Disadvantage on Skill Checks
- The `check_skill` tool (`travelService.ts:253-332`) rolls a single d20 with no advantage/disadvantage mechanic.
- Features that should grant advantage on skill checks are not enforced:
  - **Dwarf Stonecunning**: advantage on INT(History) checks about stonework — not applied.
  - **Rogue Reliable Talent**: no "9 or lower = 10" floor on skill checks.
  - **Halfling Lucky**: reroll 1s on ability checks — not applied (previously noted as prompt-only, but worth emphasizing that the engine doesn't even auto-reroll).
  - **Gnome Cunning**: advantage on INT/WIS/CHA saves vs magic — not applied (see corrections above).
- The LLM must manually apply these benefits narratively.

#### Tiefling Spell-Like Abilities Not Auto-Learned
- The Tiefling's `infernal-legacy` trait grants: thaumaturgy cantrip, hellish rebuke (1/LR at L3), darkness (1/LR at L5).
- **None of these are auto-learned during character creation.** `characterCreationService.ts` does not process racial spell-like abilities.
- The hellish-rebuke resource pool is created by `recalculateResourcePools` (`classEngine.ts:368-380`) but has no mechanical casting integration — same gap as Dragonborn Breath Weapon had before it was wired.
- **Result**: A Tiefling player must ask the LLM to "cast" these spells, and the LLM must narratively track usage. There is no `use_resource('hellish-rebuke')` handler that actually casts the spell.

#### Dragonborn Breath Weapon — Confirmed Wired
- **Correction**: The initial assessment listed Dragonborn Breath Weapon as "fully wired." This is **correct** — `spellcastingService.ts:840-850` handles `use_resource('breath-weapon')` with proper DC calculation (8+CON+prof), damage dice scaling (2d6→5d6), and damage type selection from draconic ancestry.
- **Remaining gap**: The damage resistance from draconic ancestry is still prompt-only (same player-damage-resistance gap affecting all races).

### Summary of Tier Changes

Based on the corrections above, the following tier adjustments are warranted:

| Race | Previous Tier | Corrected Tier | Reason |
|------|--------------|----------------|--------|
| **Gnome** | Clearly Working | **Moderately Working** | Gnome Cunning (the race's signature defensive feature) is not actually applied in saves. |
| **Halfling** | Moderately Working | **Clearly Broken** | Brave is not wired (not just Lucky). Both signature racial features are non-functional. |
| **Elf** | Clearly Working | **Moderately Working** | Keen Senses (Perception proficiency) is not auto-applied. Fey Ancestry still works. |

### Updated Race Summary Table

| Race | Tier | Core Engine Gaps |
|------|------|------------------|
| **Human** | Clearly Working | No variant human (no L1 feat). |
| **Dwarf** | Clearly Working | Poison resistance + save advantage wired. No subraces. Stonecunning not applied in skill checks. |
| **Elf** | Moderately Working | Fey Ancestry (charm + sleep) wired. **Keen Senses NOT auto-applied** — Perception proficiency must be manually allocated during creation. No subraces. |
| **Gnome** | Moderately Working | **Gnome Cunning NOT applied** in saves vs magic. Darkvision wired. No subraces. |
| **Dragonborn** | Clearly Working | Breath Weapon fully wired (resource + scaling). Damage resistance prompt-only. No subraces. |
| **Half-Elf** | Clearly Working | Flexible ASI system works. Fey Ancestry wired. Skill Versatility wired. No subraces. |
| **Half-Orc** | Moderately Working | Savage Attacks (crit bonus) wired. Relentless Endurance pool exists but **0-HP trigger not implemented**. |
| **Tiefling** | Clearly Broken | ASI + darkvision correct. **Hellish Resistance prompt-only. Infernal Legacy spells NOT auto-learned.** No mechanical casting integration for racial spells. |
| **Halfling** | **Clearly Broken** | **Brave NOT wired. Lucky NOT wired.** Both signature racial features are non-functional. No subraces. |

---

## Addendum 2: Additional Audit Findings

> **Added**: July 29, 2026  
> **Method**: Deep cross-reference of audit report (3 subagent explore tasks) against existing WorkingVsBroken.md content. Only items NOT already covered in the main body or Addendum 1 are listed here.

### Cross-Cutting Architectural Findings

#### 1. `effect.kind` payloads are entirely dead metadata

This is the single largest architectural gap affecting classes and races. The `data/classes.ts` and `data/races.ts` catalogs define structured `effect.kind` strings like `'extra-attack'`, `'sneak-attack'`, `'reroll-ones'`, `'crit-bonus-dice'`, `'advantage-on-save'`, `'damage-resistance'`, `'weapon-damage-extra-die'` — but **there is no generic dispatcher anywhere in the engine that reads these at runtime**.

Every mechanical effect that actually works comes from a **hardcoded class-ID or race-ID string branch** in a specific service (e.g. `if (char.archetype === 'fighter')` in `classEngine.ts`, `if (raceId === 'dwarf')` in `conditionEngine.ts`). The structured `effect.kind` metadata would allow any effect to be applied generically without hardcoding, but it is **never consumed**.

**Impact**: Adding a new subclass, race variant, or feat that uses an existing `effect.kind` still requires all-new hardcoded branches. The catalog's metadata acts as documentation only. Fixing this would make features like Improved Critical, Brutal Critical, Savage Attacks, Halfling Lucky, Gnome Cunning, Dwarven Resilience, and many others work automatically from catalog data alone.

| Affected `effect.kind` values | Classes/Races that define them | Runtime Status |
|---|---|---|
| `'extra-attack'` | Fighter L5, Paladin L5, Barbarian L5, Monk L5, Ranger L5 | Ignored — all multiattack is LLM-driven |
| `'sneak-attack'` | Rogue L1 | Hardcoded in `combatService.ts` (works by ID match) |
| `'reroll-ones'` | Halfling Lucky | Ignored |
| `'crit-bonus-dice'` | Half-Orc Savage Attacks | Hardcoded in `combatService.ts:1117-1121` (works by ID match) |
| `'advantage-on-save'` | Gnome Cunning, Halfling Brave | Ignored (only Fey Ancestry charm works, via dedicated `charmSave` flag on `make_save`) |
| `'damage-resistance'` | Dwarf poison, Dragonborn ancestry, Tiefling fire | Ignored for player targets |
| `'damage-immunity'` | (none currently in data) | N/A |
| `'weapon-damage-extra-die'` | Half-Orc Savage Attacks | Same `crit-bonus-dice` hardcode — duplicate entry |
| `'bonus-action-attack'` | Monk Martial Arts, Frenzy | Ignored |
| `'condition-immunity'` | Paladin Divine Health | Ignored for class features |

#### 2. Languages never copied to Character at creation

`characterCreationService.ts` does not process the `languages` array from either the race catalog or class starting equipment. The `'one-of-choice'` sentinel string found in Human and Half-Elf language lists is never resolved to an actual language choice. As a result, `Character.languages` is always empty post-creation unless the LLM manually adds it via `updateCharacterFieldsDirectly`.

| Race | Languages in data | Actually granted at creation |
|------|------------------|---------------------------|
| Human | Common, `'one-of-choice'` | None |
| Half-Elf | Common, Elvish, `'one-of-choice'` | None |
| All others (Dwarf, Elf, Gnome, etc.) | Common + racial language | None |

#### 3. `size` field never read by any engine code

The `Character.size` and `Enemy.size` fields are populated at creation (`characterCreationService.ts` maps race size) but **no engine service reads either field**. Rules that depend on size:
- **Small creatures** (Halfling, Gnome): no speed penalty, no disadvantage on attack rolls with heavy weapons (SRD rule — Halfling/Gnome should have disadvantage with heavy weapons; this is not enforced but also not configurable)
- **Large+ creatures**: no reach/spacing enforcement, no squeezing rules
- **Grapple/Shove**: size-based limits not modeled
- **Equipment**: armor/weapon size restrictions not modeled

### Additional Class Gaps Not Previously Documented

| Class | Missing Detail | Evidence / Consequence |
|-------|---------------|-----------------------|
| **Wizard** | Spell Mastery (L18) / Signature Spells (L20) have zero implementation. No free-cast tracking for L1/L2 (Mastery) or L3 (Signature). | Listed as "prompt-only" in main body but not called out that these are completely unimplemented at the engine level — no resource pool, no UI, no engine flag. |
| **Sorcerer** | **Minor data bug**: Sorcery Points description says "+2 options" at L3, L10, L17. SRD says +1 each. | `data/classes.ts:598-600` — the `description` fields in the Metamagic feature entries say "+2 options known" but the actual count is not stored anywhere. The LLM cannot know how many metamagic options the character knows. |
| **Cleric** | **Domain spells not granted**: Life Domain should auto-prepare Bless, Cure Wounds (L1), Lesser Restoration, Spiritual Weapon (L3), Beacon of Hope, Revivify (L5), etc. These are never added to the character's known/prepared spells. | `characterCreationService.ts` has no domain-spell logic. Cleric players cannot cast their domain spells without the LLM manually granting them. |
| **Cleric** | **Destroy Undead tiering missing**: SRD says CR ½ → 1 at L8 → 2 at L11 → 3 at L14 → 4 at L17. Only CR ½ is listed. | `data/classes.ts` Destroy Undead feature only mentions CR ½. |
| **Cleric** | **Divine Intervention (L10)**: Has no resource pool or trigger. SRD says 10-minute cast, percentile roll, once per week. | The LLM must narrate this. No `use_resource('divine-intervention')` handler exists. |
| **Druid** | **Minor data bug**: Druid weapon proficiencies include `shortbow` in `data/classes.ts`. SRD druid weapons: clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears. No bows. | A Druid created via the wizard will be proficient with shortbows. Minor impact mechanically (proficiency bonus on attack rolls). |
| **Bard** | **Magical Secrets missing**: L10, L14, L18 — each should let the Bard pick 2 spells from any class list and add them to known spells. There is no mechanism for cross-class spell learning at these levels. | A L10+ Bard cannot mechanically learn Fireball, Counterspell, or other iconic cross-class picks. |
| **Bard** | **Bardic Inspiration die scaling not wired**: d6 to d8 at L5 to d10 at L10 to d12 at L15. The die type is stored but no mechanic rolls it. | File correctly notes no mechanical die at all — worth noting the scaling data exists but is dead. |
| **Paladin** | **No Oath spells**: Each Oath grants auto-prepared spells at L3, L5, L9, L13, L17 (e.g. Devotion: Protection from Evil and Good, Sanctuary, etc.). Not implemented. | Same gap as Cleric domain spells. |
| **Paladin** | **Divine Health (L3)**: Disease immunity. No `conditionImmunities` applied at L3. | The class feature text exists but `conditionEngine.ts` never adds `'disease'` to `conditionsImmunities` on level-up. |
| **Paladin** | **Cleansing Touch (L14)**: Should end one spell on a creature. No resource pool or mechanic. | Listed as "prompt-only" but with no pool tracking at all (unlike Lay on Hands or Divine Sense which have pools). |
| **Ranger** | **Favored Enemy/Natural Explorer choices not persisted**: SRD lets the Ranger pick favored enemy types and terrain types. These are never stored on the Character. | The LLM cannot know what the Ranger chose at L1/L6 (Favored Enemy) or L1/L6/L10 (Natural Explorer). |
| **Ranger** | **Missing Fighting Style option**: Two-Weapon Fighting should be available to Rangers (same as Fighter/Paladin). | Present for Fighter/Paladin but not in the Ranger fighting style choices. |
| **Rogue** | **Sneak Attack auto-detect missing**: The LLM must explicitly pass `isSneakAttack: true`. The engine does NOT check for advantage, ally adjacency, or finesse/ranged weapon. | This is mentioned in the main body as "not enforced" but worth emphasizing — the `isSneakAttack` parameter is a prompt-level toggle, not a real condition check. |
| **Fighter** | **Champion crit range never expanded**: SRD Champion gets 19-20 crit at L3, 18-20 at L15. Engine only crits on nat 20 (`combatService.ts:1156`). | A Champion Fighter whose critical hit range should be doubled in effect gets zero mechanical benefit from their subclass. |
| **Monk** | **Unarmored Movement +10 at L2 is wired** but the speed bonus table (L2: +10, L6: +15, L10: +20, L14: +25, L18: +30) is **flat +10** in engine. | `classEngine.ts:112` always applies +10 regardless of level. |
| **Monk** | **Ki pool `use_resource('ki')` handler is MISSING** in `spellcastingService.ts:816-853`. | The switch handles `second-wind`, `rage`, `lay-on-hands-pool`, `breath-weapon`, `action-surge`, but NOT `ki`. Attempting to spend ki would throw an unhandled switch error. |
| **Barbarian** | **Berserker Frenzy (L3)**: Should grant bonus action attack while raging, then 1 level of exhaustion after rage ends. Neither BA attack nor exhaustion-on-end is modeled. | The Frenzy feature in `data/classes.ts` is a passive description. |
| **Barbarian** | **Rage damage bonus progression**: +2 (L1) to +3 (L9) to +4 (L16). Stored in `char.raging` (numeric value) but `player_attack` never reads it. | The `raging` flag is set to `true`, not the numeric bonus value. The bonus value is stored nowhere accessible to the attack pipeline. |

### Additional Race Gaps Not Previously Documented

| Race | Missing Detail | Evidence / Consequence |
|------|---------------|-----------------------|
| **Halfling** | **+1 CHA is Lightfoot subrace bonus baked into base race**. SRD base Halfling only gets +2 DEX. Lightfoot gets +1 CHA. | Base Halflings should have no CHA bonus. A Halfling choosing a non-Lightfoot subrace (Ghostwise, Lotusden — not SRD, but still) would have an incorrect +1 CHA. |
| **Halfling** | **Lucky (`reroll-ones`) die size is 0**: `data/races.ts` defines `dieSize:0`, `rerollTarget:1`. | Even if the reroll mechanic were wired, `dieSize:0` would break it. This is a data error. |
| **Half-Orc** | **Savage Attacks `dieSize:0`**: Same data issue. `dieSize:0` in `data/races.ts`. | The hardcoded combatService implementation works (adds one extra weapon die) but the data catalog's payload is invalid. |
| **Tiefling** | **`hellish-rebellion` phantom resource**: `classEngine.ts:368` defines a pool with `id: 'hellish-rebellion'` that matches NO trait in `data/races.ts` (which uses `'hellish-rebuke'`). | The pool is created but never referenced by any `use_resource` handler. The correct id `'hellish-rebuke'` appears in `use_resource` switch cases but `classEngine.ts` creates the wrong id. |
| **Tiefling** | **Infernal Legacy not level-gated**: SRD grants thaumaturgy at L1 (always), hellish rebuke at L3 (1/long rest), darkness at L5 (1/long rest). No level gating exists. | A L1 Tiefling incorrectly has access to all three spells (via the resource pool). |
| **Dwarf** | **Dwarven Combat Training not applied**: SRD Dwarves get proficiency with battleaxe, handaxe, light hammer, warhammer. Not granted at creation. | Dwarf characters cannot mechanically wield their racial weapons with proficiency. |
| **Dwarf** | **Dwarven Armor Training not applied**: SRD Dwarves get proficiency with light and medium armor. Not automatically granted. | Dwarf characters must manually select armor proficiency during creation or rely on class-granted profs. |
| **Elf** | **+1 INT is High-Elf subrace bonus baked into base race**. SRD base Elf only gets +2 DEX. | High Elves get +1 INT; Wood Elves get +1 WIS; Dark Elves get +1 CHA. The current system gives every Elf +1 INT, which is incorrect for non-High-Elf subraces. |
| **Gnome** | **No subrace distinction**: Forest Gnome (DEX+1, minor illusion cantrip) and Rock Gnome (CON+1, tinker) are both lumped into +2 INT / +1 CON. | The +1 CON is correct for Rock but not for Forest, which should get +1 DEX. The minor illusion cantrip and Tinker proficiency are both absent. |
| **Half-Elf** | **+2 CHA is not in the SRD form**: SRD Half-Elf grants +2 CHA + two +1s to any stats (including CHA again, total +3). Current system: +1 CHA from race + two flexible +1s (can include CHA) = functionally equivalent but structurally different. | The file at line 276 correctly notes this. Included here for completeness — no mechanical bug, but the code path differs from SRD. |
| **Dragonborn** | **Ancestry damage type used for Breath Weapon but NOT for damage resistance**: The same `draconicAncestry` field drives both (via `breath-weapon` handler and `getDamageResistances()`). Only the breath-weapon path is wired. | Fixing the player-damage-resistance gap (cross-cutting bug) would also fix this. |

### Tier Inconsistencies

The following classes/races have documented gaps that conflict with their assigned tier label in the Summary Table:

| Entry | Current Tier | Why It Should Be Lower | Documented Severe Gaps |
|-------|-------------|------------------------|----------------------|
| **Barbarian** | Clearly Working | Rage damage bonus AND Rage B/P/S resistance — the two defining mechanical benefits of Rage — are **not applied**. The class framework exists but delivers none of the actual combat benefit a Barbarian relies on. | Lines 104-118 document both gaps. A Barbarian that cannot deal extra rage damage or resist B/P/S while raging is mechanically just a worse Fighter with Unarmored Defense. |
| **Cleric** | Clearly Working | Channel Divinity — a core class feature from L2 — has **no `use_resource` handler** and cannot be spent. Domain spells (auto-prepared, defines subclass identity) are never granted. | Lines 90-91 (Channel Divinity pool not spendable) and Addendum 2 (domain spells missing). |
| **Half-Elf** | Clearly Working | Skill Versatility (two additional skill proficiencies) is declared "wired" at line 276 but is NOT actually processed by the creation pipeline. Same gap as Elf Keen Senses in Addendum 1. | `characterCreationService.ts` has no logic to read racial skill traits — Half-Elf does not actually get +2 skill proficiencies at creation. |

### Data Catalog Issues (Minor)

| Issue | File | Detail |
|-------|------|--------|
| **Sorcerer Metamagic count off by 1** | `data/classes.ts:598-600` | Descriptions say "+2 options" at each acquisition level; SRD grants +1. |
| **Druid has shortbow proficiency** | `data/classes.ts` | `weaponProficiencies` includes `'shortbow'`. Not in SRD druid weapon list. |
| **Half-Orc Savage Attacks `dieSize: 0`** | `data/races.ts` | The data payload for `'crit-bonus-dice'` uses `dieSize: 0` — a stub. The hardcoded engine code works anyway (adds one weapon die regardless), but the data is wrong. |
| **Halfling Lucky `dieSize: 0`** | `data/races.ts` | Same issue. `'reroll-ones'` effect with `dieSize: 0`. Even if a dispatcher existed, it would try to reroll with a 0-sided die. |
| **Tiefling phantom resource id mismatch** | `classEngine.ts:368` vs `data/races.ts` | Pool id `'hellish-rebellion'` created; racial trait uses `'hellish-rebuke'`. Never match. |

### Updated Summary Table

#### Classes

| Class | Tier (this report) | Core Engine Gaps Not Previously Documented |
|-------|-------------------|----------------------------------------------|
| **Wizard** | Clearly Working | Spell Mastery/Signature Spells (L18/L20) have no engine implementation beyond text description |
| **Warlock** | Clearly Working | Mystic Arcanum missing (same as Addendum 1) |
| **Fighter** | Clearly Working | Champion crit range never expanded — subclass is mechanically broken without expanded crits |
| **Cleric** | **Moderately Working** (downgraded) | No domain spells, Channel Divinity has no handler, Divine Intervention no pool, Destroy Undead only CR 1/2 |
| **Barbarian** | **Moderately Working** (downgraded) | Rage damage bonus and B/P/S resistance both not applied — class delivers none of its defining mechanical identity |
| **Rogue** | Moderately Working | No auto-detect of Sneak Attack conditions — fully LLM-dependent |
| **Paladin** | Moderately Working | Divine Smite missing (Addendum 1), plus no Oath spells, Divine Health unimplemented |
| **Ranger** | Moderately Working | Favored Enemy/Natural Explorer choices not stored, missing TWF style option |
| **Sorcerer** | Moderately Working | Metamagic count off by 1 in data catalog |
| **Bard** | Moderately Working | Magical Secrets missing (L10/L14/L18), die scaling data exists but unused |
| **Monk** | Clearly Broken | Unarmored Movement table flat +10 at all levels (missing L6/10/14/18 scaling). `use_resource('ki')` handler is completely missing from the switch statement |
| **Druid** | Clearly Broken | shortbow in proficiencies (minor data bug) |

#### Races

| Race | Tier (this report) | Core Engine Gaps Not Previously Documented |
|------|-------------------|----------------------------------------------|
| **Human** | Clearly Working | `'one-of-choice'` language never resolved |
| **Dwarf** | Clearly Working | Dwarven Combat Training + Armor Training not applied at creation |
| **Elf** | Moderately Working | +1 INT is High-Elf subrace bonus baked into base; Keen Senses not auto-applied (Addendum 1) |
| **Gnome** | Moderately Working | Subrace lumped: Forest Gnome should get DEX+1 and minor illusion, Rock Gnome gets CON+1 and tinker |
| **Dragonborn** | Clearly Working | Ancestry damage type used for breath weapon but resistance gap (cross-cutting) |
| **Half-Elf** | **Moderately Working** (downgraded) | Skill Versatility NOT auto-applied (same creation pipeline gap as Elf Keen Senses). Extra language unresolved |
| **Half-Orc** | Moderately Working | Savage Attacks `dieSize: 0` data error (engine bypasses it) |
| **Tiefling** | Clearly Broken | Phantom `'hellish-rebellion'` resource id mismatch; Infernal Legacy not level-gated; no subrace variation |
| **Halfling** | Clearly Broken | +1 CHA is Lightfoot subrace bonus baked in; Lucky `dieSize: 0` data error; Brave not wired (Addendum 1) |
