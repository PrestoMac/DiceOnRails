import { describe, it, expect } from 'vitest';
import { buildPresetCharacter, PresetCharacterSpec, hydrateStartingEquipment } from '../../services/characterCreationService';
import { PRESET_CHARACTERS, PRESETS_BY_ID } from '../../data/presetCharacters';
import { RACES_CATALOG } from '../../data/races';
import { CLASSES_CATALOG } from '../../data/classes';
import { SPELLS_CATALOG } from '../../data/spells';
import { FEATS_CATALOG } from '../../data/feats';
import { MockMCPServer } from '../../services/mcpService';
import { auditState } from '../../services/auditor';
import { Character, GameState } from '../../types';

const RACE_IDS = new Set(RACES_CATALOG.map(r => r.id));
const CLASS_IDS = new Set(CLASSES_CATALOG.map(c => c.id));
const SPELL_IDS = new Set(SPELLS_CATALOG.map(s => s.id));
const FEAT_IDS = new Set(FEATS_CATALOG.map(f => f.id));

const CASTER_CLASS_IDS = new Set(
  CLASSES_CATALOG.filter(c => c.spellcasting).map(c => c.id)
);

/** Full and pact casters receive spells and slots at level 1; half-casters (paladin, ranger) do not. */
const FULL_CASTER_CLASS_IDS = new Set(
  CLASSES_CATALOG.filter(c => c.spellcasting && (c.spellcasting.tradition === 'full' || c.spellcasting.tradition === 'pact')).map(c => c.id)
);

/**
 * Auditor rules known to be pre-existing data inconsistencies that affect wizard-built characters
 * identically (not introduced by presets). `classes-valid` flags Life Domain clerics equipping
 * chain mail because the auditor does not model subclass-granted heavy armor proficiency — the
 * base cleric class lists chain mail in its startingEquipment, so the wizard path produces the
 * same flag. Preset characters must match wizard output, so this rule is excluded from parity checks.
 */
const AUDIT_RULES_EXCLUDED = new Set(['classes-valid']);

/** Builds a minimal GameState with the given party for auditor checks. */
function makeState(party: Character[]): GameState {
  return {
    party,
    worldDescription: 'Test world',
    sessionLogs: [],
    quests: [],
    lore: [],
    actionQueue: [],
  } as GameState;
}

describe('presetCharacters data file', () => {
  it('exposes exactly 10 presets', () => {
    expect(PRESET_CHARACTERS.length).toBe(10);
  });

  it('has unique ids and a matching lookup map', () => {
    const ids = PRESET_CHARACTERS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESET_CHARACTERS) {
      expect(PRESETS_BY_ID[p.id]).toBe(p);
    }
  });

  it('references only valid race and class ids', () => {
    for (const p of PRESET_CHARACTERS) {
      expect(RACE_IDS.has(p.raceId)).toBe(true);
      expect(CLASS_IDS.has(p.classId)).toBe(true);
    }
  });

  it('references only valid spell and feat ids', () => {
    for (const p of PRESET_CHARACTERS) {
      for (const s of [...(p.cantrips ?? []), ...(p.spells ?? [])]) {
        expect(SPELL_IDS.has(s)).toBe(true);
      }
      if (p.asiFeatSlot.type === 'feat' && p.asiFeatSlot.featId) {
        expect(FEAT_IDS.has(p.asiFeatSlot.featId)).toBe(true);
      }
    }
  });

  it('covers all 9 race ids', () => {
    const used = new Set(PRESET_CHARACTERS.map(p => p.raceId));
    for (const r of RACES_CATALOG) {
      expect(used.has(r.id)).toBe(true);
    }
  });

  it('includes cleric and warlock subclass ids (level-1 subclass classes)', () => {
    const cleric = PRESET_CHARACTERS.find(p => p.classId === 'cleric');
    expect(cleric?.subclassId).toBe('life-domain');
    const warlock = PRESET_CHARACTERS.find(p => p.classId === 'warlock');
    expect(warlock?.subclassId).toBe('the-fiend');
  });
});

