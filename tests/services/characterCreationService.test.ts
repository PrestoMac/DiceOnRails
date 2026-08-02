import { describe, it, expect } from 'vitest';
import { buildCharacterFromWizard } from '../../services/characterCreationService';
import { WizardState } from '../../components/creation/types';
import { RACES_BY_ID } from '../../utils/races';
import { CLASSES_BY_ID } from '../../utils/classes';
import { ASI_LEVELS, FALLBACK_STARTING_LOCATION } from '../../constants';
import { calculateXPToNextLevel } from '../../services/progressionService';
import type { FeatSelection } from '../../types';

const STANDARD_ARRAY = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

/** Builds a baseline valid WizardState (level-1 human fighter, new campaign) for mutation in tests. */
function baseWizard(overrides: Partial<WizardState> = {}): WizardState {
  return {
    name: 'Aria',
    level: 1,
    backstory: '',
    alignment: '', background: '', personalityTraits: [], ideals: [], bonds: [], flaws: [], appearance: '',
    selectedRace: RACES_BY_ID['human'],
    selectedClass: CLASSES_BY_ID['fighter'],
    stats: { ...STANDARD_ARRAY },
    inventory: [],
    allocatedSkills: { athletics: 1, perception: 1 },
    goldPool: 10,
    selectedSpells: [],
    selectedCantrips: [],
    selectedSubclassId: null,
    asiFeatSlots: [],
    draconicAncestry: null,
    halfElfChoice1: null,
    halfElfChoice2: null,
    generatedLocations: [],
    selectedLocation: { name: 'Phandalin', description: 'A small mining town.' },
    isGeneratingLocs: false,
    isRerolling: false,
    statsGenMode: 'array',
    rolledStatValues: [],
    rollHistory: [],
    bonusStatAllocations: {},
    ...overrides,
  };
}

const mod = (n: number): number => Math.floor((n - 10) / 2);

