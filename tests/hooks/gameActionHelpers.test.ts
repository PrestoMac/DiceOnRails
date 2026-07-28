import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Character, GameState } from '../../types';

const fighter: Character = {
  id: 'char-1', name: 'Aragorn', class: 'fighter', race: 'human', level: 1,
  hp: { current: 10, max: 10 },
  stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
  inventory: [{ id: 'w1', name: 'Longsword', type: 'weapon', quantity: 1, equipped: true, stats: { properties: [] } }],
  currency: { gp: 0, sp: 0, cp: 0 },
  location: 'Tavern', experience: 0, experienceToNextLevel: 300,
  unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 1, max: 1 },
  resources: [], knownSpells: [], preparedSpells: [], feats: [], featSelections: [],
} as unknown as Character;

const wizard: Character = {
  id: 'char-2', name: 'Gandalf', class: 'wizard', race: 'elf', level: 1,
  hp: { current: 6, max: 6 },
  stats: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
  inventory: [],
  currency: { gp: 0, sp: 0, cp: 0 },
  location: 'Tavern', experience: 0, experienceToNextLevel: 300,
  unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 1, max: 1 },
  resources: [{ id: 'spell-slot-1', name: 'Spell Slot L1', current: 2, max: 2, resetOn: 'long' as const }],
  knownSpells: [], preparedSpells: ['fire-bolt'], feats: [], featSelections: [],
  notes: 'My secret journal', gmNotes: 'GM-only secrets',
} as unknown as Character;

const baseState: GameState = {
  party: [fighter, wizard],
  worldDescription: 'A tavern', sessionLogs: [], quests: [], lore: [], } as GameState;

const mcpServerMock = {
  getTarget: vi.fn(),
  getFullState: vi.fn(() => baseState),
  getResource: vi.fn(() => ({ location: 'Tavern' })),
  getCharacterProgression: vi.fn(() => 'Level 1 (0/300 XP)'),
};

vi.mock('../../services/mcpService', () => ({ mcpServer: mcpServerMock }));

const { buildContextString, buildCharacterEnrichment, buildBatchContextString } = await import('../../hooks/gameActionHelpers');

describe('gameActionHelpers — multiplayer context enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpServerMock.getFullState.mockReturnValue(baseState);
    mcpServerMock.getTarget.mockReturnValue(fighter);
  });

  describe('buildCharacterEnrichment', () => {
    it('returns a non-empty block for a caster with spells and resources', () => {
      const out = buildCharacterEnrichment(wizard);
      expect(out).toContain('ACTIVE RESOURCES');
      expect(out).toContain('Spell Slot L1: 2/2');
    });

    it('omits the SPELLS block for a non-caster', () => {
      const plain = { ...fighter, resources: [], knownSpells: [], preparedSpells: [], feats: [] } as Character;
      const out = buildCharacterEnrichment(plain);
      expect(out).not.toContain('SPELLS [');
      expect(out).not.toContain('ACTIVE RESOURCES');
    });

    it('emits a PERSONA block when SRD persona fields are present', () => {
      const acolyte = {
        ...fighter,
        alignment: 'lg',
        background: 'acolyte',
        personalityTraits: ['I quote sacred texts.'],
        ideals: ['Charity.'],
        bonds: ['I would die for my faith.'],
        flaws: ['I judge others harshly.'],
        backstory: 'Raised in a temple.',
      } as Character;
      const out = buildCharacterEnrichment(acolyte);
      expect(out).toContain('PERSONA [');
      expect(out).toContain('Alignment: Lawful Good');
      expect(out).toContain('Background: Acolyte');
      expect(out).toContain('Personality: "I quote sacred texts."');
      expect(out).toContain('Ideals: "Charity."');
      expect(out).toContain('Bonds: "I would die for my faith."');
      expect(out).toContain('Flaws: "I judge others harshly."');
      expect(out).toContain('Backstory: Raised in a temple.');
    });

    it('omits the PERSONA block when no persona fields are set (zero token cost)', () => {
      const plain = { ...fighter, alignment: '', background: '', personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '' } as Character;
      const out = buildCharacterEnrichment(plain);
      expect(out).not.toContain('PERSONA [');
    });

    it('emits a PERSONA block from backstory alone (existing-char compatibility)', () => {
      const oldChar = { ...fighter, backstory: 'A lone wanderer.' } as Character;
      const out = buildCharacterEnrichment(oldChar);
      expect(out).toContain('PERSONA [');
      expect(out).toContain('Backstory: A lone wanderer.');
    });
  });

  describe('buildContextString (solo — regression guard)', () => {
    it('prefixes with the active player marker and includes full party state', () => {
      const out = buildContextString('char-1');
      expect(out).toContain('YOU ARE NARRATING FOR ACTIVE PLAYER:');
      expect(out).toContain('FULL PARTY STATE:');
      expect(out).toContain('Aragorn');
      expect(out).toContain('Combat State:');
    });

    it('falls back to the no-character marker when myCharacterId is null', () => {
      const out = buildContextString(null);
      expect(out).toContain('Unknown Player (No Character Selected)');
    });
  });

  describe('buildBatchContextString (multiplayer)', () => {
    it('emits a CHARACTER block for every party member', () => {
      const out = buildBatchContextString();
      expect(out).toContain('YOU ARE NARRATING FOR A FULL PARTY');
      expect(out).toContain('CHARACTER Aragorn (id: char-1):');
      expect(out).toContain('CHARACTER Gandalf (id: char-2):');
    });

    it('includes the standard world/time/quest/lore/combat blocks', () => {
      const out = buildBatchContextString();
      expect(out).toContain('FULL PARTY STATE:');
      expect(out).toContain('Combat State:');
      expect(out).toContain('World:');
      expect(out).toContain('Time:');
    });

    it('enriches caster members with their resources/spells (not just the active char)', () => {
      const out = buildBatchContextString();
      // Gandalf's enrichment must appear even though he is not the locally-active character.
      expect(out).toContain('Spell Slot L1: 2/2');
    });

    it('strips private notes/gmNotes from the LLM context (issue 10 privacy)', () => {
      const out = buildBatchContextString();
      expect(out).not.toContain('My secret journal');
      expect(out).not.toContain('GM-only secrets');
      expect(out).not.toContain('"notes"');
      expect(out).not.toContain('"gmNotes"');
    });

    it('strips private notes/gmNotes from the solo context too', () => {
      mcpServerMock.getTarget.mockReturnValue(wizard);
      const out = buildContextString('char-2');
      expect(out).not.toContain('My secret journal');
      expect(out).not.toContain('GM-only secrets');
    });
  });
});
