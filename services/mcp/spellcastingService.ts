import { Character, GameState, MCPResponse } from '../../types';
import { cryptoRoll } from '../../utils/random';
import { fail, fuzzyMatchEntity, generateId } from './_shared';
import { getMod, getProficiencyBonus, getClassDef, getSpellSaveDc, spendResource as classEngineSpendResource } from '../classEngine';
import { castSpell as engineCastSpell, learnSpell as engineLearnSpell, prepareSpell as enginePrepareSpell, unprepareSpell as engineUnprepareSpell, canLearnSpell, breakConcentration as engineBreakConcentration, getMaxPactSlotLevel } from '../spellcastingEngine';
import { SPELLS_BY_ID, parseDuration } from '../../utils/spells';
import { rollDice } from '../diceEngine';
import { parseDiceFormula } from '../../utils/dice';
import { applyCondition, removeCondition, getConditionEffects, getExhaustionPenalty } from '../conditionEngine';
import { RESOURCE_HANDLERS } from '../resourceHandlers';
import { getEffects } from '../effectDispatcher';
import { getAtWillInvocationSpells } from '../../data/invocations';

/** Dependencies required by the SpellcastingService. */
export interface SpellcastingDeps {
  getTarget: (id?: string) => Character | undefined;
  inflict_damage: (amount: number, targetId?: string, damageType?: string, options?: { skipTargetDerivedReductions?: boolean }) => Promise<MCPResponse>;
  make_save: (targetId: string, stat: string, dc: number, spellContext?: { isMagical?: boolean; isCharm?: boolean }) => Promise<MCPResponse>;
  syncInitiativeConditions: () => void;
}

/** Service interface for spell casting, ritual casting, spellbook management, and resource usage. */
export interface SpellcastingService {
  cast_spell(characterId: string, spellId: string, slotLevel?: number, targets?: string[], targetSaveResults?: Record<string, boolean>, reaction?: boolean, metamagic?: { option?: string }): Promise<MCPResponse>;
  resolve_dot_damage(spellId: string, targetId: string, casterId?: string): Promise<MCPResponse>;
  cast_ritual(characterId: string, spellId: string): Promise<MCPResponse>;
  spell_effect(mode: 'counter' | 'dispel', casterId: string, targetSpellLevel: number, targetId?: string): Promise<MCPResponse>;
  manage_spellbook(characterId: string, action: 'learn' | 'prepare' | 'unprepare' | 'forget' | 'finish_prep', spellId: string): Promise<MCPResponse>;