describe('buildCharacterFromWizard', () => {
  describe('name validation', () => {
    it('rejects an empty name with an error and no character', () => {
      const { character, errors } = buildCharacterFromWizard(baseWizard({ name: '   ' }), { isNewCampaign: true });
      expect(errors.length).toBe(1);
      expect(character).toBeNull();
    });

    it('rejects a missing name', () => {
      const { character, errors } = buildCharacterFromWizard(baseWizard({ name: '' }), { isNewCampaign: true });
      expect(errors.length).toBe(1);
      expect(character).toBeNull();
    });

    it('accepts a valid name', () => {
      const { character, errors } = buildCharacterFromWizard(baseWizard({ name: 'Lyra' }), { isNewCampaign: true });
      expect(errors).toEqual([]);
      expect(character?.name).toBe('Lyra');
    });
  });

  describe('location resolution', () => {
    it('requires a starting location for a new campaign', () => {
      const { character, errors } = buildCharacterFromWizard(
        baseWizard({ selectedLocation: null }),
        { isNewCampaign: true }
      );
      expect(errors.length).toBe(1);
      expect(character).toBeNull();
    });

    it('uses the selected location for a new campaign', () => {
      const { character, errors } = buildCharacterFromWizard(
        baseWizard({ selectedLocation: { name: 'Neverwinter', description: 'City of Skilled Hands.' } }),
        { isNewCampaign: true }
      );
      expect(errors).toEqual([]);
      expect(character?.location).toBe('Neverwinter');
    });

    it('falls back to the provided campaign starting location when not a new campaign', () => {
      const loc = { name: 'Waterdeep', description: 'The Crown of the North.' };
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedLocation: null }),
        { isNewCampaign: false, campaignStartingLocation: loc }
      );
      expect(character?.location).toBe('Waterdeep');
    });

    it('falls back to FALLBACK_STARTING_LOCATION when no location is available', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedLocation: null }),
        { isNewCampaign: false }
      );
      expect(character?.location).toBe(FALLBACK_STARTING_LOCATION.name);
    });

    it('invokes onSetStartingLocation with the resolved location', () => {
      const seen = { value: null as null | string };
      buildCharacterFromWizard(
        baseWizard(),
        { isNewCampaign: true, onSetStartingLocation: (l) => { seen.value = l.name; } }
      );
      expect(seen.value).toBe('Phandalin');
    });
  });

  describe('base stats & racial ASI', () => {
    it('applies Human +1 to every stat', () => {
      const { character } = buildCharacterFromWizard(baseWizard(), { isNewCampaign: true });
      expect(character?.stats).toEqual({ str: 16, dex: 15, con: 14, int: 13, wis: 11, cha: 9 });
    });

    it('applies Elf +2 dex / +1 int', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['elf'] }),
        { isNewCampaign: true }
      );
      expect(character?.stats).toEqual({ str: 15, dex: 16, con: 13, int: 13, wis: 10, cha: 8 });
    });

    it('applies Half-Elf flexible-2: +2 cha plus two +1 choices', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedRace: RACES_BY_ID['half-elf'],
          halfElfChoice1: 'con',
          halfElfChoice2: 'dex',
        }),
        { isNewCampaign: true }
      );
      // base {15,14,13,12,10,8} + cha 2, con 1, dex 1
      expect(character?.stats).toEqual({ str: 15, dex: 15, con: 14, int: 12, wis: 10, cha: 10 });
      expect(character?.halfElfStatChoices).toEqual(['con', 'dex']);
    });

    it('marks elf & half-elf immune to sleep (Fey Ancestry), others undefined', () => {
      const elf = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['elf'] }),
        { isNewCampaign: true }
      );
      expect(elf.character?.conditionsImmunities).toContain('sleep');
      expect(elf.character?.conditionsImmunities).not.toContain('unconscious');

      const human = buildCharacterFromWizard(baseWizard(), { isNewCampaign: true });
      expect(human.character?.conditionsImmunities).toBeUndefined();
    });

    it('R1: does not double-count racial CON in HP (dwarf fighter L1)', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['dwarf'] }),
        { isNewCampaign: true }
      );
      // Dwarf +2 CON: standard-array con 13 -> 15 -> mod +2. Fighter hpBase 10 -> 10 + 2 = 12.
      // (Pre-fix the racial CON was added a second time into the modifier, yielding 13.)
      expect(character?.stats.con).toBe(15);
      expect(character?.hp.max).toBe(12);
      expect(character?.hp.current).toBe(12);
    });

    it('applies the wood-elf subrace ASI with REPLACE semantics: +2 DEX +1 WIS (not +1 INT)', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['elf'], selectedSubraceId: 'wood-elf' }),
        { isNewCampaign: true }
      );
      // Elf base {dex:2,int:1} is REPLACED by wood-elf's {dex:2,wis:1} — the base
      // ASI (which already includes the subrace bonus) is NOT summed on top.
      // Old buggy behavior yielded int 13 and wis 11 (double-counted).
      expect(character?.stats).toEqual({ str: 15, dex: 16, con: 13, int: 12, wis: 11, cha: 8 });
      expect(character?.subraceId).toBe('wood-elf');
      // Wood Elf subrace speedBonus is propagated to the built character (was silently dropped).
      expect(character?.speedBonus).toBe(5);
    });

    it('applies the high-elf subrace ASI with REPLACE semantics (no double-counted INT)', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['elf'], selectedSubraceId: 'high-elf' }),
        { isNewCampaign: true }
      );
      // Elf base {dex:2,int:1} replaced by high-elf {dex:2,int:1} — same totals, but
      // only one package is applied (base int 12 -> 13, not 14).
      expect(character?.stats).toEqual({ str: 15, dex: 16, con: 13, int: 13, wis: 10, cha: 8 });
    });

    it('applies hill-dwarf Dwarven Toughness (+1 HP/level) and +2 CON / +1 WIS at creation', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['dwarf'], selectedSubraceId: 'hill-dwarf' }),
        { isNewCampaign: true }
      );
      // Dwarf base {con:2,wis:1} replaced by hill-dwarf {con:2,wis:1} (identical ASI here).
      expect(character?.stats.con).toBe(15);
      expect(character?.stats.wis).toBe(11);
      // HP = fighter base 10 + conMod(2) + Dwarven Toughness (+1/level × 1) = 13.
      // Without the subrace effect the HP would be 12.
      expect(character?.hp.max).toBe(13);
      expect(character?.hp.current).toBe(13);
    });
  });

  describe('ASI/feat slot indexing', () => {
    it('maps asiFeatSlots index to ASI_LEVELS (idx 0 -> level 1, idx 1 -> level 4)', () => {
      const slots: FeatSelection[] = [
        { level: 1, type: 'feat', featId: 'alert' } as FeatSelection,
        { level: 4, type: 'asi', statAllocations: { dex: 2 } } as FeatSelection,
      ];
      const { character } = buildCharacterFromWizard(
        baseWizard({ asiFeatSlots: slots }),
        { isNewCampaign: true }
      );
      const feat = character?.featSelections.find((f) => f.type === 'feat');
      const asi = character?.featSelections.find((f) => f.type === 'asi');
      expect(feat?.level).toBe(ASI_LEVELS[0]);
      expect(asi?.level).toBe(ASI_LEVELS[1]);
      expect(character?.feats).toContain('alert');
      // Human dex 15 + 2 from the level-4 ASI slot.
      expect(character?.stats.dex).toBe(17);
    });

    it('ASI_LEVELS matches the documented progression', () => {
      expect([...ASI_LEVELS]).toEqual([1, 4, 8, 12, 16, 19]);
    });
  });

  describe('resource pool calculation', () => {
    it('grants Second Wind to a level-1 fighter', () => {
      const { character } = buildCharacterFromWizard(baseWizard(), { isNewCampaign: true });
      const ids = character?.resources.map((r) => r.id);
      expect(ids).toContain('second-wind');
    });

    it('grants level-1 spell slots to a level-1 wizard', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedClass: CLASSES_BY_ID['wizard'],
          selectedCantrips: ['fire-bolt'],
          selectedSpells: ['magic-missile'],
        }),
        { isNewCampaign: true }
      );
      const ids = character?.resources.map((r) => r.id);
      expect(ids).toContain('spell-slot-1');
    });
  });

  describe('prepared vs known caster asymmetry', () => {
    const cantrips = ['fire-bolt', 'minor-illusion'];
    const spells = ['magic-missile', 'shield'];

    it('prepared caster without spellbook (cleric): knownSpells = cantrips only, preparedSpells = cantrips + spells', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedClass: CLASSES_BY_ID['cleric'],
          selectedCantrips: cantrips,
          selectedSpells: spells,
        }),
        { isNewCampaign: true }
      );
      expect(character?.knownSpells).toEqual(cantrips);
      expect(character?.preparedSpells).toEqual([...cantrips, ...spells]);
    });

    it('known caster (sorcerer): knownSpells = cantrips + spells, preparedSpells = cantrips only', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedClass: CLASSES_BY_ID['sorcerer'],
          selectedCantrips: cantrips,
          selectedSpells: spells,
        }),
        { isNewCampaign: true }
      );
      expect(character?.knownSpells).toEqual([...cantrips, ...spells]);
      expect(character?.preparedSpells).toEqual(cantrips);
    });
  });

  describe('final character assembly', () => {
    it('derives id, hp, currency, hit dice, and XP threshold from the wizard state', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ goldPool: 12.5 }),
        { isNewCampaign: true }
      );
      expect(character?.id.startsWith('player-')).toBe(true);
      // Human fighter L1: hpBase 10 + conMod(2) = 12.
      expect(character?.hp).toEqual({ current: 12, max: 12 });
      // goldPool 12.5 -> 12 gp, 5 sp.
      expect(character?.currency).toEqual({ gp: 12, sp: 5, cp: 0 });
      expect(character?.hitDice).toEqual({ current: 1, max: 1 });
      expect(character?.unusedStatPoints).toBe(0);
      expect(character?.experience).toBe(0);
      expect(character?.experienceToNextLevel).toBe(calculateXPToNextLevel(1));
    });

    it('scales HP and hit dice with level', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ level: 3 }),
        { isNewCampaign: true }
      );
      // Human fighter: fs.con = 14, conBonus 1 -> conMod = getMod(15) = 2.
      // HP = 10 + 2 + (6 + 2) * (3 - 1) = 28.
      expect(character?.hp).toEqual({ current: 28, max: 28 });
      expect(character?.hitDice).toEqual({ current: 3, max: 3 });
      expect(character?.unusedStatPoints).toBe(4);
    });

    it('applies bonus stat allocations and reduces unusedStatPoints', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ level: 3, bonusStatAllocations: { str: 2, dex: 1 } }),
        { isNewCampaign: true }
      );
      // Human +1 all: str 15->16, dex 14->15, con 13->14, int 12->13, wis 10->11, cha 8->9.
      // Bonus: str +2 -> 18, dex +1 -> 16.
      expect(character?.stats.str).toBe(18);
      expect(character?.stats.dex).toBe(16);
      // Budget (3-1)*2 = 4; allocated 3 -> 1 left over.
      expect(character?.unusedStatPoints).toBe(1);
    });

    it('rolls silver pieces into gold when >= 10 SP', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ goldPool: 12.98 }),
        { isNewCampaign: true }
      );
      // 0.98 fractional -> 9.8 ~ rounds to 10 SP -> rolls into 1 GP.
      // goldPool 12.98 -> gp floor 12, sp round(0.98*10)=10 -> gp 13, sp 0.
      expect(character?.currency.gp).toBe(13);
      expect(character?.currency.sp).toBe(0);
    });
  });

  describe('spell selection clears on non-caster', () => {
    it('does not bake phantom spells when the class has no spellcasting', () => {
      // Simulates: user picks Wizard spells, then switches to Fighter without the
      // UI clearing the selections. The build service must not emit spells for a
      // non-caster regardless of the stale selection state.
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedClass: CLASSES_BY_ID['fighter'],
          selectedCantrips: ['fire-bolt'],
          selectedSpells: ['magic-missile'],
        }),
        { isNewCampaign: true }
      );
      expect(character?.knownSpells).toEqual([]);
      expect(character?.preparedSpells).toEqual([]);
    });

    it('populates knownSpells with spellbook choices and preparedSpells up to maxPrepared for Wizard', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedClass: CLASSES_BY_ID['wizard'],
          stats: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 }, // intMod +3, L1 maxPrepared = 4
          selectedCantrips: ['fire-bolt', 'light', 'mage-hand'],
          selectedSpells: ['magic-missile', 'shield', 'burning-hands', 'sleep', 'detect-magic', 'feather-fall'],
        }),
        { isNewCampaign: true }
      );
      // knownSpells receives cantrips + all 6 spellbook choices
      expect(character?.knownSpells).toEqual(['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'burning-hands', 'sleep', 'detect-magic', 'feather-fall']);
      // preparedSpells receives cantrips + first 4 spellbook choices (maxPrepared = 4)
      expect(character?.preparedSpells).toEqual(['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'burning-hands', 'sleep']);
    });
  });

  describe('draconic ancestry', () => {
    it('resolves ancestry and damage type for a dragonborn', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['dragonborn'], draconicAncestry: 'red' }),
        { isNewCampaign: true }
      );
      expect(character?.draconicAncestry).toBe('red');
      expect(character?.draconicDamageType).toBe('fire');
    });

    it('leaves ancestry undefined when not chosen', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ selectedRace: RACES_BY_ID['dragonborn'], draconicAncestry: null }),
        { isNewCampaign: true }
      );
      expect(character?.draconicAncestry).toBeUndefined();
      expect(character?.draconicDamageType).toBeUndefined();
    });

    it('grants Draconic Bloodline sorcerers +level HP and sorcerousOrigin at creation', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          selectedClass: CLASSES_BY_ID['sorcerer'],
          selectedSubclassId: 'draconic-bloodline',
          draconicAncestry: 'red',
          selectedCantrips: ['fire-bolt'],
          selectedSpells: ['burning-hands'],
        }),
        { isNewCampaign: true }
      );
      expect(character?.sorcerousOrigin).toBe('draconic-bloodline');
      // Human sorcerer L1: con 13 -> 14 (mod +2). Sorcerer hpBase 6 -> 6 + 2 = 8,
      // plus Draconic Bloodline +level (1) = 9. Without the subclass bonus it'd be 8.
      expect(character?.hp.max).toBe(9);
      expect(character?.hp.current).toBe(9);
    });
  });

  describe('skills & backstory pass-through', () => {
    it('carries allocated skills and remaining skill points through', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ allocatedSkills: { athletics: 1, perception: 1, survival: 1 } }),
        { isNewCampaign: true, remainingSkillPoints: 4 }
      );
      expect(character?.skills).toEqual({ athletics: 1, perception: 1, survival: 1 });
      expect(character?.unusedSkillPoints).toBe(4);
    });

    it('stores backstory when provided', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({ backstory: 'Once a street urchin...' }),
        { isNewCampaign: true }
      );
      expect(character?.backstory).toBe('Once a street urchin...');
    });

    it('stores SRD 5.1 background & persona fields when provided', () => {
      const { character } = buildCharacterFromWizard(
        baseWizard({
          alignment: 'lg',
          background: 'acolyte',
          personalityTraits: ['I quote sacred texts in almost every situation.'],
          ideals: ['Charity. I always try to help those in need.'],
          bonds: ['I would die to recover an ancient relic of my faith.'],
          flaws: ['I judge others harshly, and myself even more severely.'],
          appearance: 'Tall, with shaved head and ceremonial robes.',
        }),
        { isNewCampaign: true }
      );
      expect(character?.alignment).toBe('lg');
      expect(character?.background).toBe('acolyte');
      expect(character?.personalityTraits).toEqual(['I quote sacred texts in almost every situation.']);
      expect(character?.ideals).toEqual(['Charity. I always try to help those in need.']);
      expect(character?.bonds).toEqual(['I would die to recover an ancient relic of my faith.']);
      expect(character?.flaws).toEqual(['I judge others harshly, and myself even more severely.']);
      expect(character?.appearance).toBe('Tall, with shaved head and ceremonial robes.');
    });

    it('omits persona fields when left empty (no undefined arrays persisted)', () => {
      const { character } = buildCharacterFromWizard(baseWizard(), { isNewCampaign: true });
      expect(character?.alignment).toBeUndefined();
      expect(character?.background).toBeUndefined();
      expect(character?.personalityTraits).toBeUndefined();
      expect(character?.ideals).toBeUndefined();
      expect(character?.bonds).toBeUndefined();
      expect(character?.flaws).toBeUndefined();
      expect(character?.appearance).toBeUndefined();
    });
  });

  // Sanity check that the modifier helper matches the engine, guarding the HP expectations above.
  it('uses the standard ability-modifier formula', () => {
    expect(mod(8)).toBe(-1);
    expect(mod(10)).toBe(0);
    expect(mod(14)).toBe(2);
    expect(mod(15)).toBe(2);
    expect(mod(16)).toBe(3);
  });
});
