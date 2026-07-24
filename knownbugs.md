# Known Bugs & Unimplemented Mechanics

This file is the source-of-truth catalog of **known** gameplay bugs, SRD deviations, and
unimplemented mechanics in Dice On Rails, with severity and the file/line where each lives.
Items are grouped by area and ordered roughly by severity within each group.

> A prior pass fixed: save-spell upcast/cantrip-scaling per-target damage, `onSuccess:'none'`
> save negation, Magic Missile upcast, False Life temp-HP, condition-spell on-cast saves,
> mass-healing-word / mass-cure-wounds scaling, Warlock Pact Magic resource creation, the
> racial-CON HP double-count, and Fey Ancestry (sleep immunity + charm-save advantage).
> Everything below is still open.

Severity legend: 🟥 game-breaking · 🟧 major (signature feature cosmetic/wrong) · 🟨 minor.

---

## Classes & Subclasses

### 🟥 Game-breaking
- **Lay on Hands heal cap uses the *paladin's* HP deficit, not the target's.**
  `services/mcp/spellcastingService.ts` (`use_resource('lay-on-hands-pool')`). If the paladin is
  full HP, `char.hp.max - char.hp.current === 0` so Lay on Hands heals **nothing** for anyone.
  Fix: cap by `target.hp.max - target.hp.current`.
- **Rage sets `char.raging = true` but adds NO damage bonus and NO B/P/S resistance.**
  `services/mcp/spellcastingService.ts` (use_resource 'rage') sets the flag; `player_attack`
  (`combatService.ts`) never reads `attacker.raging`; `getDamageResistances` (`classEngine.ts`)
  only reads *racial* traits. Barbarian rage is purely cosmetic.
- **Monk melee forced to STR — Martial Arts DEX substitution never happens.**
  `services/mcp/combatService.ts:894-896` uses `attacker.stats.str` for all melee. DEX monks
  fight with +0. (The martial-arts *die* is selected, but not the attack/damage mod.)
- **`level_up` writes the subclass to a non-existent field `subclass`** (the type only has
  `subclassId`). `services/mcp/progressionService.ts:176`. Any subclass chosen via the `level_up`
  tool is silently dropped → `pendingSubclassFeature` never flips. (Cleric/Sorcerer/Warlock escape;
  they pick at level 1 during creation.)

### 🟧 Major — defined in `data/classes.ts` but with NO mechanical effect
- **Divine Smite / Improved Divine Smite** (paladin L2/L11) — not implemented; no way to expend a
  slot for radiant damage on a melee hit.
- **Fighting Styles** — `Character.fightingStyle` is **never read anywhere**. Only Great Weapon
  Fighting works, and only because it is checked as a *feat* (`hasFeat('great-weapon-fighting')`),
  not via the field. Archery/Dueling/Defense/Protection do nothing.
- **Sneak Attack** auto-trigger — only fires if the LLM explicitly passes `isSneakAttack: true`.
  No detection of advantage / adjacent ally / finesse weapon. (Dice count is correct when flagged.)
- **Extra Attack** — `effect.kind: 'extra-attack'` is dead data; `player_attack` makes one attack
  and relies on the LLM calling it repeatedly.
- **Resource counters with no spend effect:** Ki (Flurry/Patient Defense/Step of the
  Wind/Stunning Strike), Sorcery Points / Metamagic, Bardic Inspiration (+ Font of Inspiration
  short-rest recovery), Channel Divinity / Turn Undead, Action Surge, Arcane Recovery (wizard).
  `use_resource('<id>')` just decrements a counter.
- **Wild Shape** — `applyWildShape()` exists (`transformationEngine.ts`) but is never wired to any
  tool. Druids cannot wild shape.
- **Fast Movement** (barbarian L5) + **Unarmored Movement** (monk L2) — class-level `speed-bonus`
  effects are ignored (`calculateSpeed` only reads *race* traits).
- **Reckless Attack**, **Danger Sense** (barbarian), **Diamond Soul** (monk L14 all-save prof) —
  never applied.

### 🟨 Minor
- **Slippery Mind** (rogue L15) checks DEX instead of WIS and is shadowed by an existing
  proficiency → dead. `services/classEngine.ts:154-156`.
- **Long rest clears ALL exhaustion levels** instead of one. `services/mcp/travelService.ts:587`.
- **`awardExperience` skill-points** uses capital `'Rogue'` vs lowercased `'rogue'` → rogues get 3
  skill pts/lvl instead of 4. `services/progressionService.ts:65`.
- **Hit Dice can never be spent** — short rest doesn't roll HD to heal. (`travelService.ts`.)
- **Berserker Frenzy** applies exhaustion; combined with the long-rest-clears-all bug above, a
  single rest fully recovers a Frenzy barbarian.
- **`greater restoration` reduces exhaustion** (non-SRD; the spell does not affect exhaustion).
  `services/mcp/spellcastingService.ts:316-325`.
- **Enemy attacks bypass `inflictDamageOnTarget`** (`combatService.ts:674`,
  `combatEngine.ts:161`) — skipping resistances/immunities/vulnerabilities/HAM/temp HP. So even if
  player damage resistances were implemented, enemy strikes would ignore them.