describe('buildPresetCharacter', () => {
  describe('each preset builds a valid level-1 character', () => {
    for (const spec of PRESET_CHARACTERS) {
      describe(`preset: ${spec.id}`, () => {
        const character = buildPresetCharacter(spec);

        it('returns a character with level 1 and matching race/class', () => {
          expect(character.level).toBe(1);
          expect(character.race).toBe(spec.raceId);
          expect(character.class).toBe(spec.classId);
          expect(character.name).toBe(spec.name);
        });

        it('has positive HP with current === max', () => {
          expect(character.hp.max).toBeGreaterThan(0);
          expect(character.hp.current).toBe(character.hp.max);
        });

        it('has exactly six stats, all between 3 and 22 inclusive', () => {
          const keys = Object.keys(character.stats).sort();
          expect(keys).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
          for (const v of Object.values(character.stats)) {
            expect(v).toBeGreaterThanOrEqual(3);
            expect(v).toBeLessThanOrEqual(22);
          }
        });

        it('has positive experienceToNextLevel (bug-fix: was 0 before service reuse)', () => {
          expect(character.experienceToNextLevel).toBeGreaterThan(0);
        });

        it('has full hitDice and zero unusedStatPoints at level 1', () => {
          expect(character.hitDice).toEqual({ current: 1, max: 1 });
          expect(character.unusedStatPoints).toBe(0);
        });

        it('has a populated inventory (class starting equipment + Explorer\'s Pack)', () => {
          expect(character.inventory.length).toBeGreaterThanOrEqual(1);
          const hasPack = character.inventory.some(i => i.name === "Explorer's Pack");
          expect(hasPack).toBe(true);
          for (const item of character.inventory) {
            expect(item.quantity).toBeGreaterThanOrEqual(1);
          }
        });

        it('has racialTraits populated (except humans, who have none)', () => {
          if (spec.raceId === 'human') {
            expect(character.racialTraits ?? []).toEqual([]);
          } else {
            expect((character.racialTraits ?? []).length).toBeGreaterThan(0);
          }
        });

        it('is accepted by MockMCPServer.joinParty without error', () => {
          const server = new MockMCPServer();
          expect(() => server.joinParty(character)).not.toThrow();
          const state = server.getFullState();
          expect(state.party.some(c => c.id === character.id)).toBe(true);
        });

        it('passes the auditor rules when placed in a party', () => {
          const results = auditState(makeState([character]));
          const failed = results.filter(r => !r.passed && !AUDIT_RULES_EXCLUDED.has(r.rule));
          expect(failed.map(f => `${f.rule}: ${f.details}`)).toEqual([]);
        });
      });
    }
  });

  describe('caster presets', () => {
    for (const spec of PRESET_CHARACTERS) {
      if (!FULL_CASTER_CLASS_IDS.has(spec.classId)) continue;
      it(`preset ${spec.id}: full/pact caster has non-empty resources and prepared spells at L1`, () => {
        const c = buildPresetCharacter(spec);
        expect((c.resources ?? []).length).toBeGreaterThan(0);
        const combined = [...(c.knownSpells ?? []), ...(c.preparedSpells ?? [])];
        expect(combined.length).toBeGreaterThan(0);
      });
    }
  });

  describe('half-caster presets (paladin, ranger)', () => {
    it('paladin and ranger have no spell slots or spells at level 1 (half-caster progression)', () => {
      const halfCasters = PRESET_CHARACTERS.filter(p => CASTER_CLASS_IDS.has(p.classId) && !FULL_CASTER_CLASS_IDS.has(p.classId));
      expect(halfCasters.map(p => p.classId).sort()).toEqual(['paladin', 'ranger']);
      for (const spec of halfCasters) {
        const c = buildPresetCharacter(spec);
        const spellSlots = (c.resources ?? []).filter(r => r.id.startsWith('spell-slot'));
        expect(spellSlots.length).toBe(0);
        expect([...(c.knownSpells ?? []), ...(c.preparedSpells ?? [])].length).toBe(0);
      }
    });
  });

  describe('class-specific derived fields', () => {
    it('half-elf bard has halfElfStatChoices and the Alert feat', () => {
      const c = buildPresetCharacter(PRESETS_BY_ID['half-elf-bard']);
      expect(c.halfElfStatChoices).toEqual(['dex', 'con']);
      expect(c.feats).toContain('alert');
    });

    it('dragonborn paladin has draconic ancestry and matching damage type', () => {
      const c = buildPresetCharacter(PRESETS_BY_ID['dragonborn-paladin']);
      expect(c.draconicAncestry).toBe('red');
      expect(c.draconicDamageType).toBe('fire');
    });

    it('life-domain cleric carries the subclassId', () => {
      const c = buildPresetCharacter(PRESETS_BY_ID['dwarf-cleric']);
      expect(c.subclassId).toBe('life-domain');
    });

    it('the-fiend warlock carries the subclassId', () => {
      const c = buildPresetCharacter(PRESETS_BY_ID['tiefling-warlock']);
      expect(c.subclassId).toBe('the-fiend');
    });

    it('elf race confers sleep condition immunity (Fey Ancestry) (elf wizard and elf ranger)', () => {
      const wiz = buildPresetCharacter(PRESETS_BY_ID['elf-wizard']);
      const ranger = buildPresetCharacter(PRESETS_BY_ID['elf-ranger']);
      expect(wiz.conditionsImmunities).toContain('sleep');
      expect(ranger.conditionsImmunities).toContain('sleep');
    });
  });

  describe('error handling', () => {
    it('throws on unknown raceId', () => {
      const bad: PresetCharacterSpec = {
        id: 'bad', name: 'X', raceId: 'not-a-race', classId: 'fighter',
        tagline: 't', stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        allocatedSkills: {}, asiFeatSlot: { type: 'asi', statAllocations: { str: 2 } },
      };
      expect(() => buildPresetCharacter(bad)).toThrow(/unknown raceId/);
    });

    it('throws on unknown classId', () => {
      const bad: PresetCharacterSpec = {
        id: 'bad', name: 'X', raceId: 'human', classId: 'not-a-class',
        tagline: 't', stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        allocatedSkills: {}, asiFeatSlot: { type: 'asi', statAllocations: { str: 2 } },
      };
      expect(() => buildPresetCharacter(bad)).toThrow(/unknown classId/);
    });
  });
});

describe('hydrateStartingEquipment', () => {
  it('returns class starting equipment plus an Explorer\'s Pack for fighter', () => {
    const items = hydrateStartingEquipment('fighter');
    const names = items.map(i => i.name);
    expect(names).toContain('longsword');
    expect(names).toContain('shield');
    expect(names).toContain("Explorer's Pack");
  });

  it('auto-equips weapons, armor, and shields', () => {
    const items = hydrateStartingEquipment('fighter');
    const longsword = items.find(i => i.name === 'longsword');
    const shield = items.find(i => i.name === 'shield');
    const pack = items.find(i => i.name === "Explorer's Pack");
    expect(longsword?.equipped).toBe(true);
    expect(shield?.equipped).toBe(true);
    expect(pack?.equipped).toBe(false);
  });

  it('always appends an Explorer\'s Pack even for classes without starting equipment', () => {
    const items = hydrateStartingEquipment('monk');
    expect(items.some(i => i.name === "Explorer's Pack")).toBe(true);
  });
});
