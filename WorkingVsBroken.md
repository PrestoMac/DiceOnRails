# Classes & Races Implementation Report — Dice On Rails vs 5e SRD

> **Assessment date**: July 29, 2026
> **Scope**: All 9 races and 12 classes defined in the codebase, compared against the 5e SRD to determine how faithfully each can actually play mechanically.
> **Method**: Comprehensive review of data catalogs (`data/classes.ts`, `data/races.ts`, `data/feats.ts`), engine services (`classEngine.ts`, `combatService.ts`, `spellcastingService.ts`, `spellcastingEngine.ts`, `conditionEngine.ts`, `inventoryService.ts`, `travelService.ts`, `progressionService.ts`, `featsService.ts`, `mcpService.ts`, `effectDispatcher.ts`, `resourceHandlers.ts`, `diceEngine.ts`), LLM prompt instructions (`toolModePrompt.ts`), and agent loop integration.

---

## Summary Legend

| Rating | Meaning |
|--------|---------|
| **Clearly Working** | Core mechanics enforced by engine; plays close to SRD |
| **Moderately Working** | Core loop functional but key mechanics are prompt-only or buggy |
| **Clearly Broken** | Major SRD features missing or mechanically wrong; relies on LLM honesty |

---

## CLASSES

### Barbarian — **Moderately Working**

**Working:**
- Rage resource pool (scales correctly by level, resets on long rest) — `classEngine.ts:257-268`
- Rage damage bonus — `effectDispatcher.ts` `damage-bonus` reducer checks `character.raging`
- Unarmored Defense (`10 + DEX + CON`) — `ac-formula` reducer, functional
- Danger Sense (DEX save advantage) — `advantage-on-save` reducer, functional
- Brutal Critical — `crit-bonus-dice` reducer fires, **but uses d20 instead of weapon damage die (BUG)**

**Prompt-Only / Broken:**
- **Rage resistance to B/P/S damage** — NOT mechanically enforced. The LLM is told to apply it but the engine does not.
- **Rage advantage on STR checks/saves** — NOT enforced.
- **Reckless Attack** — advantage on your attacks AND disadvantage on attacks against you are both prompt-only.
- **Extra Attack (L5)** — no mechanical enforcement; relies on LLM calling `player_attack` twice.
- **Fast Movement (L5)** — speed bonus fires unconditionally; the `no-heavy-armor` condition is NOT checked by the reducer.
- **Feral Instinct (L7)** — surprise immunity NOT implemented.
- **Relentless Rage (L11)** — NOT implemented.
- **Persistent Rage (L15)** — NOT implemented.
- **Indomitable Might (L18)** — NOT implemented.
- **Primal Champion (L20)** — +4 STR/CON NOT implemented.

**Subclass (Berserker):** Frenzy exhaustion on rage-end is implemented (`travelService.ts:491-494`), but the bonus-action attack is prompt-only. Mindless Rage, Intimidating Presence, Retaliation — all NOT implemented.

**SRD Fidelity:** ~40%. The rage loop works but the signature defensive benefit (resistance) is not enforced, making Barbarians far squishier than SRD.

---

### Bard — **Moderately Working**

**Working:**
- Spellcasting — full caster, CHA-based, known prep mode, correct slot progression. Ritual casting: true.
- Bardic Inspiration — `resourceHandlers.ts:90-99`, functional. Die scales d6→d8→d10→d12. Target must apply manually.
- Channel Divinity (if multiclassed) — functional.

**Prompt-Only / Broken:**
- **Jack of All Trades (L2)** — NOT implemented. No half-proficiency to non-proficient checks.
- **Song of Rest (L2)** — NOT implemented. No extra 1d6 HP on short rests.
- **Expertise (L3/L10)** — NOT mechanically enforced. The `skill-expertise` effect kind exists in `types/character.ts` but has **no reducer** in `effectDispatcher.ts`.
- **Font of Inspiration (L5)** — BUG: Bardic Inspiration still resets on **long** rest (`classEngine.ts:273`). Should be short rest at L5+.
- **Countercharm (L6)** — NOT implemented.
- **Superior Inspiration (L20)** — NOT implemented.

**Subclass (Lore):** Cutting Words, Bonus Proficiencies, Additional Magical Secrets, Peerless Skill — all NOT implemented.