---

## Races & Racial Traits

### 🟥 Game-breaking
- **Racial damage resistances never applied to players.** `inflictDamageOnTarget`
  (`services/inventoryEngine.ts:142-181`) only halves for `Enemy` targets; `Character` has no
  resistance field, and `getDamageResistances()` is consumed only by the character sheet for
  display. Dwarf poison / Tiefling fire / Dragonborn ancestry resistance do nothing mechanically.
  (Compounded by the enemy-attack bypass above.)
- **Half-Orc Relentless Endurance never triggers.** The pool is granted
  (`classEngine.ts:351`) but no code checks the trait when HP hits 0, spends the resource, or sets
  HP to 1. The narration prompt previously claimed it auto-fired (now softened — see below).

### 🟧 Major — `effect.kind` defined but never matched by any engine code
- **Halfling Lucky** (`reroll-ones`) — no auto-reroll of natural 1s.
- **Half-Orc Savage Attacks** + **Barbarian Brutal Critical** (`weapon-damage-extra-die` /
  `crit-bonus-dice`) — no extra damage die on crit.
- **Gnome Cunning** (`advantage-on-save` vs magic), **Halfling Brave** (vs frightened),
  **Fey Ancestry charm advantage for non-spell saves** — `advantage-on-save` effect kind is never
  matched. (Fey Ancestry charm-save advantage now works only on the spell-save path via the
  `charmSave` flag; the generic racial trait is still decorative.)
- **Elf Keen Senses** (Perception) + **Half-Elf Skill Versatility** (2 skills) — no racial skill
  proficiency injection exists.
- **Stonecunning** (Dwarf) — flavor only. **Dwarven tool proficiencies** — not even defined.
- **Tiefling Infernal Legacy** — only the `hellish-rebuke` resource slot exists; `use_resource`
  is a no-op fallthrough (does not cast/deal 3d10). Thaumaturgy cantrip + L5 darkness not granted.

### 🟨 Minor
- **Half-Elf flexible +1 can stack onto CHA** (SRD forbids). `components/creation/StatsStep.tsx:244`
  offers all six stats; the docstring documents the constraint but neither UI nor builder enforces it.
