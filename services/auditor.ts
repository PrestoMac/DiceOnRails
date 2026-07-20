import { GameState, Character, SubclassSummary } from '../types';
import { FEATS_CATALOG } from '../utils/feats';
import { RACES_CATALOG } from '../utils/races';
import { SPELLS_BY_ID } from '../utils/spells';
import { getClassDef, canEquipArmor, getArmorTypeFromItem } from './classEngine';

/** Result of a single audit rule check against the game state. */
export interface AuditResult {
  rule: string;
  passed: boolean;
  details: string;
  autoFixed: boolean;
}

/** Internal structure defining a named audit rule with check and repair functions. */
interface AuditRule {
  name: string;
  check: (state: GameState) => AuditResult;
  repair: (state: GameState) => GameState;
}

/** Creates a passing AuditResult. */
function ok(rule: string): AuditResult {
  return { rule, passed: true, details: 'OK', autoFixed: false };
}

/** Creates a failing AuditResult with optional auto-fix flag. */
function fail(rule: string, details: string, autoFixed = false): AuditResult {
  return { rule, passed: false, details, autoFixed };
}

/** Applies a transformation function to every character in the party and returns the new state. */
function mapParty(state: GameState, fn: (c: Character) => Character): GameState {
  return { ...state, party: state.party.map(fn) };
}

/** Iterates over all party characters, returning the first non-null AuditResult from the predicate. */
function checkEachChar(state: GameState, rule: string, predicate: (char: Character) => AuditResult | null): AuditResult {
  for (const char of state.party) {
    const result = predicate(char);
    if (result) return result;
  }
  return ok(rule);
}

const ARRAY_FIELDS = [
  'resources',
  'knownSpells',
  'preparedSpells',
  'racialTraits',
  'unlockedSubclassFeatures',
] as const;

const ARRAY_FIELD_LABELS: Record<string, string> = {
  resources: 'missing or invalid resources',
  knownSpells: 'missing knownSpells',
  preparedSpells: 'missing preparedSpells',
  racialTraits: 'missing racialTraits',
  unlockedSubclassFeatures: 'missing unlockedSubclassFeatures',
};

const VALID_STATS = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);