**SRD Fidelity:** ~50%. The core spellcasting + inspiration loop works, but Bard's identity features (expertise, Song of Rest, Jack of All Trades) are missing.

---

### Cleric — **Moderately Working**

**Working:**
- Spellcasting — full caster, WIS-based, prepared mode, correct slots. Ritual casting: true.
- Channel Divinity: Turn Undead — `resourceHandlers.ts:92-119`, functional with WIS save and turned condition.
- Divine Domain choice stored on character.
- Life Domain heavy armor proficiency — `classEngine.ts:54`, functional.

**Prompt-Only / Broken:**
- **Domain spells NOT auto-added** to prepared list — the LLM must remember them.
- **Destroy Undead (L5)** — CR-based auto-destroy NOT implemented.
- **Divine Strike (L8)** — extra 1d8 radiant damage NOT implemented.
- **Divine Intervention (L10)** — NOT implemented.
- **Disciple of Life** — extra healing NOT enforced.
- **Blessed Healer (L6)** — NOT implemented.
- **Supreme Healing (L17)** — max-damage healing NOT enforced.

**Subclass (Life):** Only heavy armor proficiency is implemented. All other features prompt-only.

**SRD Fidelity:** ~55%. Spellcasting is solid, but domain identity is almost entirely prompt-driven.

---

### Druid — **Clearly Broken**

**Working:**
- Spellcasting — full caster, WIS-based, prepared mode, correct slots. Ritual casting: true.
- Wild Shape resource pool — `resourceHandlers.ts:131-144` returns maxCR, fly/swim flags. Actual transformation requires a separate `polymorph_creature` tool call.

**Prompt-Only / Broken:**
- **Wild Shape beast stats NOT implemented** — there is no beast form stat block system. The LLM must manually describe polymorph effects.
- **Natural Recovery (L2)** — NOT implemented.
- **Land's Stride (L6)** — NOT implemented.
- **Nature's Ward (L10)** — NOT implemented.
- **Nature's Sanctuary (L14)** — NOT implemented.
- **Timeless Body (L18)** — NOT implemented.
- **Beast Spells (L18)** — NOT implemented.
- **Archdruid (L20)** — unlimited Wild Shape NOT enforced (only max=9999 at L20, which is functionally unlimited but not the SRD mechanic).

**Subclass (Land):** Bonus Cantrip, Natural Recovery, Land's Stride, Nature's Ward, Nature's Sanctuary — all NOT implemented.

**SRD Fidelity:** ~25%. Wild Shape is the Druid's signature and it is essentially a resource counter with no mechanical transformation.

---

### Fighter — **Moderately Working**

**Working:**
- Second Wind — `resourceHandlers.ts:25-29`, functional (1d10 + level heal).
- Action Surge resource pool — tracks uses correctly (1, 2 at L17), resets on short rest.
- Indomitable resource pool — tracks uses correctly, resets on long rest.
- Fighting Style choice stored on character.
- Champion: Improved Critical (L3, crit on 19-20) — `crit-range` reducer, functional.
- Champion: Superior Critical (L15, crit on 18-20) — functional.

**Prompt-Only / Broken:**
- **Fighting Style bonuses NOT enforced** — no +2 attack (Archery), no +2 damage (Dueling), no +1 AC (Defense), no GWF reroll (except via the separate feat), no Protection reaction. All prompt-only.
- **Action Surge does NOT actually grant an extra action** — the handler returns `extraAction: true` but the engine does not process a second action. Prompt-only.
- **Extra Attack (L5/11/20)** — NOT mechanically enforced. LLM must call `player_attack` multiple times.
- **Indomitable does NOT actually reroll saves** — prompt-only.
- **Remarkable Athlete (L7)** — NOT implemented.
- **Survivor (L18)** — start-of-turn healing NOT implemented.

**Subclass (Champion):** Only crit-range features work. No second fighting style, no Remarkable Athlete, no Survivor.

**SRD Fidelity:** ~45%. Second Wind works, crit fishing works, but the Fighter's core combat identity (fighting styles, action surge, extra attack) is prompt-driven.

---

### Monk — **Clearly Broken**

**Working:**
- Unarmored Defense (`10 + DEX + WIS`) — functional.
- Martial Arts die scaling (1d4→1d6→1d8→1d10) — implemented in `combatService.ts:1136-1139`.
- Ki resource pool — max = monk level, resets on short rest.
- Stunning Strike — `resourceHandlers.ts:61-83`, functional. Rolls CON save, applies stunned condition on failure.
- Purity of Body (L10) — poison immunity via `condition-immunity` reducer, functional.

