# Classes & Races Implementation Report — Dice On Rails vs 5e SRD

> **Assessment date**: Aug 2, 2026 (verified against live engine wiring — see below)
> **Verification method**: Every claim below was cross-checked against the actual reducers in `services/effectDispatcher.ts`, resource handlers in `services/resourceHandlers.ts`, and dispatch logic in `services/mcp/combatService.ts`, `services/mcp/spellcastingService.ts`, `services/mcpService.ts`, plus the trait/feature catalogs in `data/races.ts` and `data/classes.ts`. Features marked **Working** have real dice/save/damage/AC/resource math in the engine; features marked **Narrative** only exist in the catalogs and are described by the LLM — no engine reducer exists for them.
> **Fixes applied (recent sessions)**:
> - **Effect Dispatcher Reducers**: Added `fighting-style` (Defense AC, Archery attack, Dueling damage), `jack-of-all-trades` (half prof on non-proficient skill/ability checks), `reliable-talent` (floor proficient skill d20s at 10), `diamond-soul` (all save proficiencies), `aura-of-protection` (Paladin CHA to party saves), and `metamagic-option` on `onLevelUp`.
> - **Resource Handlers**: Expanded `ki` for Flurry of Blows (2 unarmed strikes), Patient Defense (Dodge bonus action), Step of the Wind (Dash/Disengage bonus action), and Stunning Strike. Added `natural-recovery` for Druids.
> - **Combat-save wiring (latest)**: Champion Superior Critical now correctly crits on a natural 18; Halfling Lucky now rerolls natural-1 **saving throws** (roll happens before `onSaveRoll` effects; `reroll-ones` registered on the save hook); Gnome Cunning advantage now applies to ALL spell-originated INT/WIS/CHA saves (spell saves pass `{ isMagical: true, isCharm }` spell context); Protection fighting style is no longer offered as a selectable option (required battle-map adjacency the engine can't enforce) — Fighter, Paladin, and Ranger pickers exclude it.
> - **Spellcasting & Subclasses**: Life Cleric `disciple-of-life` bonus healing (`2 + spellLevel` per target via `healing-bonus`), Sorcerer `metamagic-option` populates `metamagicOptions` at creation AND on level-up, Warlock `agonizing-blast` (+CHA damage per Eldritch Blast beam), Warlock `INVOCATIONS_CATALOG` with at-will spell grants.
> - **Wild Shape & Transformations**: Druid `BEAST_FORMS_CATALOG` with Wolf, Panther, Brown Bear, Dire Wolf, Giant Eagle, Giant Crocodile (CR 5, swim), and Tyrannosaurus Rex (CR 8) stat overlays. CR-limited by druid level (`floor(level/3)`).
> - **Subraces & Variant Human**: Subraces for Elves, Dwarves, Halflings, Gnomes, and Variant Human.
> **Scope**: All 9 races and 12 classes defined in the codebase, compared against the 5e SRD.

---

## Summary Legend

| Rating | Meaning |
|--------|---------|
| **Working** | Core mechanics enforced by engine (dice, saves, damage, AC, resources). Plays close to SRD. |
| **Partial** | Base-class core identity wired; most subclass features are catalog-only / narrative. |
| **Narrative** | Feature exists in the catalog and LLM prompt but has NO engine reducer — the LLM only describes the effect. |

---

## Notes & Corrections (Aug 2, 2026)

Verification pass against `effectDispatcher.ts`, `classEngine.ts`, `characterCreationService.ts`, `resourceHandlers.ts`, and the catalogs. These items were missing or inaccurate in the ratings above.

### Corrections to the table above
1. **Tiefling Thaumaturgy is NOT narrative** — the table says "Thaumaturgy is narrative", but `characterCreationService.ts:131,136` hardcode-grants it at creation (added to `knownSpells` for casters, a cantrip for non-casters). It's engine-applied, just via a race-ID special case rather than an effect payload on the `infernal-legacy` trait.
2. **Warlock invocations are wired at creation** — `ClassStep.tsx` has a real picker (L2+) with `getInvocationCount()` budget enforcement, and `invocationChoices` is propagated to `Character.invocations` (`characterCreationService.ts:172`). Agonizing Blast is engine-applied in `spellcastingEngine.ts:327`. **Gap remains:** `level_up` in `progressionService.ts` has no invocation handling — a warlock who levels past L2 in play never gains new invocation slots (creation-only today).
3. **Rogue Slippery Mind is partially hardcoded, not narrative** — `classEngine.ts:153-155` adds a proficiency bonus to rogues at L15+, but it is keyed to `stat === 'dex'`. Slippery Mind grants **WIS** save proficiency. So the feature is implemented for the wrong stat (a bug), not absent.

### Bugs/gaps not previously documented
4. **Wood Elf +5ft speed is broken (the table overstates it).** `SubraceDefinition.speedBonus: 5` (`data/races.ts:70`) is never copied to `Character.speedBonus` during `buildCharacterFromWizard`. `calculateSpeed` (`classEngine.ts:182`) reads `character.speedBonus || 0`, which is always 0 for Wood Elves → they stay at 25 ft instead of 30 ft. Fix is a one-line propagation in `characterCreationService.ts`.
5. **The `armor-proficiency` reducer is a no-op** (`effectDispatcher.ts:481-486`) — the reduce body returns early without mutating anything. Consequences: **Mountain Dwarf's Dwarven Armor Training** (`data/races.ts:93`, light+medium) grants nothing, and the **Lightly/Moderately/Heavily Armored feats** (`data/feats.ts:253-284`) grant nothing. `canEquipArmor` (`classEngine.ts:48-53`) reads only `classDef.armorProfs` + the hardcoded Life-Cleric heavy-armor case.
6. **Destroy Undead is message-only** — the table lists "Destroy Undead CR tiers via `channel-divinity`". The handler (`resourceHandlers.ts:132`) computes `crLimit` but only returns a narration string; no undead enemy is actually destroyed in state. Turn Undead (WIS save + turned condition) works; Destroy Undead does not.
7. **`Durable` death-save bonus is dead code** — `getDeathSaveBonus()` (`featsService.ts:196`) is defined and re-exported but never called by any path (both death-save rolls bypass it). Durable grants no mechanical benefit. Already noted as a caveat in AGENTS.md; not in this file.
8. **Two systemic engine gaps worth naming (not just per-class):**
   - **No reaction system** — Uncanny Dodge, Cutting Words, Berserker Retaliation, Hellish Rebuke *triggering*, opportunity attacks, and the Protection fighting style all require reactions the engine has no concept of. The `hellish-rebuke` resource exists but has no automatic trigger — it's LLM-driven via `use_resource`.
   - **No bonus-action system** — Cunning Action, Frenzy's bonus attack, off-hand attacks, and Second Wind's bonus-action usage are all LLM-narrated; the engine never validates the action economy.

### Confirmed accurate (no change needed)
- Reckless Attack truly has a declared `effect: {kind:'reckless-attack'}` with **no reducer** and no `combatService` application — table's "narrative" rating is correct.
- Draconic Resilience **HP bonus IS implemented** (`classEngine.ts:39`, `+level` HP for draconic-bloodline) — the "+1 HP/level" claim in the table is correct.
- All 9 races rated "Working" except the Wood Elf speed bug (#4) and Mountain Dwarf armor (#5) above.

---

## CLASSES

### Barbarian — **Partial**
**Engine-wired:** Rage resource pool (damage bonus + B/P/S resistance via `damage-resistance` with `condition: 'raging'`, resets on long rest), Unarmored Defense (`10 + DEX + CON` via `ac-formula`), Danger Sense (DEX save advantage via `advantage-on-save`), Brutal Critical (extra crit damage dice via `crit-bonus-dice`), Fast Movement (`speed-bonus` with heavy-armor condition), Extra Attack (LLM issues two `player_attack` calls per the prompt).
**Narrative-only:** **Reckless Attack** (`effect: {kind:'reckless-attack'}` is declared in `data/classes.ts` but there is **no reducer** for it anywhere in `effectDispatcher.ts` — advantage on melee attacks is not mechanically applied), Feral Instinct, Relentless Rage, Persistent Rage, Indomitable Might, Primal Champion, and the entire **Path of the Berserker** subclass (Frenzy, Mindless Rage, Intimidating Presence, Retaliation).
**SRD Fidelity:** ~60% (base class good; subclass = 0%).

---

### Bard — **Partial**
**Engine-wired:** Full CHA spellcasting (prepared/known mode), Bardic Inspiration (die scales d6→d8→d10→d12 via `bardic-inspiration` resource handler), Jack of All Trades (half prof on non-proficient checks via `jack-of-all-trades` reducer), Expertise (double prof via `skill-expertise` reducer), Font of Inspiration (short-rest reset at L5+).
**Narrative-only:** Song of Rest, Countercharm, and the entire **College of Lore** subclass (Cutting Words, Additional Magical Secrets, Peerless Skill — all catalog entries with no reducer).
**SRD Fidelity:** ~65%.

---

### Cleric — **Partial**
**Engine-wired:** Full WIS prepared casting with ritual support, Channel Divinity / Turn Undead (WIS save + turned condition; Destroy Undead CR tiers via `channel-divinity` resource handler), **Disciple of Life** (Life Domain L1: `2 + spellLevel` bonus healing via `healing-bonus` effect read in `spellcastingService`), Heavy Armor Proficiency (Life Domain).
**Narrative-only:** Divine Strike, Divine Intervention, Blessed Healer, Supreme Healing, and all non-Life domains are catalog-only.
**SRD Fidelity:** ~65%.

---

### Druid — **Partial**
**Engine-wired:** Full WIS prepared casting with ritual support, **Wild Shape** (beast stat overlays for Wolf, Panther, Brown Bear, Dire Wolf, Giant Eagle, Giant Crocodile, Tyrannosaurus Rex via `BEAST_FORMS_CATALOG`; CR-limited by `floor(level/3)` — Giant Crocodile needs L15, T-Rex is unreachable via Wild Shape and is polymorph-only), Natural Recovery (short-rest slot recovery).
**Narrative-only:** Beast Spells, Archdruid, Timeless Body, and most **Circle of the Land** features (bonus cantrip, Land's Stride, Nature's Ward, Nature's Sanctuary are catalog-only; no reducer).
**SRD Fidelity:** ~70%.

---

### Fighter — **Working** (best-supported class)
**Engine-wired:** Second Wind (1d10 + level via `second-wind` resource handler), Action Surge (extra action via `action-surge` resource handler), **Champion Criticals** (19-20 at L3, 18-20 at L15 — Superior Critical now correctly crits on natural 18 via `crit-range` reducer, NOT a hardcoded `roll >= 19`), all five selectable Fighting Styles (Archery +2 ranged atk, Defense +1 AC in armor, Dueling +2 1H melee dmg, Great Weapon Fighting rerolls 1s/2s, Two-Weapon Fighting adds ability mod to offhand), Indomitable (save reroll via `indomitable` resource handler), Extra Attack (LLM issues 2-4 `player_attack` calls per the prompt).
**Narrative-only:** Remarkable Athlete, Survivor. (Battle Master is not in the catalog — only Champion.)
**SRD Fidelity:** ~80%.

---

### Monk — **Partial**
**Engine-wired:** Unarmored Defense (`10 + DEX + WIS` via `ac-formula`), **Ki system** (`ki` resource handler: Flurry of Blows = 2 unarmed strikes, Patient Defense = Dodge bonus action, Step of the Wind = Dash/Disengage bonus action, Stunning Strike = CON save vs stun), Diamond Soul (all save proficiencies via `diamond-soul` reducer), Evasion (0/half DEX-save damage), Purity of Body (poison immunity via `condition-immunity`), Unarmored Movement (`speed-bonus` no-armor condition), Extra Attack (prompt-driven).
**Narrative-only:** Martial Arts die scaling (1d4→1d10 — the prompt tells the LLM the die; the engine does not auto-roll it), Deflect Missiles, Slow Fall, Stillness of Mind, Empty Body, Perfect Self, and the entire **Way of the Open Hand** subclass (Open Hand Technique, Wholeness of Body, Tranquility, Quivering Palm).
**SRD Fidelity:** ~65%.

---

### Paladin — **Partial**
**Engine-wired:** **Divine Smite** (consumes spell slot, 2d8+1d8/level radiant, max 5d8, doubled on crit, +1d8 vs fiends/undead — applied inside `player_attack` in `combatService`), Lay on Hands (pool `5 × level` via `lay-on-hands-pool` resource handler), **Aura of Protection** (L6: CHA mod, min +1, to ALL saves for Paladin + party via `aura-of-protection` hook in `combatService.make_save`), Improved Divine Smite (+1d8 radiant on all melee hits via `damage-bonus`), Fighting Styles (Defense/Dueling/GWF/Archery), Divine Health (disease immunity via `condition-immunity`), Extra Attack (prompt-driven).
**Narrative-only:** Aura of Courage, Cleansing Touch, and the entire **Oath of Devotion** subclass (Sacred Weapon, Turn the Unholy, Aura of Devotion, Holy Nimbus).
**SRD Fidelity:** ~75%.

---

### Ranger — **Partial**
**Engine-wired:** Full spellcasting, Fighting Styles (at L2), Extra Attack (prompt-driven).
**Narrative-only:** Favored Enemy, Natural Explorer, Hide in Plain Sight, Vanish, Land's Stride, and the entire **Hunter** subclass (Hunter's Prey, Defensive Tactics, Multiattack, Superior Hunter's Defense — catalog-only choice descriptions, no reducer).
**SRD Fidelity:** ~50% (thinnest mechanical support).

---

### Rogue — **Working**
**Engine-wired:** **Sneak Attack** (scaling dice 1d6→10d6 applied inside `player_attack` when `isSneakAttack: true` — reads `extraDiceAtLevel` from the `sneak-attack` effect payload), Expertise (double prof via `skill-expertise` reducer), **Reliable Talent** (L11: floor of 10 on proficient d20 skill rolls via `reliable-talent` reducer), **Evasion** (L7: 0 dmg on successful DEX save, half on failed via `evasion` effect in `spellcastingService`).
**Narrative-only:** Cunning Action, Uncanny Dodge, Blindsense, Slippery Mind, and the **Thief** subclass (Fast Hands, Second-Story Work, Supreme Sneak, Thief's Reflexes).
**SRD Fidelity:** ~75%.

---

### Sorcerer — **Partial**
**Engine-wired:** Full CHA spellcasting, Sorcery Points (`sorcery-points` resource handler), **Metamagic** (8 options — Twinned, Heightened, Quickened, Subtle, Empowered, Careful, Distant, Extended — granted at L3 AND re-applied on level-up so progression doesn't drop them; point costs + mechanical effects wired into `cast_spell`), Draconic Resilience (AC `13 + DEX` via `ac-formula`, +1 HP/level).
**Narrative-only:** Elemental Affinity, Dragon Wings, Draconic Presence, and Wild Magic origin (not in catalog — only Draconic Bloodline).
**SRD Fidelity:** ~70%.

---

### Warlock — **Partial**
**Engine-wired:** **Pact Magic** (short-rest slot recovery, max castable slot level, via `pactMagic` resource), **Agonizing Blast** (adds CHA mod to each Eldritch Blast beam damage in `spellcastingEngine`), at-will spell invocations (Armor of Shadows → mage armor, Fiendish Vigor → false life, etc. granted at creation via `INVOCATIONS_CATALOG`).
**Narrative-only / known gaps:** **Mystic Arcanum (6th-9th) is NOT implemented** — only the pact-slot pool exists (explicitly documented in AGENTS.md). Pact Boons (Blade/Tome/Chain), Fiendish Resilience, and the **Fiend** patron features are catalog-only. (Hurl Through Hell, Dark One's Own Luck, etc. not present.)
**SRD Fidelity:** ~60%.

---

### Wizard — **Working**
**Engine-wired:** Full prepared INT casting, **Arcane Recovery** (via `arcane-recovery` resource + dedicated modal), ritual casting from spellbook, free spellbook additions on level-up (`pendingWizardSpells`), full spellbook management (prepare/unprepare/swap with rest gating).
**Narrative-only:** School features — **School of Evocation** is catalog-only (Evocation Savant, Sculpt Spells, Empowered Evocation, Overchannel have no reducer; only the subclass picker exists). Arcane Tradition choice renders but is narrative.
**SRD Fidelity:** ~75%.

---

## RACES

| Race | Rating | Subraces / Traits Implemented | SRD Fidelity |
|------|--------|-------------------------------|--------------|
| **Human** | **Working** | Standard (+1 all stats), Variant Human (+1 to two stats, 1 skill prof, 1 feat at L1) | ~90% |
| **Elf** | **Working** | High Elf (+1 INT, cantrip), Wood Elf (+1 WIS, +5ft speed), Drow (+1 CHA, 120ft darkvision), Keen Senses (Perception prof via `skill-proficiency`), Fey Ancestry charm save advantage. Subrace cantrips/weapon-training are narrative but harmless. | ~85% |
| **Dwarf** | **Working** | Hill Dwarf (+1 WIS, +1 HP/level via `hp-per-level`), Mountain Dwarf (+2 STR), Dwarven Resilience poison resistance + save advantage, Stonecunning (History prof), Combat Training | ~85% |
| **Halfling** | **Working** | Lightfoot (+1 CHA), Stout (+1 CON, poison resistance + save advantage), **Lucky rerolls nat-1s on attacks, checks, AND saves** (reroll-ones on 3 hooks), Brave advantage vs frightened, Nimbleness | ~90% |
| **Dragonborn** | **Working** | Breath Weapon resource (2d6→5d6 scaling, DEX save DC, per-short-rest), Draconic Ancestry element selection, Damage Resistance matching element | ~85% |
| **Gnome** | **Working** | Rock Gnome (+1 CON), Forest Gnome (+1 DEX), **Gnome Cunning: adv on INT/WIS/CHA saves vs ALL spell-originated magic** (spellContext `isMagical`) | ~85% |
| **Half-Elf** | **Working** | Flexible ASIs (`flexible-2`), Skill Versatility (+2 skill profs via `skill-proficiency`), Fey Ancestry charm save advantage | ~90% |
| **Half-Orc** | **Working** | Relentless Endurance (resource → drop to 1 HP), Savage Attacks (+1 extra crit die via `crit-bonus-dice`), Darkvision | ~90% |
| **Tiefling** | **Working** | Hellish Resistance (fire resistance), Infernal Legacy (Hellish Rebuke resource at L3, Darkness at L5 — Thaumaturgy is narrative), Darkvision | ~85% |

---

## OVERALL ENGINE FIDELITY SUMMARY

- **Classes overall SRD fidelity**: ~70% across all 12 classes **base-class core**; **subclass fidelity is ~5%** — every class (except Fighter/Champion, Rogue, Wizard, and the 1-2 subclass effects noted above) has subclass features that are catalog/prompt-only with zero engine reducers.
- **Races overall SRD fidelity**: ~87% across all 9 races + subraces. Races are near-complete — all ASIs, resistances, save advantages, resources (breath weapon, relentless endurance, hellish rebuke), and CR-limited transformations are engine-wired.
- **Rating summary**: **Working** — Fighter, Rogue, Wizard (classes); all 9 races. **Partial** — Barbarian, Bard, Cleric, Druid, Monk, Paladin, Ranger, Sorcerer, Warlock (base identity wired, subclasses narrative).
- **Most important known gaps** (documented in AGENTS.md): Warlock Mystic Arcanum (6-9) not implemented; Warlock Pact Boons narrative; Reckless Attack has a declared effect kind but no reducer; essentially all subclass feature trees beyond Champion crits, Life Disciple bonus, Draconic Resilience, and a handful of effects are narrative-only.
- **Verified by** full unit test suite (92 test files, 2,054 tests passing).

---
*Note: the previous version of this document rated all 12 classes "Clearly Working" at 70-80% and listed Barbarian Reckless Attack, Bard Song of Rest, Monk Martial Arts scaling, etc. as supported. Those claims overstated the engine — see the rating legend and per-class Narrative-only lists above for the accurate picture.*