const AUDIT_RULES: AuditRule[] = [
  {
    name: 'hp-bounds',
    check: (state) => checkEachChar(state, 'hp-bounds', (c) => {
      if (c.hp.current < 0) return fail('hp-bounds', `${c.name} has negative HP: ${c.hp.current}`);
      if (c.hp.current > c.hp.max) return fail('hp-bounds', `${c.name} HP exceeds max: ${c.hp.current}/${c.hp.max}`);
      if (c.hp.max <= 0) return fail('hp-bounds', `${c.name} has invalid max HP: ${c.hp.max}`);
      return null;
    }),
    repair: (state) => mapParty(state, c => ({
      ...c,
      hp: {
        current: Math.min(Math.max(0, c.hp.current), c.hp.max),
        max: Math.max(1, c.hp.max)
      }
    }))
  },
  {
    name: 'currency-non-negative',
    check: (state) => checkEachChar(state, 'currency-non-negative', (c) => {
      const { gp, sp, cp } = c.currency;
      if (gp < 0 || sp < 0 || cp < 0) {
        return fail('currency-non-negative', `${c.name} has negative currency (gp:${gp} sp:${sp} cp:${cp})`);
      }
      return null;
    }),
    repair: (state) => mapParty(state, c => ({
      ...c,
      currency: {
        gp: Math.max(0, c.currency.gp),
        sp: Math.max(0, c.currency.sp),
        cp: Math.max(0, c.currency.cp)
      }
    }))
  },
  {
    name: 'inventory-quantity-non-negative',
    check: (state) => {
      for (const char of state.party) {
        for (const item of char.inventory) {
          if (item.quantity <= 0) {
            return fail('inventory-quantity-non-negative', `${char.name} has "${item.name}" with quantity ${item.quantity}`);
          }
        }
      }
      return ok('inventory-quantity-non-negative');
    },
    repair: (state) => mapParty(state, c => ({
      ...c,
      inventory: c.inventory.filter(item => item.quantity > 0)
    }))
  },
  {
    name: 'character-location-exists',
    check: (state) => checkEachChar(state, 'character-location-exists', (c) =>
      (!c.location?.trim()) ? fail('character-location-exists', `${c.name} has no location set`) : null
    ),
    repair: (state) => mapParty(state, c => ({
      ...c,
      location: c.location || 'Unknown Location'
    }))
  },
  {
    name: 'unique-lore-entries',
    check: (state) => {
      const seen = new Set<string>();
      for (const entry of state.lore) {
        const key = `${entry.title.toLowerCase()}|${entry.category}`;
        if (seen.has(key)) return fail('unique-lore-entries', `Duplicate lore entry: "${entry.title}" (${entry.category})`);
        seen.add(key);
      }
      return ok('unique-lore-entries');
    },
    repair: (state) => {
      const seen = new Set<string>();
      return {
        ...state,
        lore: state.lore.filter(entry => {
          const key = `${entry.title.toLowerCase()}|${entry.category}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      };
    }
  },
  {
    name: 'quest-id-unique',
    check: (state) => {
      const ids = new Set<string>();
      for (const quest of state.quests) {
        if (ids.has(quest.id)) return fail('quest-id-unique', `Duplicate quest ID: ${quest.id}`);
        ids.add(quest.id);
      }
      return ok('quest-id-unique');
    },
    repair: (state) => ({
      ...state,
      quests: state.quests.map(q => ({
        ...q,
        id: q.id || Math.random().toString(36).substr(2, 9)
      }))
    })
  },
  {
    name: 'xp-non-negative',
    check: (state) => checkEachChar(state, 'xp-non-negative', (c) =>
      (c.experience === undefined || c.experience < 0) ? fail('xp-non-negative', `${c.name} has invalid XP`) : null
    ),
    repair: (state) => mapParty(state, c => ({
      ...c,
      experience: Math.max(0, c.experience || 0)
    }))
  },
  {
    name: 'unused-stat-points-valid',
    check: (state) => checkEachChar(state, 'unused-stat-points-valid', (c) =>
      (c.unusedStatPoints === undefined || c.unusedStatPoints < 0) ? fail('unused-stat-points-valid', `${c.name} has invalid unused stat points`) : null
    ),
    repair: (state) => mapParty(state, c => ({
      ...c,
      unusedStatPoints: Math.max(0, c.unusedStatPoints || 0)
    }))
  },
  {
    name: 'experience-to-next-level-positive',
    check: (state) => checkEachChar(state, 'experience-to-next-level-positive', (c) =>
      (!c.experienceToNextLevel || c.experienceToNextLevel <= 0) ? fail('experience-to-next-level-positive', `${c.name} has invalid XP threshold`) : null
    ),
    repair: (state) => mapParty(state, c => ({
      ...c,
      experienceToNextLevel: c.experienceToNextLevel > 0 ? c.experienceToNextLevel : 300
    }))
  },
  {
    name: 'feats-valid',
    check: (state) => {
      const validIds = new Set(FEATS_CATALOG.map(f => f.id));
      for (const char of state.party) {
        if (!char.feats) continue;
        if (!Array.isArray(char.feats)) return fail('feats-valid', `${char.name} has non-array feats field`);
        for (const id of char.feats) {
          if (!validIds.has(id)) return fail('feats-valid', `${char.name} has unknown feat: ${id}`);
        }
      }
      return ok('feats-valid');
    },
    repair: (state) => {
      const validIds = new Set(FEATS_CATALOG.map(f => f.id));
      return {
        ...state,
        party: state.party.map(c => {
          const feats = Array.isArray(c.feats) ? c.feats.filter((id: string) => validIds.has(id)) : [];
          return {
            ...c,
            feats,
            featSelections: Array.isArray(c.featSelections) ? c.featSelections : [],
            featChoices: (c.featChoices && typeof c.featChoices === 'object') ? c.featChoices : {},
            pendingFeatChoice: !!c.pendingFeatChoice
          };
        })
      };
    }
  },
  {
    name: 'classes-valid',
    check: (state) => {
      let needsRepair = false;
      const details: string[] = [];
      for (const char of state.party) {
        for (const field of ARRAY_FIELDS) {
          if (!char[field] || !Array.isArray(char[field])) {
            details.push(`${char.name}: ${ARRAY_FIELD_LABELS[field]}`);
            needsRepair = true;
          }
        }
        if (char.subclassId) {
          const classDef = getClassDef(char.class?.toLowerCase() || '');
          if (!classDef?.subclasses.find((s: SubclassSummary) => s.id === char.subclassId)) {
            details.push(`${char.name}: unknown subclass ${char.subclassId}`);
            needsRepair = true;
          }
        }
        for (const item of char.inventory || []) {
          if (item.equipped && item.type === 'armor') {
            const armorType = getArmorTypeFromItem(item);
            if (!canEquipArmor(char, armorType)) {
              details.push(`${char.name}: cannot equip ${item.name}`);
              needsRepair = true;
            }
          }
        }
      }
      return needsRepair ? fail('classes-valid', details.join('; '), true) : ok('classes-valid');
    },
    repair: (state) => ({
      ...state,
      party: state.party.map(c => {
        if (c.class) c.class = c.class.toLowerCase();
        if (c.race) c.race = c.race.toLowerCase();
        for (const field of ARRAY_FIELDS) {
          if (!c[field]) c[field] = [];
        }
        if (c.subclassId) {
          const classDef = getClassDef(c.class);
          if (!classDef?.subclasses.find((s: SubclassSummary) => s.id === c.subclassId)) c.subclassId = undefined;
        }
        const validSpells = new Set(Object.keys(SPELLS_BY_ID));
        c.knownSpells = c.knownSpells.filter((s: string) => validSpells.has(s));
        c.preparedSpells = c.preparedSpells.filter((s: string) => validSpells.has(s));
        for (const item of c.inventory) {
          if (item.equipped && item.type === 'armor') {
            if (!canEquipArmor(c, getArmorTypeFromItem(item))) item.equipped = false;
          }
        }
        return c;
      })
    })
  },
  {
    name: 'races-valid',
    check: (state) => {
      const validRaces = new Set(RACES_CATALOG.map(r => r.id));
      for (const char of state.party) {
        const raceId = (char.race || '').toLowerCase();
        if (char.race && !validRaces.has(raceId)) return fail('races-valid', `${char.name} has unknown race: ${char.race}`, true);
      }
      return ok('races-valid');
    },
    repair: (state) => ({
      ...state,
      party: state.party.map(c => {
        c.race = (c.race || 'human').toLowerCase();
        if (!RACES_CATALOG.find(r => r.id === c.race)) c.race = 'human';
        return c;
      })
    })
  },
  {
    name: 'spells-valid',
    check: (state) => {
      const validIds = new Set(Object.keys(SPELLS_BY_ID));
      for (const char of state.party) {
        for (const s of [...(char.knownSpells || []), ...(char.preparedSpells || [])]) {
          if (!validIds.has(s)) return fail('spells-valid', `${char.name} has unknown spell: ${s}`, true);
        }
      }
      return ok('spells-valid');
    },
    repair: (state) => {
      const validIds = new Set(Object.keys(SPELLS_BY_ID));
      return mapParty(state, c => ({
        ...c,
        knownSpells: (c.knownSpells || []).filter((s: string) => validIds.has(s)),
        preparedSpells: (c.preparedSpells || []).filter((s: string) => validIds.has(s)),
      }));
    }
  },
  {
    name: 'proficiency-valid',
    check: (state) => {
      for (const char of state.party) {
        const classDef = getClassDef(char.class?.toLowerCase() || '');
        if (!classDef) return fail('proficiency-valid', `${char.name} has unknown class: ${char.class}`);
        if (!Array.isArray(classDef.savingThrowProfs) || classDef.savingThrowProfs.length === 0) {
          return fail('proficiency-valid', `${char.name} class "${classDef.id}" has no savingThrowProfs defined`);
        }
        for (const prof of classDef.savingThrowProfs) {
          if (!VALID_STATS.has(prof)) return fail('proficiency-valid', `${char.name} class "${classDef.id}" has invalid savingThrowProf: ${prof}`);
        }
      }
      return ok('proficiency-valid');
    },
    repair: (state) => state,
  },
  {
    name: 'game-time-valid',
    check: (state) => {
      if (state.gameTime == null) return ok('game-time-valid');
      if (typeof state.gameTime !== 'number' || isNaN(state.gameTime)) {
        return fail('game-time-valid', 'gameTime was NaN — reset to 0');
      }
      if (state.gameTime < 0) {
        return fail('game-time-valid', 'gameTime was negative — reset to 0');
      }
      return ok('game-time-valid');
    },
    repair: (state) => {
      if (state.gameTime == null || typeof state.gameTime !== 'number' || isNaN(state.gameTime) || state.gameTime < 0) {
        state.gameTime = 0;
      }
      return state;
    }
  },
  {
    name: 'last-long-rest-valid',
    check: (state) => {
      if (state.lastLongRestTime == null) return ok('last-long-rest-valid'); 
      if (typeof state.lastLongRestTime !== 'number' || isNaN(state.lastLongRestTime)) {
        return fail('last-long-rest-valid', 'lastLongRestTime was NaN — reset to -960');
      }
      if (state.lastLongRestTime > (state.gameTime ?? 0)) {
        return fail('last-long-rest-valid', 'lastLongRestTime is in the future — reset to -960');
      }
      return ok('last-long-rest-valid');
    },
    repair: (state) => {
      if (
        state.lastLongRestTime == null ||
        typeof state.lastLongRestTime !== 'number' ||
        isNaN(state.lastLongRestTime) ||
        state.lastLongRestTime > (state.gameTime ?? 0)
      ) {
        state.lastLongRestTime = -960;
      }
      return state;
    }
  },
];

/** Runs all audit rules against the provided game state, returning an array of results with attempted auto-repairs. */
export function auditState(state: GameState): AuditResult[] {
  const results: AuditResult[] = [];
  let current = { ...state };

  for (const rule of AUDIT_RULES) {
    const result = rule.check(current);
    if (!result.passed) {
      try {
        current = rule.repair(current);
        result.autoFixed = true;
      } catch {
        result.details += ' (auto-repair failed)';
      }
    }
    results.push(result);
  }

  return results;
}

/** Applies all audit rule repairs to the game state and returns the corrected copy. */
export function repairState(state: GameState): GameState {
  let current = { ...state };

  for (const rule of AUDIT_RULES) {
    const result = rule.check(current);
    if (!result.passed) {
      try {
        current = rule.repair(current);
      } catch { /* repair may fail if state is valid */ }
    }
  }

  return current;
}