**Prompt-Only / Broken:**
- **Martial Arts bonus action unarmed strike** — NOT mechanically enforced. Prompt-only.
- **Flurry of Blows** — NOT implemented. The `ki` handler only does Stunning Strike.
- **Patient Defense** — NOT implemented.
- **Step of the Wind** — NOT implemented.
- **Deflect Missiles (L3)** — NOT implemented.
- **Slow Fall (L4)** — NOT implemented.
- **Stillness of Mind (L7)** — NOT implemented.
- **Tongue of Sun and Moon (L13)** — NOT implemented.
- **Diamond Soul (L14)** — proficiency in ALL saves NOT implemented.
- **Empty Body (L18)** — NOT implemented.
- **Perfect Self (L20)** — NOT implemented.
- **Unarmored Movement** — speed bonus fires but `no-armor` condition NOT checked.

**Subclass (Open Hand):** Open Hand Technique, Wholeness of Body, Tranquility, Quivering Palm — all NOT implemented.

**SRD Fidelity:** ~30%. Stunning Strike works, but the Monk's action economy (bonus action attacks, ki abilities) is almost entirely prompt-driven.

---

### Paladin — **Moderately Working**

**Working:**
- Lay on Hands — `resourceHandlers.ts:43-49`, functional (pool = 5 × level).
- Divine Smite — `combatService.ts:1201-1218`, fully implemented. Consumes spell slot, adds radiant damage, +1d8 vs fiends/undead.
- Improved Divine Smite (L11) — `damage-bonus` reducer with `amount: '1d8'`, functional.
- Divine Health — `condition-immunity` reducer for 'diseased', **but 'diseased' is not a standard condition ID** (minor bug).
- Spellcasting — half caster, CHA-based, prepared mode, correct slots. No ritual casting (correct per SRD).

**Prompt-Only / Broken:**
- **Aura of Protection (L6)** — CHA bonus to ALL saves for nearby allies NOT implemented. This is the Paladin's most iconic feature.
- **Aura of Courage (L10)** — immunity to frightened NOT implemented.
- **Cleansing Touch (L14)** — NOT implemented.
- **Divine Sense** — returns detect info but does NOT actually detect celestials/fiends/undead.
- **Fighting Style bonuses** — NOT enforced (same as Fighter).
- **Extra Attack (L5)** — NOT mechanically enforced.

**Subclass (Devotion):** Sacred Weapon, Turn the Unholy, Aura of Devotion, Purity of Spirit, Holy Nimbus — all NOT implemented.

**SRD Fidelity:** ~50%. Divine Smite is excellent, Lay on Hands works, but Aura of Protection's absence is a massive gap.

---

### Ranger — **Clearly Broken**

**Working:**
- Spellcasting — half caster, WIS-based, known mode, correct slots. No ritual casting.
- Fighting Style choice stored (limited options, no GWF/Protection).

**Prompt-Only / Broken:**
- **Favored Enemy (L1)** — NOT implemented.
- **Natural Explorer (L1)** — NOT implemented.
- **Primeval Awareness (L3)** — NOT implemented.
- **Extra Attack (L5)** — NOT mechanically enforced.
- **Land's Stride (L8)** — NOT implemented.
- **Hide in Plain Sight (L10)** — NOT implemented.
- **Vanish (L14)** — NOT implemented.
- **Feral Senses (L18)** — NOT implemented.
- **Foe Slayer (L20)** — NOT implemented.

**Subclass (Hunter):** Hunter's Prey, Defensive Tactics, Multiattack, Superior Hunter's Defense — all NOT implemented.

**SRD Fidelity:** ~15%. Ranger is essentially a half-caster with a bow and no class features.

---

### Rogue — **Moderately Working**

**Working:**
- Sneak Attack — `combatService.ts:1180-1193`, fully implemented. Reads `extraDiceAtLevel` from effect payload, scales correctly with level.
- Lucky (if Halfling) — `reroll-ones` reducer, functional.
- Thieves' tools and skills work via normal skill check system.