- **No subraces / no Variant Human** (level-1 feat). Only Standard Human exists.
- **No heavy-armor speed penalty** for anyone, so the Dwarf "not slowed by heavy armor" trait is moot
  (and non-dwarves also escape a penalty they shouldn't).
- **Narration/reality desync (partially mitigated):** `toolModePrompt.ts` previously told the LLM
  that Lucky auto-rerolls, Relentless Endurance auto-fires, and Hellish Resistance halves damage —
  all false. Those three lines are now softened to flavor-only. Restore the strong wording in the
  phase that ships each feature.

---

## Spells

### 🟥 Game-breaking
- **`spell_effect` (Counterspell / Dispel Magic) costs no spell slot and no reaction.**
  `services/mcp/spellcastingService.ts:582-641` performs the ability check / dispel cleanup but
  never consumes a slot or reaction. Auto-success is also hardcoded to `targetSpellLevel <= 3`
  with no notion of the counterspell's own casting slot.
- **`summon_creature` / `teleport_creature` / `polymorph_creature` cost no slot** and
  `polymorph_creature` has no WIS save for unwilling targets. `services/mcpService.ts:193-267`.
  These tools are dispatched outside `cast_spell`, so they bypass known/prepared/slot validation.
  (Polymorph/Misty Step/Counterspell cast via `cast_spell` are mechanical no-ops because their
  effects live only in the sibling tools.)

### 🟧 Major
- **Missing upcast `scaling[]` on many multi-target / higher-level spells.** Even where present,
  save-spell upcast now works (fixed), but data is missing for: scorching-ray, shatter,
  black-tentacles, wall-of-fire, arcane-hand, blade-barrier, chain-lightning, harm, sunbeam,
  arcane-sword, finger-of-death, fire-storm, prismatic-spray, incendiary-cloud, sunburst,
  meteor-swarm, storm-of-vengeance, weird. `data/spells.ts`.
- **`secondaryDamage` upcast not rolled per target** for save spells (Ice Storm, Flame Strike) —
  base secondary dice are per-target (fixed for base), but the upcast portion is still only added
  to `total`. `services/spellcastingEngine.ts:394-413`.

### 🟨 Minor
- **Aid HP bonus is off by +5 per slot** (adds at slot ≥2 instead of ≥3). No expiry hook reverts
  `hp.max` when the 8h duration ends. `services/mcp/spellcastingService.ts:391-402`.
- **Cantrip rider effects unmodeled:** ray-of-frost (slow), chill-touch (no healing), shocking-grasp
  (no reactions), vicious-mockery (disadv), guiding-bolt (adv on next attack), acid-splash
  (dual-target). Documented approximation.
- **Eldritch Blast / Magic Missile multi-target splitting unsupported** — all beams/darts stack on
  `targets[0]`. (Beam/dart *count* scaling works.)
- **Heroism temp HP not refreshed each turn** (set once on cast). `spellcastingService.ts:404-423`.
- **`parseDiceFormula` silently returns `{1d6,0}` on any malformed formula** (latent footgun).
  `utils/dice.ts:6-14`.
- **ID slug mismatches** risk lookup failure for a few spells (`blindnessdeafness`,
  `enlargereduce`, `antipathysympathy`) if the LLM passes the natural name. Minor because the
  service slugifies most inputs.
- **Ritual `castingTime:'action'` mismatch** — 16 ritual spells store only the action form (they
  are castable via `cast_ritual` regardless, so functionally fine; catalogued casting time is
  incomplete).
- **Sacred Flame save type is `'half'` in the data** (SRD: all-or-nothing negate). Data bug only;
  does not affect the engine math.

---

## Feats

### 🟥 Game-breaking (character-creation path)
- **All half-feats lose their +1 ASI at creation.** `components/creation/FeatsStep.tsx:50-54`
  records only `{type, featId}` — never `asiBonuses`/`saveStatChoice`/`skillChoices`. Affects:
  resilient, heavy-armor-master, lightly/moderately/heavily-armored, actor, athlete, tavern-brawler,
  linguist, keen-mind. Permanent −1 stat. (`LevelUpModal` has the full UI; `FeatsStep` does not.)
- **Resilient defaults to CON at creation** — `saveStatChoice` never set; `|| 'con'` fallback masks
  it. Wrong save proficiency, invisible to player. `services/featsService.ts:186`.
- **Skilled grants zero skills at creation** — `skillChoices` never set.
  `characterCreationService.ts:52`.
- **Durable is fabricated** — claims a death-save +1 (wrong per SRD; SRD = HD minimum on short
  rest), and that bonus is **dead code** (zero call sites). The HD-minimum mechanic isn't
  implemented. `services/featsService.ts:196-200`. Also missing its +1 CON ASI.
- **Sharpshooter / Great Weapon Master have no feat-ownership check** — absent from the catalog;
  any character can pass the `sharpshooter`/`greatWeaponMaster` boolean to `player_attack` for
  −5/+10. `services/mcp/combatService.ts:899,970-971`.

### 🟧 Major
- **Athlete grants +10 speed it shouldn't** (SRD Athlete grants no speed). Data + helper wrong.
  `data/feats.ts:297`; `services/featsService.ts:174`.
- **`ASI_FEAT_IDS` missing Observant + Durable** → their +1 ASI is unreachable via any UI.
  `components/.../LevelUpModal.tsx:22-25`.
- **Two-Weapon Fighting off-hand always uses STR** even for finesse/ranged.
  `services/featsService.ts:117`.
- **Mobile's +10 speed helper exists but no mover reads it** — functionally inert in play.
  `featsService.ts:179`.
- **Heavy Armor Master bypassed by enemy attacks** (`skipTargetDerivedReductions:true` on all enemy
  paths). `combatService.ts:674`. Reduces only trap/environment damage, never weapon hits.

### 🟨 Minor
- **Crossbow Expert is cosmetic** — `ignore-ranged-penalty` never matched; no cover/long-range system.
- **Defensive Duelist** reaction AC never applied.
- **Charger, Grappler, Elemental Adept, Magic Initiate, Ritual Caster, Spell Sniper, Inspiring
  Leader, Linguist, Keen Mind, Healer, Savage Attacker, Polearm Master, Sentinel, War Caster,
  Mounted Combatant, Medium Armor Master, Lucky** — entirely absent from the catalog and unimplemented.
- **GWF reroll-eligibility inconsistent** between the combat path (no weapon-type check) and the
  `travelService.roll_dice` strict helper. `combatService.ts:952-957`.
- **`cryptoRoll` duplicated with modulo bias** in `featsService.ts:145` (canonical version uses
  rejection sampling). Minor; only used by the GWF reroll helper.
- **Shield Master grants shield proficiency** (SRD: it *requires* it). `featsService.ts:90`.
- **Two armor-type classifiers disagree** (`featsService.getEquippedArmorType` vs
  `classEngine.getArmorTypeFromItem`) — latent; no current feat triggers the medium-armor mismatch.
- **Dead code:** `getConditionsImmunities` (`classEngine.ts:242`), `getObservantPassiveBonus`,
  `getDualWielderAcBonus`, `getToughHpBonus` (live calc is inlined elsewhere) — defined, never called.

---

## Cross-cutting / Engine

- **`d20Modifier` / `speedPenaltyFt` fields on `getConditionEffects()` are computed but unused**
  outside tests. Exhaustion is applied via scattered direct `getExhaustionPenalty()` calls — any
  future roll path that forgets to call it will silently ignore exhaustion. (`diceEngine.rollAttackRoll`
  is one such path; the live combat route goes through `combatService` which does apply it.)
- **`getDeathSaveBonus()` (Durable / Resilient-CON)** is defined + re-exported but never called —
  the Durable death-save bonus is dead code.
- **`isIncapsulated` typo** (`conditionEngine.ts:217`) must NOT be removed — it's an alias for
  `isIncapacitated` and may exist in serialized game states.