  /** Tasha's-style swap: known caster replaces one known spell with another.
   *  Atomic. Requires `character.pendingSpellSwap === true`; consumes it on success. */
  swap_known_spell(characterId: string, oldSpellId: string, newSpellId: string): Promise<MCPResponse>;
  use_resource(characterId: string, resourceId: string, targetId?: string, amount?: number): Promise<MCPResponse>;
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
    async cast_spell(characterId, spellId, slotLevel = 0, targets = [], targetSaveResults, reaction, metamagic) {
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

      if (metamagic && metamagic.option) {
        const opt = metamagic.option;
        if (!char.metamagicOptions?.length) {
          if (result.success) {
            return { success: false, data: result, message: `${char.name} does not have metamagic options (requires Sorcerer L3+).` };
          }
        }
        const pointCosts: Record<string, number> = {
          twinned: (spellDef?.level || 1) >= 1 ? (spellDef?.level || 1) : 1,
          heightened: 3,
          quickened: 2,
          subtle: 1,
          empowered: 1,
          careful: 1,
          distant: 1,
          extended: 1,
        };
        const pointCost = pointCosts[opt] || 1;

        const ptsSpent = classEngineSpendResource(char, 'sorcery-points', pointCost);
        if (!ptsSpent) {
          return fail(`Insufficient sorcery points for ${opt} spell (needs ${pointCost}).`);
        }

        if (opt === 'twinned' && targets.length === 1) {
          targets = [...targets, targets[0]];
        }
        if (opt === 'heightened' && targets.length > 0 && state.combat?.isActive) {
          const affected = targets[0];
          state.sessionLogs.push(`${char.name} uses Heightened Spell — ${affected} has disadvantage on the save.`);
        }
        if (opt === 'empowered' && result.damage?.perTarget) {
          const chaMod = getMod(char.stats.cha);
          let rerolled = 0;
          for (const t of result.damage.perTarget) {
            if (rerolled >= chaMod) break;
            t.damage = rollDice(parseDiceFormula(spellDef?.damage || '1d6').count, parseDiceFormula(spellDef?.damage || '1d6').sides);
            rerolled++;
          }
          if (result.damage.perTarget.length > 0) {
            result.damage.total = result.damage.perTarget.reduce((sum, t) => sum + t.damage, 0);
          }
        }
        // subtle, careful, distant, extended: narrative only (engine records the choice)
        result.message = (result.message || '') + ` [Metamagic: ${opt}]`;
      }
      // ---- end metamagic ----

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

      // Per-target damage ledger populated as damage is applied (after saves). The
      // engine's result.damage.total for save spells is a pre-save Σ-perTarget and
      // cannot be reported as "dealt"; this captures the actually-dealt amount per
      // target so dmgSummary is accurate.
      const damageBreakdown: Array<{ name: string; rolled: number; dealt: number; savePassed?: boolean }> = [];
      const nameOfTarget = (id: string): string => {
        const c = deps.getTarget(id);
        if (c) return c.name;
        const e = state.combat?.enemies?.find(en => en.id === id || en.name.toLowerCase() === id.toLowerCase().trim());
        return e?.name || id;
      };

      if (result.damage?.perTarget?.length && spellDef?.save) {
        const saveDC = result.saveRoll?.dc ?? getSpellSaveDc(char);
        const saveStat = spellDef.save.stat;
        const onSuccess = spellDef.save.onSuccess;
        const isCharmSpell = spellDef.condition?.type === 'charmed';

        for (const t of result.damage.perTarget) {
          let dmg = t.damage;
          const llmOverride = targetSaveResults?.[t.targetId];
          // SRD: a save is always rolled for save-spells. onSuccess 'half' halves
          // damage on a success; 'none' negates it entirely (0 damage on success).
          const savePassed = llmOverride !== undefined
            ? llmOverride === true
            : (await deps.make_save(t.targetId, saveStat, saveDC, { isMagical: true, isCharm: isCharmSpell })).data?.success === true;
          // Evasion (Rogue L7 / Monk L7): on a successful DEX save, take 0 damage
          // instead of half; on a failed DEX save, take half instead of full.
          const targetChar = deps.getTarget(t.targetId);
          const hasEvasion = targetChar && getEffects(targetChar, 'evasion').length > 0;
          const isDexSave = saveStat.toLowerCase() === 'dex';
          if (hasEvasion && isDexSave) {
            if (savePassed) {
              dmg = 0;
            } else {
              dmg = Math.floor(dmg / 2);
            }
          } else if (savePassed) {
            dmg = onSuccess === 'half' ? Math.floor(dmg / 2) : 0;
          }
          const resolvedTargetId = resolvedTargets.find(rt => {
            const cleanId = t.targetId.toLowerCase().trim();
            return rt === t.targetId || rt.toLowerCase() === cleanId;
          }) || t.targetId;
          damageBreakdown.push({ name: nameOfTarget(resolvedTargetId), rolled: t.damage, dealt: dmg, savePassed });
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
          damageBreakdown.push({ name: nameOfTarget(resolvedTargetId), rolled: t.damage, dealt: dmg });
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
        // Temp-HP spells (e.g. False Life, Armor of Agathys) grant only temporary
        // hit points — they must NOT also heal real HP.
        const isTempHpSpell = !!(spellDef?.description?.toLowerCase().includes('temporary hit points') || spellDef?.description?.toLowerCase().includes('temp hp'));
        // Disciple of Life (Life Domain Cleric L1): healing spells restore an extra
        // 2 + spell level HP. Applied per target (matches SRD multi-target healing).
        const discipleBonus = getEffects(char, 'healing-bonus').length > 0 ? 2 + slotLevel : 0;
        for (const targetId of targets) {
          const target = deps.getTarget(targetId);
          if (target) {
            if (isTempHpSpell) {
              if (!target.tempHp || result.healing > target.tempHp) {
                target.tempHp = result.healing;
              }
            } else {
              const previousHp = target.hp.current;
              target.hp.current = Math.min(target.hp.max, target.hp.current + result.healing + discipleBonus);
              if (previousHp === 0 && target.hp.current > 0) {
                delete target.deathSaves;
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

        const hasOnCastSave = !!spellDef.save;
        const saveStat = spellDef.save?.stat;
        const resolvedSaveDC = result.saveRoll?.dc ?? getSpellSaveDc(char);
        const isCharmCondition = spellDef.condition.type === 'charmed';

        for (const targetId of targets) {
          const targetChar = deps.getTarget(targetId);
          const enemy = state.combat?.enemies.find(e => e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase());
          const targetObj = targetChar || enemy;
          if (!targetObj) continue;

          if (!spellDef.condition) continue;
          const condDef = spellDef.condition;

          // SRD: when the spell defines a save, targets roll it on cast and are
          // unaffected on a success. (No spell in the catalog has both damage and
          // a condition, so this never double-rolls with the damage branch.) Honor
          // an LLM override if provided.
          if (hasOnCastSave && saveStat) {
            const llmOverride = targetSaveResults?.[targetId];
            const savePassed = llmOverride !== undefined
              ? llmOverride === true
              : (await deps.make_save(targetId, saveStat, resolvedSaveDC, { isMagical: true, isCharm: isCharmCondition })).data?.success === true;
            if (savePassed) continue;
          }

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
      } else if (damageBreakdown.length > 0) {
        // Per-target breakdown using actually-dealt (post-save) damage. Replaces the
        // old single-number report that showed a misleading pre-save Σ-perTarget.
        const dmgType = result.damage?.type || 'damage';
        const totalDealt = damageBreakdown.reduce((s, d) => s + d.dealt, 0);
        const parts = damageBreakdown.map(d => `${d.name} ${d.dealt} ${dmgType}${d.savePassed === true ? ' (saved)' : ''}`);
        const dcPrefix = result.saveRoll ? `DC ${result.saveRoll.dc} ${result.saveRoll.stat.toUpperCase()} save. ` : '';
        dmgSummary = ` ${dcPrefix}${parts.join(', ')}. (${totalDealt} ${dmgType} total)`;
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
            // Fey Ancestry (elf/half-elf): magic can't put them to sleep. The Sleep
            // spell's hpPoolCondition is the generic 'unconscious' (wired into the
            // effects system), so we skip Fey Ancestry targets here rather than via
            // a broad 'unconscious' immunity (which would wrongly block 0-HP knocks).
            const hasFeyAncestry = 'racialTraits' in entity && (((entity as Character).racialTraits) || []).includes('fey-ancestry');
            if (spellDef.id === 'sleep' && hasFeyAncestry) {
              affectedNames.push(`${entity.name || t.targetId} (unaffected — Fey Ancestry)`);
              continue;
            }
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

      const isWizardSpellbookRitual = char.class === 'wizard' && (char.knownSpells ?? []).includes(spell.id) && !char.preparedSpells?.includes(spell.id);
      if (isWizardSpellbookRitual) {
        char.preparedSpells ??= [];
        char.preparedSpells.push(spell.id);
      }

      const result = engineCastSpell(char, spellId, spell.level as 0|1|2|3|4|5|6|7|8|9, [], undefined, { isRitual: true });

      if (isWizardSpellbookRitual) {
        const idx = char.preparedSpells?.indexOf(spell.id) ?? -1;
        if (idx > -1) char.preparedSpells?.splice(idx, 1);
      }

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
      if (action === 'finish_prep') {
        char.longRestPrepAvailable = false;
        char.shortRestSpellSwapAvailable = false;
        char.cantripSwapAvailable = false;
        return { success: true, data: {}, message: `${char.name} finished preparing spells and cantrips.` };
      }

      const spell = SPELLS_BY_ID[spellId.toLowerCase()];
      if (!spell) return fail('Unknown spell.');

      if (action === 'learn') {
        const ok = engineLearnSpell(char, spellId);
        if (!ok) {
          const check = canLearnSpell(char, spellId);
          return fail(check.reason || 'Cannot learn spell.');
        }
        return { success: true, data: { spell: spell.name }, message: `${char.name} learned ${spell.name}.` };
      } else if (action === 'prepare' || action === 'unprepare') {
        const classDef = getClassDef(char.class);
        if (classDef?.spellcasting?.prepMode === 'prepared') {
          const hasLongRestPrep = char.longRestPrepAvailable ?? true;
          const hasShortRestSwap = char.shortRestSpellSwapAvailable ?? false;

          if (!hasLongRestPrep && !hasShortRestSwap) {
            return fail(`Modifying prepared spells requires a Long Rest (to re-prepare spells) or a Short Rest (2024 SRD: to swap 1 spell). Take a rest first.`);
          }

          if (action === 'prepare') {
            const result = enginePrepareSpell(char, spellId);
            if (!result.ok) return fail(result.reason || 'Cannot prepare spell.');
            if (!hasLongRestPrep && hasShortRestSwap) {
              char.shortRestSpellSwapAvailable = false;
            }
            return { success: true, data: { spell: spell.name }, message: `${spell.name} prepared.` };
          } else {
            engineUnprepareSpell(char, spellId);
            return { success: true, data: {}, message: `${spell.name} unprepared.` };
          }
        } else {
          return fail(`${classDef?.name || 'This class'} does not prepare spells.`);
        }
      } else if (action === 'forget') {
        const idx = char.knownSpells.indexOf(spell.id);
        if (idx === -1) return fail(`${spell.name} is not known by ${char.name}.`);
        // At-will invocation spells are tied to their invocation and cannot be
        // forgotten via the spellbook (remove the invocation instead).
        if (getAtWillInvocationSpells(char.invocations).includes(spell.id)) {
          return fail(`${spell.name} is granted by an Eldritch Invocation and cannot be forgotten.`);
        }
        char.knownSpells.splice(idx, 1);
        return { success: true, data: {}, message: `${spell.name} removed.` };
      }

      return fail('Unknown action.');
    },

    async swap_known_spell(characterId, oldSpellId, newSpellId) {
      const char = deps.getTarget(characterId);
      if (!char) return fail('Character not found.');
      const classDef = getClassDef(char.class);
      if (!classDef?.spellcasting) {
        return fail(`${classDef?.name || 'This class'} cannot cast spells.`);
      }
      const oldSpell = SPELLS_BY_ID[oldSpellId.toLowerCase()];
      const newSpell = SPELLS_BY_ID[newSpellId.toLowerCase()];
      if (!oldSpell || !newSpell) return fail('Unknown spell.');
      const oldIdx = char.knownSpells.indexOf(oldSpell.id);
      if (oldIdx === -1) return fail(`${oldSpell.name} is not known by ${char.name}.`);
      // At-will invocation spells cannot be swapped away (would orphan the invocation).
      if (getAtWillInvocationSpells(char.invocations).includes(oldSpell.id)) {
        return fail(`${oldSpell.name} is granted by an Eldritch Invocation and cannot be swapped.`);
      }
      // Like-for-like: both cantrips or both leveled (checked before flag validation).
      const oldIsCantrip = oldSpell.level === 0;
      const newIsCantrip = newSpell.level === 0;
      if (oldIsCantrip !== newIsCantrip) {
        return fail(`Cannot swap ${oldSpell.name} for ${newSpell.name}: one is a cantrip and the other is not. Swap like-for-like.`);
      }
      // Validate the appropriate flag based on swap type.
      if (oldIsCantrip) {
        // 2024 rule: any caster can replace one cantrip per long rest.
        if (!char.cantripSwapAvailable) {
          return fail(`${char.name} has no cantrip swap available. One is granted per long rest.`);
        }
      } else {
        // Tasha's: known casters only, granted on level-up.
        if (classDef.spellcasting.prepMode !== 'known') {
          return fail(`${classDef.name} cannot swap leveled spells (only known casters can).`);
        }
        if (!char.pendingSpellSwap) {
          return fail(`${char.name} has no pending spell swap. Swaps are granted on level-up.`);
        }
      }
      // Splice old first so the known-spell/cantrip cap passes for the new one.
      char.knownSpells.splice(oldIdx, 1);
      const ok = engineLearnSpell(char, newSpell.id);
      if (!ok) {
        // Rollback: re-insert old spell at its original index.
        char.knownSpells.splice(oldIdx, 0, oldSpell.id);
        const check = canLearnSpell(char, newSpell.id);
        return fail(check.reason || `Cannot learn ${newSpell.name}.`);
      }
      // Consume the appropriate flag.
      if (oldIsCantrip) {
        char.cantripSwapAvailable = false;
      } else {
        char.pendingSpellSwap = false;
      }
      return {
        success: true,
        data: { oldSpell: oldSpell.name, newSpell: newSpell.name },
        message: `${char.name} forgot ${oldSpell.name} and learned ${newSpell.name}.`,
      };
    },

    async use_resource(characterId, resourceId, targetId, amount) {
      const char = deps.getTarget(characterId);
      if (!char) return fail('Character not found.');

      // Info-only resources: the handler returns capacity/hint info without
      // spending the charge. The actual consumption happens through the
      // dedicated modal/tool paths (arcane_recovery / natural_recovery).
      const INFO_ONLY_RESOURCES = new Set(['arcane-recovery', 'natural-recovery']);
      if (!INFO_ONLY_RESOURCES.has(resourceId)) {
        const ok = classEngineSpendResource(char, resourceId, amount ?? 1);
        if (!ok) return fail(`Insufficient ${resourceId} remaining.`);
      }

      const handler = RESOURCE_HANDLERS[resourceId];
      if (handler) {
        return handler({ state, deps }, characterId, targetId, amount);
      }
      return { success: true, data: {}, message: `Used ${resourceId}.` };
    },
  };
}