**Prompt-Only / Broken:**
- **Expertise (L1/L10)** — NOT mechanically enforced. `skill-expertise` effect kind has no reducer.
- **Cunning Action (L2)** — bonus action Dash/Disengage/Hide NOT implemented.
- **Uncanny Dodge (L5)** — reaction to halve damage NOT implemented.
- **Evasion (L7)** — half damage on failed DEX saves NOT implemented.
- **Reliable Talent (L11)** — minimum 10 on proficient checks NOT implemented.
- **Blindsense (L14)** — NOT implemented.
- **Slippery Mind (L15)** — WIS save proficiency NOT implemented.
- **Elusive (L18)** — no advantage against you NOT implemented.
- **Stroke of Luck (L20)** — NOT implemented.

**Subclass (Thief):** Fast Hands, Second-Story Work, Supreme Sneak, Use Magic Device, Thief's Reflexes — all NOT implemented.

**SRD Fidelity:** ~40%. Sneak Attack is the Rogue's core and it works, but Cunning Action, Expertise, Evasion, and Uncanny Dodge are all missing.

---

### Sorcerer — **Moderately Working**

**Working:**
- Spellcasting — full caster, CHA-based, known mode, correct slots. No ritual casting.
- Sorcery Points — `resourceHandlers.ts:147-151`, tracks pool correctly.
- Metamagic — `spellcastingService.ts:210-253`, fully implemented. Twinned, Heightened, Quickened, Subtle, Empowered, Careful, Distant, Extended all work with correct point costs.
- Draconic Resilience AC (`13 + DEX`) — `ac-formula` reducer, functional.
- Draconic Resilience HP bonus (+1/level) — `classEngine.ts:39`, functional.

**Prompt-Only / Broken:**
- **Sorcerous Restoration (L20)** — NOT implemented.
- **Elemental Affinity (L6)** — damage bonus and resistance NOT enforced.
- **Dragon Wings (L14)** — flying speed NOT granted.
- **Draconic Presence (L18)** — NOT implemented.

**Subclass (Draconic):** Only AC and HP bonus work. Elemental Affinity, Dragon Wings, Draconic Presence — all NOT implemented.

**SRD Fidelity:** ~60%. Metamagic is the best-implemented subclass feature in the game. Sorcerer is one of the more playable classes.

---

### Warlock — **Clearly Broken**

**Working:**
- Pact Magic — `classEngine.ts:337-349`, correctly creates `pactMagic` resource with short-rest reset. `getMaxPactSlotLevel()` limits slot level correctly.
- Spellcasting — CHA-based, known mode. Pact slots configured correctly.

**Prompt-Only / Broken:**
- **Eldritch Invocations system NOT implemented at all** — no invocation selection, no mechanical effects (Agonizing Blast, Repelling Blast, Mask of Many Faces, etc. all missing).
- **Pact Boon (L3)** — Chain/Blade/Tome NOT implemented. No mechanical effect.
- **Mystic Arcanum (L11/13/15/17)** — NOT implemented (confirmed in AGENTS.md).
- **Eldritch Master (L20)** — NOT implemented.
- **Dark One's Blessing (L1)** — temp HP on kill NOT implemented.
- **Dark One's Own Luck (L6)** — NOT implemented.
- **Fiendish Resilience (L10)** — NOT implemented.
- **Hurl Through Hell (L14)** — NOT implemented.

**SRD Fidelity:** ~20%. Pact Magic short-rest recovery works, but without Invocations or Pact Boon, the Warlock has almost no identity.

---

### Wizard — **Clearly Working** (best-implemented class)

**Working:**
- Spellcasting — full caster, INT-based, prepared mode, correct slots. Ritual casting: true.
- Arcane Recovery — `travelService.ts:668-698`, fully functional. Recovers spell slots up to half wizard level, once per long rest.
- Ritual casting from spellbook without preparing — `spellcastingService.ts:cast_ritual`, functional.
- `pendingWizardSpells` (2 free spells per level) — tracked and decremented in `spellcastingEngine.ts:learnSpell`.
- Spellbook management UI — full prepare/unprepare, spell swap, cantrip swap, ritual highlighting.

**Prompt-Only / Broken:**
- **Spell Mastery (L18)** — NOT implemented.
- **Signature Spells (L20)** — NOT implemented.
- **Evocation Savant (L2)** — gold/time reduction is UI-only, not mechanically meaningful.
- **Sculpt Spells (L2)** — auto-success for allies NOT implemented.
- **Potent Cantrip (L6)** — NOT implemented.
- **Empowered Evocation (L10)** — INT to damage NOT implemented.
- **Overchannel (L14)** — NOT implemented.

