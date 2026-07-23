import { Character, GameState, MCPResponse } from '../../types';
import { cryptoRoll } from '../../utils/random';
import { fail, fuzzyMatchEntity, generateId } from './_shared';
import { getMod, getProficiencyBonus, getClassDef, getSpellSaveDc, spendResource as classEngineSpendResource } from '../classEngine';
import { castSpell as engineCastSpell, learnSpell as engineLearnSpell, prepareSpell as enginePrepareSpell, unprepareSpell as engineUnprepareSpell, canLearnSpell, breakConcentration as engineBreakConcentration, getMaxPactSlotLevel } from '../spellcastingEngine';
import { SPELLS_BY_ID, parseDuration } from '../../utils/spells';
import { rollDice } from '../diceEngine';
import { parseDiceFormula } from '../../utils/dice';
import { applyCondition, removeCondition, getConditionEffects, getExhaustionPenalty } from '../conditionEngine';

/** Dependencies required by the SpellcastingService. */
export interface SpellcastingDeps {
  getTarget: (id?: string) => Character | undefined;
  inflict_damage: (amount: number, targetId?: string, damageType?: string, options?: { skipTargetDerivedReductions?: boolean }) => Promise<MCPResponse>;
  make_save: (targetId: string, stat: string, dc: number) => Promise<MCPResponse>;
  syncInitiativeConditions: () => void;
}

/** Service interface for spell casting, ritual casting, spellbook management, and resource usage. */
export interface SpellcastingService {
  cast_spell(characterId: string, spellId: string, slotLevel?: number, targets?: string[], targetSaveResults?: Record<string, boolean>, reaction?: boolean): Promise<MCPResponse>;
  resolve_dot_damage(spellId: string, targetId: string, casterId?: string): Promise<MCPResponse>;
  cast_ritual(characterId: string, spellId: string): Promise<MCPResponse>;
  spell_effect(mode: 'counter' | 'dispel', casterId: string, targetSpellLevel: number, targetId?: string): Promise<MCPResponse>;
  manage_spellbook(characterId: string, action: 'learn' | 'prepare' | 'unprepare' | 'forget', spellId: string): Promise<MCPResponse>;
  use_resource(characterId: string, resourceId: string, targetId?: string, amount?: number): Promise<MCPResponse>;
  abilityCheckForSpell(caster: Character, targetSpellLevel: number): { roll: number; total: number; dc: number; success: boolean; ability: string; abilityMod: number; profBonus: number } | null;
  getDotDamageFormula(spellId: string, slotLevel: number): string;
  getDotDamageType(spellId: string): string;
  getDotSaveStat(spellId: string): string | undefined;
  getDotAddsAbilityMod(spellId: string): boolean;
  applyAcBuff(target: Character, source: string, bonus: number, duration: number, durationUnit?: 'round' | 'minute'): void;
  applyWeaponBuff(target: Character, source: string, duration: number, durationUnit?: 'round' | 'minute'): void;
}