**SRD Fidelity:** ~75%. The Wizard's core loop (spell slots, preparation, ritual casting, Arcane Recovery, spellbook management) is the most complete in the game. Only high-level capstones and subclass features are missing.

---

## RACES

### Human — **Clearly Working**
- +1 to all six stats — functional.
- Extra language — language reducer exists but "one-of-choice" is not resolved by the engine.
- **Variant Human (feat at L1) NOT implemented.**

### Elf — **Moderately Working**
- +2 DEX, +1 INT — functional.
- Darkvision 60ft — `getDarkvisionRange()` in `classEngine.ts`, functional.
- Keen Senses (Perception proficiency) — `skill-proficiency` effect on `onCharacterCreated`, functional.
- Fey Ancestry — charm-save advantage via `charmSave` flag on `make_save`, sleep immunity via `conditionsImmunities: ['sleep']`. **Partially implemented** — the charm advantage only fires when the save is explicitly tagged as charm (LLM-driven `make_save` does not pass the flag).
- Trance — NOT implemented.
- **No subraces** (High Elf, Wood Elf, Drow all missing).

### Dwarf — **Moderately Working**
- +2 CON, +1 WIS — functional.
- Darkvision — functional.
- Dwarven Resilience — poison resistance via `damage-resistance` effect, advantage via `advantage-on-save` effect. Both functional.
- Stonecunning — History proficiency granted, but expertise/double proficiency NOT enforced.
- Dwarven Combat Training — weapon proficiencies NOT granted.
- Speed 25 — implemented but not treated as reduced (no mechanical penalty for armor).
- **No subraces** (Hill Dwarf, Mountain Dwarf missing).

### Halfling — **Clearly Working**
- +2 DEX, +1 CHA — functional.
- Lucky (reroll 1s) — `reroll-ones` reducer on both `onAttackRoll` and `onSkillCheck`, fully functional.
- Brave (advantage vs frightened) — `advantage-on-save` effect, functional.
- Speed 25 — functional.
- **Halfling Nimbleness NOT implemented.**
- Small size NOT mechanically enforced (no grappling/stealth modifiers).
- **No subraces** (Lightfoot, Stout missing).

### Dragonborn — **Clearly Working**
- +2 STR, +1 CHA — functional.
- Breath Weapon — `resourceHandlers.ts:51-65`, fully functional. Damage scales 2d6→3d6→4d6→5d6, save DC calculated, damage type from ancestry.
- Damage Resistance — `damage-resistance` effect with `type: 'from-draconic-ancestry'`, resolved in `getDamageResistances()` (`classEngine.ts:221-237`), functional.
- Draconic Ancestry stored on character but no UI for selection.
- **Chromatic vs Metallic ancestry options NOT distinguished.**

### Gnome — **Moderately Working**
- +2 INT — functional.
- Darkvision — functional.
- Gnome Cunning — `advantage-on-save` with `against: 'magic'` checks `spellContext?.isMagical`, but only works for spell saves, not all magic.
- Speed 25 — functional.
- Small size NOT mechanically enforced.
- **No subraces** (Forest, Rock, Deep missing).

### Half-Elf — **Clearly Working**
- +2 CHA + two +1 choices — `getEffectiveAsiMap()` in `asiUtils.ts`, fully functional.
- Darkvision — functional.
- Fey Ancestry — same partial implementation as Elf (charm-save advantage requires LLM cooperation).
- Skill Versatility — `skill-proficiency` effect with `['_choice_', '_choice_']` but choices NOT resolved by engine.

### Half-Orc — **Clearly Working**
- +2 STR, +1 CON — functional.
- Darkvision — functional.
- Relentless Endurance — `resourceHandlers.ts:185-192`, fully functional. Sets HP to 1 when at 0, once per long rest.
- Savage Attacks — `crit-bonus-dice` effect, **but uses d20 instead of weapon damage die (same BUG as Barbarian Brutal Critical)**.
- **Menacing (Intimidation proficiency) NOT implemented.**

### Tiefling — **Moderately Working**
- +2 CHA, +1 INT — functional.
- Darkvision — functional.
- Hellish Resistance (fire resistance) — `damage-resistance` effect, functional.
- Infernal Legacy — `hellish-rebuke` resource handler (`resourceHandlers.ts:121-137`), deals 3d10 fire damage with DEX save. Functional.
- **Thaumaturgy cantrip NOT implemented.**
- **Darkness spell NOT implemented.**

---

## OVERALL SUMMARY

### Classes

| Class | Rating | SRD Fidelity | Key Gap |
|-------|--------|-------------|---------|
| Wizard | **Clearly Working** | ~75% | Subclass features, capstones |
| Sorcerer | **Moderately Working** | ~60% | Metamagic works great; subclass features missing |
| Paladin | **Moderately Working** | ~50% | Aura of Protection missing (huge) |
| Bard | **Moderately Working** | ~50% | Expertise, Song of Rest, Jack of All Trades missing |
| Cleric | **Moderately Working** | ~55% | Domain features mostly prompt-only |
| Fighter | **Moderately Working** | ~45% | Fighting styles, Action Surge, Extra Attack all prompt-only |
| Barbarian | **Moderately Working** | ~40% | Rage resistance NOT enforced (critical) |
| Rogue | **Moderately Working** | ~40% | Sneak Attack works; Cunning Action, Expertise, Evasion missing |
| Monk | **Clearly Broken** | ~30% | Ki abilities beyond Stunning Strike missing |
| Warlock | **Clearly Broken** | ~20% | Invocations, Pact Boon, Mystic Arcanum all missing |
| Druid | **Clearly Broken** | ~25% | Wild Shape has no mechanical transformation |
| Ranger | **Clearly Broken** | ~15% | Almost no class features implemented |

### Races

| Race | Rating | Key Gap |
|------|--------|---------|
| Halfling | **Clearly Working** | Lucky + Brave both work |
| Dragonborn | **Clearly Working** | Breath weapon + resistance both work |
| Half-Orc | **Clearly Working** | Relentless Endurance works; Savage Attacks has d20 bug |
| Human | **Clearly Working** | Basic ASI works; Variant missing |
| Half-Elf | **Clearly Working** | ASI + Fey Ancestry work |
| Elf | **Moderately Working** | Fey Ancestry charm-save needs LLM cooperation |
| Dwarf | **Moderately Working** | Resilience works; no subraces |
| Gnome | **Moderately Working** | Gnome Cunning only works for spell saves |
| Tiefling | **Moderately Working** | Hellish Rebuke works; other infernal legacy spells missing |

---

## CRITICAL BUGS

1. **Brutal Critical / Savage Attacks use d20** instead of the weapon's damage die — `effectDispatcher.ts:251`.
2. **Bardic Inspiration resets on long rest** at all levels — should be short rest at L5+ (`classEngine.ts:273`).
3. **Rage resistance to B/P/S is not enforced** — the most impactful Barbarian feature is prompt-only.
4. **`skill-expertise` effect kind has no reducer** — Bard and Rogue expertise is never applied.
5. **Fast Movement / Unarmored Movement conditions not checked** — speed bonuses fire regardless of armor.

---

## EFFECT SYSTEM ANALYSIS

### Effect Kinds with NO Reducer (Defined but Unimplemented)

These EffectKind values exist in the type system and are referenced by class/race/feat data but have **no reducer** in the hook registry:

- `damage-reduction` — used by Heavy Armor Master feat
- `skill-expertise` — no reducer (Bard/Rogue expertise is not mechanically enforced)
- `offhand-modifier` — used by Two-Weapon Fighting feat
- `gwf-reroll` — used by Great Weapon Fighting feat
- `initiative-bonus` — used by Alert feat
- `passive-skill-bonus` — used by Observant feat
- `death-save-bonus` — used by Durable feat
- `extra-skill-profs` — used by Skilled feat
- `charge-damage` — used by Charger feat
- `grapple-advantage` — used by Grappler feat
- `elemental-adept` — used by Elemental Adept feat
- `reaction-ac-bonus` — used by Defensive Duelist feat
- `ignore-ranged-penalty` — used by Crossbow Expert feat
- `magic-initiate` — used by Magic Initiate feat
- `ritual-caster` — used by Ritual Caster feat
- `spell-sniper` — used by Spell Sniper feat
- `temp-hp-from-level-and-cha` — used by Inspiring Leader feat
- `metamagic-option` — used by Sorcerer
- `breath-weapon` — used by Dragonborn
- `weapon-proficiency` — no reducer
- `language` — has onCharacterCreated reducer