/** Creates a new SpellcastingService instance operating on the given GameState. */
export function createSpellcastingService(state: GameState, deps: SpellcastingDeps): SpellcastingService {
  function getDotDamageFormula(spellId: string, slotLevel: number): string {
    const baseFormulas: Record<string, string> = {
      'moonbeam': '2d10',
      'flaming-sphere': '2d6',
      'spirit-guardians': '3d8',
      'cloudkill': '5d8',
      'wall-of-fire': '5d8',
    };
    const formula = baseFormulas[spellId] || '1d6';
    const match = formula.match(/^(\d+)d(\d+)/);
    if (match) {
      let baseCount = parseInt(match[1]);
      const sides = parseInt(match[2]);
      const upcast: Record<string, { minSlot: number; dicePerSlot: number }> = {
        'moonbeam': { minSlot: 3, dicePerSlot: 1 },
        'flaming-sphere': { minSlot: 3, dicePerSlot: 1 },
        'spirit-guardians': { minSlot: 4, dicePerSlot: 1 },
        'cloudkill': { minSlot: 6, dicePerSlot: 1 },
        'wall-of-fire': { minSlot: 5, dicePerSlot: 1 },
      };
      const up = upcast[spellId];
      if (up && slotLevel >= up.minSlot) {
        const extraDice = (slotLevel - up.minSlot + 1) * up.dicePerSlot;
        baseCount += extraDice;
      }
      return `${baseCount}d${sides}`;
    }
    return formula;
  }

  function getDotDamageType(spellId: string): string {
    return { 'moonbeam': 'radiant', 'flaming-sphere': 'fire', 'spirit-guardians': 'radiant',
      'cloudkill': 'poison', 'wall-of-fire': 'fire' }[spellId] || 'fire';
  }

  function getDotSaveStat(spellId: string): string | undefined {
    return { 'moonbeam': 'con', 'flaming-sphere': 'dex', 'spirit-guardians': 'wis',
      'cloudkill': 'con', 'wall-of-fire': 'dex' }[spellId];
  }

  function getDotAddsAbilityMod(spellId: string): boolean {
    return ['moonbeam', 'flaming-sphere', 'spirit-guardians'].includes(spellId);
  }

  function applyAcBuff(target: Character, source: string, bonus: number, duration: number, durationUnit?: 'round' | 'minute'): void {
    const condId = `${source}-ac`;
    const existing = (target.conditions ?? []).find(c => c.id === condId && c.source === source);
    if (existing) {
      existing.duration = duration;
      return;
    }
    target.acBonus = (target.acBonus || 0) + bonus;
    applyCondition(target, {
      id: condId,
      source,
      duration,
      saveEnd: undefined,
      saveDC: 0,
      onRemove: { kind: 'acBonus', value: bonus },
      durationUnit,
    });
  }

  function applyWeaponBuff(target: Character, source: string, duration: number, durationUnit?: 'round' | 'minute'): void {
    applyCondition(target, {
      id: source,
      source,
      duration,
      saveEnd: undefined,
      saveDC: 0,
      durationUnit,
    });
  }

  function abilityCheckForSpell(caster: Character, targetSpellLevel: number): { roll: number; total: number; dc: number; success: boolean; ability: string; abilityMod: number; profBonus: number } | null {
    const classDef = getClassDef(caster.class);
    if (!classDef?.spellcasting) return null;
    const ability = classDef.spellcasting.ability;
    const abilityMod = getMod(caster.stats[ability]);
    const profBonus = getProficiencyBonus(caster as unknown as Character);
    const roll = cryptoRoll(20);
    const total = roll + abilityMod + profBonus - getExhaustionPenalty(caster);
    const dc = 10 + targetSpellLevel;
    return { roll, total, dc, success: total >= dc, ability, abilityMod, profBonus };
  }

  function breakConcentrationWithCleanup(char: Character): void {
    if (!char.concentrationSpellId) return;
    engineBreakConcentration(char, 'voluntary');
    if (state.combat?.activeDoTs) {
      state.combat.activeDoTs = state.combat.activeDoTs.filter(
        dot => !(dot.casterId === char.id && dot.spellId === char.concentrationSpellId)
      );
    }
  }

  return {
    getDotDamageFormula,
    getDotDamageType,
    getDotSaveStat,
    getDotAddsAbilityMod,
    applyAcBuff,
    applyWeaponBuff,
    abilityCheckForSpell,

    async cast_spell(characterId, spellId, slotLevel = 0, targets = [], targetSaveResults, reaction) {
      const char = deps.getTarget(characterId);
      if (!char) return fail('Character not found.');

      if (reaction) {
        if (!char.reactionAvailable || char.reactionUsedThisTurn) {
          return fail(`${char.name} has already used their reaction this round.`);
        }
      }

      const classDef = getClassDef(char.class);
      const spellDef = SPELLS_BY_ID[spellId.toLowerCase().replace(/\s+/g, '-')];

      const isSelfTargetSpell =
        spellDef?.range === 'Self' ||
        (spellDef?.range === 'Touch' && !spellDef.attackRoll && !spellDef.damage && !spellDef.save && !spellDef.secondaryDamage);
      if (isSelfTargetSpell && targets.length === 0) {
        targets = [characterId];
      }


      if (spellDef && spellDef.level > 0 && (!slotLevel || slotLevel < spellDef.level)) {
        slotLevel = spellDef.level;
      }


      if (char.class === 'warlock' && spellDef && spellDef.level > 0) {
        const maxPactLevel = getMaxPactSlotLevel(char);
        if (slotLevel > maxPactLevel) {
          return fail(`${char.name} (Warlock level ${char.level}) can only cast up to level ${maxPactLevel} pact magic slots.`);
        }
      }

      const enrichedTargets = targets.map(id => {
        const enemy = state.combat?.enemies.find(e => e.id === id || e.name.toLowerCase() === id.toLowerCase());
        const player = deps.getTarget(id);
        const entity = player || enemy;
        const condFx = entity ? getConditionEffects(entity) : null;
        return {
          id,
          ac: (entity as unknown as { ac?: number })?.ac ?? 0,
          _attacksAgainstHaveAdvantage: condFx?.attacksAgainstHaveAdvantage ?? false,
        };
      });
      const result = engineCastSpell(char, spellId, slotLevel as 0|1|2|3|4|5|6|7|8|9, enrichedTargets, state.combat ? { enemies: state.combat.enemies, party: state.party } : undefined);
      if (!result.success) {
        return { success: false, data: result, message: result.reason || 'Spell cast failed.' };
      }

      if (result.concentrationStarted) {
        if (!char.runtime) char.runtime = {};
        char.runtime.concentrationStartTime = state.gameTime;
        char.runtime.concentrationStartRound = state.combat?.isActive ? state.combat.round : undefined;
        if (spellDef?.durationScaling) {
          const scale = [...spellDef.durationScaling].reverse().find(s => slotLevel >= s.atSlotLevel);
          char.runtime.concentrationEffectiveDuration = scale ? scale.value : (spellDef.parsedDuration?.value ?? 60);
        } else {
          const parsed = spellDef?.parsedDuration ?? (spellDef ? parseDuration(spellDef.duration) : undefined);
          char.runtime.concentrationEffectiveDuration = parsed?.unit === 'minute' ? parsed.value : undefined;
        }
      }

      if (result.damage && targets.length > 0 && state.combat?.isActive) {
        const validatedTargets: string[] = [];
        const unresolvedTargets: string[] = [];
        for (const targetId of targets) {
          const isEnemy = state.combat.enemies.some(e => fuzzyMatchEntity(e, targetId));
          const isParty = !!deps.getTarget(targetId);
          if (isEnemy || isParty) {
            validatedTargets.push(targetId);
          } else {
            unresolvedTargets.push(targetId);
          }
        }
        if (unresolvedTargets.length > 0 && validatedTargets.length === 0) {
          return {
            success: false,
            data: result,
            message: `No valid targets found for ${spellDef?.name || 'spell'}. Targets [${unresolvedTargets.join(', ')}] are not in combat or party. For damage spells, enemies must be registered via add_enemy first, then combat started with start_combat.`
          };
        }
      }

      const resolvedTargets = targets.map(targetId => {
        const cleanId = targetId.toLowerCase().trim();
        const enemy = state.combat?.enemies?.find(e =>
          e.id === targetId || e.name.toLowerCase() === cleanId
        );
        return enemy?.id || targetId;
      });

      if (result.damage?.perTarget?.length && spellDef?.save) {
        const saveDC = result.saveRoll?.dc ?? getSpellSaveDc(char);
        const saveStat = spellDef.save.stat;
        const halfOnSuccess = result.saveRoll?.halfOnSuccess === true;

        for (const t of result.damage.perTarget) {
          let dmg = t.damage;
          const llmOverride = targetSaveResults?.[t.targetId];
          if (llmOverride !== undefined) {
            if (llmOverride && halfOnSuccess) dmg = Math.floor(dmg / 2);
          } else if (halfOnSuccess) {
            const saveResult = await deps.make_save(t.targetId, saveStat, saveDC);
            if (saveResult.success && saveResult.data?.success) {
              dmg = Math.floor(dmg / 2);
            }
          }
          const resolvedTargetId = resolvedTargets.find(rt => {
            const cleanId = t.targetId.toLowerCase().trim();
            return rt === t.targetId || rt.toLowerCase() === cleanId;
          }) || t.targetId;
          const dmgResult = await deps.inflict_damage(dmg, resolvedTargetId, result.damage.type);
          if (!dmgResult.success) {
            state.sessionLogs.push(`Damage to ${t.targetId} failed: ${dmgResult.message}`);
          }
        }
      } else if (result.damage?.perTarget) {
        for (const t of result.damage.perTarget) {
          const dmg = t.damage;
          const resolvedTargetId = resolvedTargets.find(rt => {
            const cleanId = t.targetId.toLowerCase().trim();
            return rt === t.targetId || rt.toLowerCase() === cleanId;
          }) || t.targetId;
          const dmgResult = await deps.inflict_damage(dmg, resolvedTargetId, result.damage.type);
          if (!dmgResult.success) {
            state.sessionLogs.push(`Damage to ${t.targetId} failed: ${dmgResult.message}`);
          }
        }
      } else if (result.damage && targets.length > 0) {
        const dmgResult = await deps.inflict_damage(result.damage.total, resolvedTargets[0], result.damage.type);
        if (!dmgResult.success) {
          state.sessionLogs.push(`Damage to ${resolvedTargets[0]} failed: ${dmgResult.message}`);
        }
      }

      if (result.healing && targets.length > 0) {
        for (const targetId of targets) {
          const target = deps.getTarget(targetId);
          if (target) {
            const previousHp = target.hp.current;
            target.hp.current = Math.min(target.hp.max, target.hp.current + result.healing);
            if (previousHp === 0 && target.hp.current > 0) {
              delete target.deathSaves;
            }
            if (spellDef?.healing && result.healing) {
              const isTempHpSpell = spellDef.description?.toLowerCase().includes('temporary hit points') || spellDef.description?.toLowerCase().includes('temp hp');
              if (isTempHpSpell) {
                const tempHpAmount = result.healing;
                if (!target.tempHp || tempHpAmount > target.tempHp) {
                  target.tempHp = tempHpAmount;
                }
              }
            }
          }
        }
      }

      if (spellDef && targets.length > 0) {
        const spellName = spellDef.id;
        for (const targetId of targets) {
          const targetChar = deps.getTarget(targetId);
          if (!targetChar) continue;

          if (spellName === 'mage-armor') {
            if (!targetChar.inventory.some(i => i.equipped && i.type === 'armor')) {
              applyAcBuff(targetChar, 'mage-armor', 3, 480, 'minute');
            }
          } else if (spellName === 'shield') {
            applyAcBuff(targetChar, 'shield', 5, 1, 'round');
          } else if (spellName === 'shield-of-faith') {
            applyAcBuff(targetChar, 'shield-of-faith', 2, 10, 'minute');
          } else if (spellName === 'barkskin') {
            targetChar.acMinimum = 16;
          } else if (spellName === 'greater-restoration') {
            const exhaustionConds = (targetChar.conditions ?? [])
              .filter(c => c.id.startsWith('exhaustion-'))
              .sort((a, b) => parseInt(b.id.split('-')[1]) - parseInt(a.id.split('-')[1]));
            if (exhaustionConds.length > 0) {
              const highest = exhaustionConds[0];
              const level = parseInt(highest.id.split('-')[1]);
              targetChar.conditions = targetChar.conditions.filter(c => c.id !== highest.id);
              state.sessionLogs.push(`${targetChar.name}'s exhaustion reduced from level ${level} to level ${Math.max(0, level - 1)}.`);
            }
          }
        }
      }

      if (spellDef && targets.length > 0) {
        const spellName = spellDef.id;
        for (const targetId of targets) {
          const targetChar = deps.getTarget(targetId);
          if (!targetChar) continue;

          if (spellName === 'hunters-mark') {
            applyWeaponBuff(targetChar, 'hunters-mark', 60, 'minute');
          } else if (spellName === 'divine-favor') {
            applyWeaponBuff(targetChar, 'divine-favor', 1, 'minute');
          } else if (spellName === 'branding-smite') {
            applyWeaponBuff(targetChar, 'branding-smite', 1, 'minute');
          } else if (spellName === 'magic-weapon') {
            applyWeaponBuff(targetChar, 'magic-weapon', 60, 'minute');
          }
        }
      }

      if (spellDef?.condition && targets.length > 0 && !spellDef.hpPoolDice) {
        const appliedConditions: Array<{ targetId: string; targetName: string; conditionId: string }> = [];

        for (const targetId of targets) {
          const targetChar = deps.getTarget(targetId);
          const enemy = state.combat?.enemies.find(e => e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase());
          const targetObj = targetChar || enemy;
          if (!targetObj) continue;

          if (!spellDef.condition) continue;
          const condDef = spellDef.condition;
          const resolvedSaveDC = result.saveRoll?.dc ?? getSpellSaveDc(char);
          const condParsed = spellDef.parsedDuration ?? parseDuration(spellDef.duration);
          const condDurationUnit: 'round' | 'minute' | 'permanent' | undefined =
            condParsed?.unit === 'round' ? 'round'
              : condParsed?.unit === 'minute' ? 'minute'
              : condParsed?.unit === 'permanent' ? 'permanent'
              : undefined;
          const applied = applyCondition(targetObj, {
            id: condDef.type,
            source: spellId,
            duration: condDef.duration || null,
            saveEnd: condDef.saveTo ?? undefined,
            saveDC: resolvedSaveDC,
            onFailedSave: condDef.onFailedSave || 'none',
            durationUnit: condDurationUnit,
          });

          if (applied) {
            appliedConditions.push({
              targetId,
              targetName: targetObj.name || targetId,
              conditionId: condDef.type,
            });
          }
        }

        if (appliedConditions.length > 0) {
          (result as unknown as { appliedConditions: unknown[] }).appliedConditions = appliedConditions;
        }
      }
      deps.syncInitiativeConditions();

      if (spellDef?.id === 'aid' && targets.length > 0) {
        const bonusPerSlot = 5;
        const slotBonus = slotLevel > 1 ? (slotLevel - 1) * bonusPerSlot : 0;
        const totalBonus = bonusPerSlot + slotBonus;
        for (const targetId of targets) {
          const targetChar = deps.getTarget(targetId);
          if (targetChar) {
            targetChar.hp.max += totalBonus;
            targetChar.hp.current += totalBonus;
          }
        }
      }

      if (spellDef?.id === 'heroism' && targets.length > 0) {
        for (const targetId of targets) {
          const targetChar = deps.getTarget(targetId);
          if (targetChar) {
            const ability = classDef?.spellcasting?.ability || 'cha';
            const chaMod = getMod(targetChar.stats[ability]);
            if (!targetChar.tempHp || chaMod > targetChar.tempHp) {
              targetChar.tempHp = chaMod;
            }
            applyCondition(targetChar, {
              id: 'heroism',
              source: 'heroism',
              duration: 1,
              durationUnit: 'minute',
              saveEnd: undefined,
              saveDC: 0,
            });
          }
        }
      }

      const dotSpells = ['moonbeam', 'flaming-sphere', 'spirit-guardians', 'cloudkill', 'wall-of-fire'];
      if (dotSpells.includes(spellId.toLowerCase()) && targets.length > 0 && state.combat) {
        if (!state.combat.activeDoTs) state.combat.activeDoTs = [];
        for (const targetId of targets) {
          state.combat.activeDoTs = state.combat.activeDoTs.filter(dot =>
            !(dot.spellId === spellId.toLowerCase() && dot.casterId === characterId && dot.targetIds.includes(targetId))
          );
          state.combat.activeDoTs.push({
            id: `dot-${Date.now()}-${generateId(6)}`,
            spellId: spellId.toLowerCase(),
            casterId: characterId,
            targetIds: [targetId],
            damageFormula: getDotDamageFormula(spellId.toLowerCase(), slotLevel),
            damageType: getDotDamageType(spellId.toLowerCase()),
            addsAbilityMod: getDotAddsAbilityMod(spellId.toLowerCase()),
            saveStat: getDotSaveStat(spellId.toLowerCase()),
            saveDC: getSpellSaveDc(char),
            remainingRounds: null,
            slotLevel,
          });
        }
      }

      if (reaction) {
        char.reactionAvailable = false;
        char.reactionUsedThisTurn = true;
        if (spellId.toLowerCase() === 'shield') {
          applyAcBuff(char, 'shield', 5, 1, 'round');
        }
      }

      let dmgSummary = '';
      if (result.perBeam && result.perBeam.length > 1) {
        dmgSummary = ' ' + result.perBeam.map((b: { attackRoll: { total: number }; isHit: boolean; damage: unknown }, i: number) =>
          `Ray ${i+1}: ${b.attackRoll.total} to hit, ${b.isHit ? `${b.damage} ${result.damage?.type || ''} damage` : 'miss'}`
        ).join('. ') + '.';
      } else if (result.narrationHint) {
        dmgSummary = ` ${result.narrationHint}`;
      } else if (result.damage && result.damage.total > 0) {
        dmgSummary = ` ${result.damage.total} ${result.damage.type} damage dealt.`;
      }
      const healSummary = result.healing ? ` ${result.healing} HP healed.` : '';

      let condSummary = '';
      const appliedConditions = (result as unknown as { appliedConditions?: unknown[] }).appliedConditions;
      if (appliedConditions && appliedConditions.length > 0) {
        condSummary = ' ' + appliedConditions.map((c: { targetName: string; conditionId: string }) =>
          `${c.targetName} is now ${c.conditionId}.`
        ).join(' ');
      }

      const affectedTargets = result.affectedTargets;
      if (affectedTargets && affectedTargets.length > 0 && spellDef?.hpPoolCondition) {
        const conditionId = spellDef.hpPoolCondition;
        const conditionDuration = spellDef.condition?.duration ?? 10;
        const affectedNames: string[] = [];

        for (const t of affectedTargets) {
          const entity = deps.getTarget(t.targetId)
            || state.combat?.enemies.find(e => e.id === t.targetId);
          if (entity) {
            affectedNames.push(entity.name || t.targetId);
            const hpPoolParsed = spellDef.parsedDuration ?? parseDuration(spellDef.duration);
            const hpPoolDurationUnit: 'round' | 'minute' | undefined =
              hpPoolParsed?.unit === 'round' ? 'round' : hpPoolParsed?.unit === 'minute' ? 'minute' : undefined;
            applyCondition(entity, {
              id: conditionId,
              source: spellId,
              duration: conditionDuration,
              durationUnit: hpPoolDurationUnit,
              saveEnd: undefined,
              saveDC: 0,
            });
          } else {
            affectedNames.push(t.targetId);
          }
        }
        condSummary = ` ${affectedNames.join(', ')} ${affectedNames.length === 1 ? 'falls' : 'fall'} ${conditionId}.`;
      }

      return { success: true, data: { ...result, casterName: char.name }, message: `Spell cast.${dmgSummary}${healSummary}${condSummary}` };
    },

    async resolve_dot_damage(spellId, targetId, casterId) {
      const spell = SPELLS_BY_ID[spellId.toLowerCase()];
      if (!spell) return fail('Unknown spell.');

      const target = deps.getTarget(targetId) ||
        state.combat?.enemies.find(e => e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase());
      if (!target) return fail('Target not found.');

      const caster = casterId ? deps.getTarget(casterId) : state.party[0];
      if (!caster) return fail('Caster not found.');

      const classDef = getClassDef(caster.class);
      const ability = classDef?.spellcasting?.ability || 'int';
      const abilityMod = getMod(caster.stats[ability]);

      let damage = 0;
      let damageType = '';

      switch (spellId.toLowerCase()) {
        case 'moonbeam':
          damage = rollDice(2, 10) + abilityMod;
          damageType = 'radiant';
          break;
        case 'flaming-sphere':
          damage = rollDice(2, 6) + abilityMod;
          damageType = 'fire';
          break;
        case 'spirit-guardians':
          damage = rollDice(3, 8) + abilityMod;
          damageType = 'radiant';
          break;
        case 'cloudkill':
          damage = rollDice(5, 8);
          damageType = 'poison';
          break;
        case 'wall-of-fire':
          damage = rollDice(5, 8) + abilityMod;
          damageType = 'fire';
          break;
        default:
          return fail(`No DoT damage defined for ${spell.name}.`);
      }

      await deps.inflict_damage(damage, targetId, damageType);

      return {
        success: true,
        data: { spell: spell.name, damage, damageType, target: 'name' in target ? target.name : targetId },
        message: `${target && 'name' in target ? target.name : targetId} takes ${damage} ${damageType} damage from ${spell.name}.`
      };
    },

    async cast_ritual(characterId, spellId) {
      const char = deps.getTarget(characterId);
      if (!char) return fail('Character not found.');

      const spell = SPELLS_BY_ID[spellId.toLowerCase()];
      if (!spell) return fail('Unknown spell.');

      if (!spell.ritual) {
        return fail(`${spell.name} cannot be cast as a ritual.`);
      }

      const result = engineCastSpell(char, spellId, spell.level as 0|1|2|3|4|5|6|7|8|9, []);

      state.sessionLogs.push(`${char.name} casts ${spell.name} as a ritual.`);

      return {
        success: true,
        data: { ...result, ritual: true },
        message: `${char.name} casts ${spell.name} as a ritual (10 minutes, no slot consumed).`
      };
    },

    async spell_effect(mode, casterId, targetSpellLevel, targetId) {
      const caster = deps.getTarget(casterId);
      if (!caster) return fail('Caster not found.');
      if (!getClassDef(caster.class)?.spellcasting) return fail(`${caster.name} cannot cast spells.`);

      const pastVerb = mode === 'counter' ? 'counters' : 'dispels';
      const baseVerb = mode === 'counter' ? 'counter' : 'dispel';
      const autoSuccess = targetSpellLevel <= 3;

      let succeeded: boolean;
      let rollData: { autoSuccess?: true; roll?: number; total?: number; dc?: number } = {};
      if (autoSuccess) {
        succeeded = true;
        rollData = { autoSuccess: true };
      } else {
        const check = abilityCheckForSpell(caster, targetSpellLevel) as { roll: number; total: number; dc: number; success: boolean };
        succeeded = check.success;
        rollData = { roll: check.roll, total: check.total, dc: check.dc };
      }

      const removed: string[] = [];
      let removedSummary = '';
      if (succeeded && mode === 'dispel' && targetId) {
        const playerTarget = deps.getTarget(targetId);
        const enemyTarget = !playerTarget
          ? state.combat?.enemies.find(e => e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase())
          : undefined;
        const target = playerTarget ?? enemyTarget;
        if (target) {
          for (const cond of [...(target.conditions ?? [])]) {
            if (cond.source && SPELLS_BY_ID[cond.source]) {
              removeCondition(target, cond.id, cond.source);
              removed.push(cond.id);
            }
          }
          if (playerTarget && playerTarget.concentrationSpellId) {
            breakConcentrationWithCleanup(playerTarget);
            removed.push('concentration');
          }
          if (state.combat?.activeDoTs) {
            state.combat.activeDoTs = state.combat.activeDoTs.filter(dot => !dot.targetIds.includes(targetId));
          }
          removedSummary = removed.length
            ? ` Removed: ${removed.join(', ')}.`
            : ' No spell effects found to dispel.';
        }
      }

      const baseMsg = autoSuccess
        ? `${caster.name} ${pastVerb} the level ${targetSpellLevel} spell automatically!`
        : succeeded
          ? `${caster.name} ${pastVerb} the spell! (Rolled ${rollData.total} vs DC ${rollData.dc})`
          : `${caster.name} fails to ${baseVerb} the spell. (Rolled ${rollData.total} vs DC ${rollData.dc})`;

      return {
        success: true,
        data: { mode, targetSpellLevel, success: succeeded, ...rollData, removed },
        message: `${baseMsg}${removedSummary}`
      };
    },

    async manage_spellbook(characterId, action, spellId) {
      const char = deps.getTarget(characterId);
      if (!char) return fail('Character not found.');
      const spell = SPELLS_BY_ID[spellId.toLowerCase()];
      if (!spell) return fail('Unknown spell.');
      if (action === 'learn') {
        const ok = engineLearnSpell(char, spellId);
        if (!ok) {
          const check = canLearnSpell(char, spellId);
          return fail(check.reason || 'Cannot learn spell.');
        }
        return { success: true, data: { spell: spell.name }, message: `${char.name} learned ${spell.name}.` };
      } else if (action === 'prepare') {
        const result = enginePrepareSpell(char, spellId);
        if (!result.ok) return fail(result.reason || 'Cannot prepare spell.');
        return { success: true, data: { spell: spell.name }, message: `${spell.name} prepared.` };
      } else if (action === 'unprepare' || action === 'forget') {
        if (action === 'unprepare') {
          engineUnprepareSpell(char, spellId);
        } else {
          const idx = char.knownSpells.indexOf(spell.id);
          if (idx === -1) return fail(`${spell.name} is not known by ${char.name}.`);
          char.knownSpells.splice(idx, 1);
        }
        return { success: true, data: {}, message: `${spell.name} removed.` };
      }
      return fail('Unknown action.');
    },

    async use_resource(characterId, resourceId, targetId, amount) {
      const char = deps.getTarget(characterId);
      if (!char) return fail('Character not found.');
      const ok = classEngineSpendResource(char, resourceId, amount ?? 1);
      if (!ok) return fail(`Insufficient ${resourceId} remaining.`);
      if (resourceId === 'second-wind') {
        const heal = cryptoRoll(10) + char.level;
        char.hp.current = Math.min(char.hp.max, char.hp.current + heal);
        return { success: true, data: { healed: heal }, message: `Second Wind restored ${heal} HP.` };
      }
      if (resourceId === 'rage') {
        breakConcentrationWithCleanup(char);
        char.raging = true;
        const rageBonus = char.level >= 16 ? 4 : char.level >= 9 ? 3 : 2;
        return { success: true, data: { raging: true, rageBonus }, message: `Entered rage. +${rageBonus} melee damage, resistance to B/P/S, advantage on STR checks/saves. While raging you can't cast or concentrate on spells.` };
      }
      if (resourceId === 'lay-on-hands-pool' && targetId && amount) {
        const target = deps.getTarget(targetId);
        if (target) {
          const healed = Math.min(amount, char.hp.max - char.hp.current);
          target.hp.current = Math.min(target.hp.max, target.hp.current + healed);
          return { success: true, data: { healed }, message: `Lay on Hands healed ${healed} HP for ${target.name}.` };
        }
      }
      if (resourceId === 'breath-weapon') {
        const conMod = getMod(char.stats.con);
        const profBonus = getProficiencyBonus(char as unknown as Character);
        const dc = 8 + conMod + profBonus;
        const dmgDice = char.level >= 16 ? '5d6' : char.level >= 11 ? '4d6' : char.level >= 6 ? '3d6' : '2d6';
        const parsed = parseDiceFormula(dmgDice);
        const damage = rollDice(parsed.count, parsed.sides);
        const ancestryDmgTypes: Record<string, string> = { black: 'acid', blue: 'lightning', brass: 'fire', bronze: 'lightning', copper: 'acid', gold: 'fire', green: 'poison', red: 'fire', silver: 'cold', white: 'cold' };
        const dmgType = ancestryDmgTypes[char.draconicAncestry || 'red'] || 'fire';
        char.draconicDamageType = dmgType;
        return { success: true, data: { saveDC: dc, damage: { total: damage, type: dmgType } }, message: `Breath weapon used. DEX save DC ${dc}, ${dmgDice} ${dmgType} damage on fail, half on success.` };
      }
      return { success: true, data: {}, message: `Used ${resourceId}.` };
    },
  };
}