### Hardcoded Branches (Effect System Bypasses)

Despite the effect dispatcher being designed to eliminate hardcoded class/race branches, the following hardcoded checks remain:

| File | Hardcoded Check | Should Use Effect System |
|------|-----------------|------------------------|
| `combatService.ts:1136-1139` | `isMonk` check for martial arts die | Could use `martial-arts` effect |
| `combatService.ts:1180-1193` | `isSneakAttack` + sneak-attack effect read | Uses getEffects() but also has fallback |
| `combatService.ts:1201-1218` | Divine Smite logic | Could use `divine-smite` effect |
| `combatService.ts:445` | `getAlertInitiativeBonus(char)` | Should use `initiative-bonus` effect |
| `classEngine.ts:54` | `classDef.id === 'cleric' && character.divineDomain === 'life-domain'` | Should use `armor-proficiency` effect |
| `classEngine.ts:39` | `character.sorcerousOrigin === 'draconic-bloodline'` | Should use `hp-per-level` effect |
| `classEngine.ts:221-237` | `getDamageResistances()` manually iterates racialTraits | Should use `getEffects()` with `damage-resistance` |
| `featsService.ts:147-150` | `getDeathSaveBonus()` checks durable/resilient | Should use `getEffects()` with `death-save-bonus` |
| `travelService.ts:491-494` | `char.subclassId === 'berserker'` frenzy exhaustion | Should use effect system |
| `spellcastingService.ts:210-253` | Metamagic logic | Could use `metamagic-option` effect |

---

## RESOURCE HANDLERS

### Implemented Handlers

| Resource ID | Functionality |
|-------------|---------------|
| `second-wind` | Heals 1d10 + level |
| `rage` | Sets raging=true, returns rageBonus |
| `lay-on-hands-pool` | Heals target by amount |
| `breath-weapon` | Rolls damage, returns save DC |
| `ki` | Stunning Strike only (CON save, stunned condition) |
| `bardic-inspiration` | Grants inspiration die to target |
| `channel-divinity` | Turn Undead (WIS save, turned condition) |
| `hellish-rebuke` | 3d10 fire damage, DEX save |
| `wild-shape` | Returns maxCR, fly/swim availability |
| `sorcery-points` | Returns ready status |
| `action-surge` | Returns extraAction=true (prompt-only) |
| `indomitable` | Returns rerollSave=true (prompt-only) |
| `divine-sense` | Returns detect info (prompt-only) |
| `arcane-recovery` | Returns maxLevels (actual logic in travelService.ts) |
| `relentless-endurance` | Sets HP to 1 |

### Missing Resource Handlers

- `font-of-inspiration` — Bardic Inspiration should reset on short rest at L5+
- `natural-recovery` — Druid Circle of Land feature, no handler

---

## SUMMARY OF CRITICAL GAPS

### High-Priority Missing Implementations

1. **Extra Attack** — No class gets mechanically enforced extra attacks. All rely on LLM calling `player_attack` multiple times.
2. **Rage resistance** — Barbarian rage B/P/S resistance is prompt-only, not enforced.
3. **Expertise** — Bard/Rogue double proficiency is not enforced.
4. **Fighting Style bonuses** — No +2 attack, +2 damage, or +1 AC is applied.
5. **Sneak Attack conditions** — Advantage/ally adjacency is not checked; LLM must self-report.
6. **Subclass features** — Most subclass features beyond level 1-3 are not implemented.
7. **High-level capstone features** — Nearly all L18-20 features are missing.

### Medium-Priority Issues

1. **Brutal Critical / Savage Attacks** — Uses d20 instead of weapon damage die (BUG).
2. **Font of Inspiration** — Bardic Inspiration should reset on short rest at L5+, currently long rest.
3. **Fast Movement condition** — `no-heavy-armor` condition not checked by speed-bonus reducer.
4. **Danger Sense** — `seen-effect` case grants advantage unconditionally.
5. **Divine Health** — Uses non-standard `'diseased'` condition ID.
6. **Skill expertise** — `skill-expertise` effect kind has no reducer.

### Low-Priority (Flavor-Only)

1. Language proficiencies not fully resolved
2. Tool proficiencies not tracked
3. Background features not implemented
4. Most "flavor" feats have no mechanical effect
