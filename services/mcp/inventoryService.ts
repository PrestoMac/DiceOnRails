import { Character, Currency, GameState, MCPResponse, InventoryItem } from '../../types';
import { fail, fuzzyMatchEntity, ErrorCodes } from './_shared';
import { isDebugMode } from '../../utils/debug';
import { getHeavyArmorMasterReduction } from '../featsService';
import { breakConcentration as engineBreakConcentration } from '../spellcastingEngine';
import { awardEnemyDefeatXp } from './progressionService';
import { markTokenDead } from '../gridService';

function parseCost(srdCost: string): { gp: number; sp: number; cp: number } | null {
  if (!srdCost) return null;
  const clean = srdCost.toLowerCase().trim();
  let gp = 0, sp = 0, cp = 0;
  const gpMatch = clean.match(/(\d+)\s*gp/);
  const spMatch = clean.match(/(\d+)\s*sp/);
  const cpMatch = clean.match(/(\d+)\s*cp/);
  if (gpMatch) gp = parseInt(gpMatch[1], 10);
  if (spMatch) sp = parseInt(spMatch[1], 10);
  if (cpMatch) cp = parseInt(cpMatch[1], 10);
  if (!gpMatch && !spMatch && !cpMatch) return null;
  return { gp, sp, cp };
}

function normalizeCurrency(totalCp: number): Currency {
  const safeTotal = Math.max(0, totalCp);
  const gp = Math.floor(safeTotal / 100);
  const remainderAfterGp = safeTotal % 100;
  const sp = Math.floor(remainderAfterGp / 10);
  const cp = remainderAfterGp % 10;
  return { gp, sp, cp };
}

const RECIPES: Record<string, { result: string; resultType: 'weapon' | 'armor' | 'potion' | 'gear'; requiredTools: string[]; ingredients: Array<{ item: string; quantity: number }>; craftTime: number; dc?: number; description: string; }> = {
  'potion of healing': { result: 'Potion of Healing', resultType: 'potion', requiredTools: ['herbalism kit'], ingredients: [{ item: 'herbs', quantity: 2 }], craftTime: 60, description: 'Brews a Potion of Healing (restores 2d4+2 HP).' },
  'alchemists-fire': { result: "Alchemist's Fire", resultType: 'gear', requiredTools: ['alchemists-supplies'], ingredients: [{ item: 'sulfur', quantity: 1 }, { item: 'oil', quantity: 1 }], craftTime: 30, description: 'Crafts a flask of Alchemist\'s Fire.' }
};

function getRecipe(name: string): Record<string, unknown> | undefined { return RECIPES[name.toLowerCase()]; }

/** Dependencies required by the InventoryService. */
export interface InventoryDeps {
  getTarget: (id?: string) => Character | undefined;
  supabase: { from: (table: string) => { select: (...args: string[]) => { ilike: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } } } };
  lookupSRDItem: (name: string) => Record<string, unknown> | undefined;
  initializeDeathSaves: (character: Character) => void;
  updateInitiativeDeathStatus: (id: string, isDead: boolean) => void;
}

/** Service interface for managing inventory, currency, and damage. */
export interface InventoryService {
  updateInventoryDirectly(newInventory: InventoryItem[], targetId?: string): void;
  updateCurrencyDirectly(newCurrency: Currency, targetId?: string): void;
  normalizeCurrency(totalCp: number): Currency;
  lookupItemInDB(cleanName: string): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  update_inventory(item_name: string, action: 'add' | 'remove' | 'edit', quantity?: number, new_name?: string, targetId?: string, type?: 'weapon' | 'armor' | 'potion' | 'shield' | 'gear' | 'other', rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary', description?: string, stats?: InventoryItem['stats'], equipped?: boolean, cost_gp?: number, cost_sp?: number, cost_cp?: number, autoDeductMarketPrice?: boolean, craft?: boolean): Promise<MCPResponse>;
  adjust_currency(gp?: number, sp?: number, cp?: number, targetId?: string): Promise<MCPResponse>;
  inflict_damage(amount: number, targetId?: string, damageType?: string, options?: { skipTargetDerivedReductions?: boolean }): Promise<MCPResponse>;
  parseCost(srdCost: string): { gp: number; sp: number; cp: number } | null;
  clearCurrencyAdjustment(): void;
  getLastCurrencyAdjustment(): { targetId: string; amount: number; timestamp: number } | null;
}

/** Creates a new InventoryService instance operating on the given GameState. */
export function createInventoryService(state: GameState, deps: InventoryDeps): InventoryService {
  let lastCurrencyAdjustment: { targetId: string; amount: number; timestamp: number } | null = null;

  function _now(): number {
    return Date.now();
  }

  return {
    updateInventoryDirectly(newInventory, targetId) {
      const target = deps.getTarget(targetId);
      if (target) {
        target.inventory = newInventory;
      }
    },

    updateCurrencyDirectly(newCurrency, targetId) {
      const target = deps.getTarget(targetId);
      if (target) {
        const totalCp = (newCurrency.gp * 100) + (newCurrency.sp * 10) + newCurrency.cp;
        target.currency = normalizeCurrency(totalCp);
      }
    },

    normalizeCurrency,
    parseCost,

    async lookupItemInDB(cleanName) {
      return deps.supabase
        .from('srd_items')
        .select('*')
        .ilike('name', cleanName)
        .maybeSingle();
    },

    async adjust_currency(gp = 0, sp = 0, cp = 0, targetId) {
      const target = deps.getTarget(targetId);
      if (!target) return fail("Target character not found for currency adjustment.");

      const safeGp = Number(gp) || 0;
      const safeSp = Number(sp) || 0;
      const safeCp = Number(cp) || 0;

      const now = _now();
      const totalAdjustment = safeGp * 100 + safeSp * 10 + safeCp;
      if (lastCurrencyAdjustment &&
        lastCurrencyAdjustment.targetId === target.id &&
        lastCurrencyAdjustment.amount === totalAdjustment &&
        (now - lastCurrencyAdjustment.timestamp) < 500) {
        return { success: false, data: { currency: target.currency }, message: "Duplicate currency adjustment detected. Ignored." };
      }
      lastCurrencyAdjustment = { targetId: target.id, amount: totalAdjustment, timestamp: now };

      const curr = target.currency;
      const currentTotalCp = (curr.gp * 100) + (curr.sp * 10) + curr.cp;
      const newTotalCp = currentTotalCp + totalAdjustment;

      if (newTotalCp < 0) {
        return {
          success: false,
          data: { currency: curr },
          message: `Insufficient funds. ${target.name} has only ${currentTotalCp} CP equivalent.`
        };
      }

      target.currency = normalizeCurrency(newTotalCp);

      return {
        success: true,
        data: { currency: target.currency, character: target.name },
        message: `Currency adjusted for ${target.name}. New balance: ${target.currency.gp} GP, ${target.currency.sp} SP, ${target.currency.cp} CP.`
      };
    },

    async inflict_damage(amount, targetId, damageType, options) {
      const safeAmount = Math.max(0, Number(amount) || 0);

      if ((state.combat?.enemies?.length ?? 0) > 0) {
        const enemy = state.combat.enemies.find(e => fuzzyMatchEntity(e, targetId || ''));
        if (enemy && enemy.isDead) {
          return fail(`${enemy.name} is already defeated.`);
        }
        if (enemy && !enemy.isDead) {
          let dmg = safeAmount;
          if (damageType && !options?.skipTargetDerivedReductions) {
            if (enemy.damageImmunities?.some(d => d.toLowerCase().includes(damageType.toLowerCase()))) {
              dmg = 0;
            } else if (enemy.damageResistances?.some(d => d.toLowerCase().includes(damageType.toLowerCase()))) {
              dmg = Math.floor(dmg / 2);
            } else if (enemy.damageVulnerabilities?.some(d => d.toLowerCase().includes(damageType.toLowerCase()))) {
              dmg *= 2;
            }
          }
          const oldHp = enemy.hp.current;
          const newHp = Math.max(0, oldHp - dmg);
          enemy.hp.current = newHp;

          if (newHp === 0) {
            enemy.isDead = true;
            deps.updateInitiativeDeathStatus(enemy.id, true);
            if (state.battleMap) {
              state.battleMap = markTokenDead(state.battleMap, enemy.id);
            }
            const xpLine = awardEnemyDefeatXp(state, enemy);
            const msg = `${enemy.name} took ${dmg} damage${damageType ? ' (' + damageType + ')' : ''}. ${enemy.name} is defeated!${xpLine ? ' ' + xpLine : ''}`;
            state.sessionLogs.push(msg);
            return {
              success: true,
              data: { character: enemy.name, previousHp: oldHp, newHp, damage: dmg, enemyDefeated: true, isEnemy: true, xpAwarded: !!xpLine, xpLine },
              message: msg
            };
          }
          return {
            success: true,
            data: { character: enemy.name, previousHp: oldHp, newHp, damage: dmg, isEnemy: true },
            message: `${enemy.name} took ${dmg} damage${damageType ? ' (' + damageType + ')' : ''}. Current HP: ${newHp}/${enemy.hp.max}`
          };
        }
      }

      const target = deps.getTarget(targetId);
      if (!target) {
        const combatActive = state.combat?.isActive;
        const hasEnemies = (state.combat?.enemies?.length ?? 0) > 0;
        let hint = '';
        if (!combatActive && !hasEnemies) {
          hint = ' No combat is active and no enemies exist. Use add_enemy to register enemies, then start_combat.';
        } else if (!combatActive && hasEnemies) {
          hint = ' Enemies exist but combat has not started. Call start_combat first.';
        } else {
          hint = ' Combat is active but this target was not found. Check the target name matches an enemy or party member exactly.';
        }
        return fail(`Target "${targetId}" not found in party or combat.${hint}`, ErrorCodes.NOT_FOUND);
      }

      let effectiveDmg = safeAmount;
      if (!options?.skipTargetDerivedReductions) {
        const ham = getHeavyArmorMasterReduction(target, damageType);
        effectiveDmg = Math.max(0, safeAmount - ham);
        if (target.tempHp && target.tempHp > 0) {
          const absorbed = Math.min(target.tempHp, effectiveDmg);
          target.tempHp -= absorbed;
          effectiveDmg -= absorbed;
        }
      }
      const current = target.hp.current;
      const newHp = Math.max(0, current - effectiveDmg);
      target.hp.current = newHp;

      if (newHp === 0 && current > 0) {
        deps.initializeDeathSaves(target);
        if (target.concentrationSpellId) engineBreakConcentration(target, 'incapacitated');
      } else if (newHp === 0 && current === 0 && target.deathSaves) {
        target.deathSaves.failures++;
        if (target.deathSaves.failures >= 3) {
          deps.updateInitiativeDeathStatus(target.id, true);
        }
      }
      const displayedDmg = options?.skipTargetDerivedReductions ? safeAmount : effectiveDmg;
      const hamReduction = options?.skipTargetDerivedReductions ? 0 : (safeAmount - effectiveDmg);
      const hamNote = hamReduction > 0 ? ` (Heavy Armor Master reduced by ${hamReduction})` : '';

      const concResult = engineBreakConcentration(target, 'damaged', displayedDmg);
      if (concResult.broken && state.combat?.activeDoTs) {
        state.combat.activeDoTs = state.combat.activeDoTs.filter(
          dot => dot.casterId !== target.id
        );
      }

      let concentrationNote = '';
      let concentrationSave: { roll: number; d20Roll: number; modifier: number; dc: number; success: boolean } | undefined;
      if (concResult.broken && typeof concResult.dc === 'number') {
        concentrationNote = ` — CON Save: ${concResult.roll} (d20: ${concResult.d20Roll} + ${concResult.modifier}) vs DC ${concResult.dc} — Lost concentration!`;
        concentrationSave = { roll: concResult.roll as number, d20Roll: concResult.d20Roll as number, modifier: concResult.modifier as number, dc: concResult.dc, success: concResult.success as boolean };
      } else if (typeof concResult.dc === 'number') {
        concentrationNote = ` — CON Save: ${concResult.roll} (d20: ${concResult.d20Roll} + ${concResult.modifier}) vs DC ${concResult.dc} — Maintained concentration!`;
        concentrationSave = { roll: concResult.roll as number, d20Roll: concResult.d20Roll as number, modifier: concResult.modifier as number, dc: concResult.dc, success: concResult.success as boolean };
      }

      return {
        success: true,
        data: { character: target.name, previousHp: current, newHp, damage: displayedDmg, hamReduction, concentrationSave },
        message: `${target.name} took ${displayedDmg} damage${damageType ? ' (' + damageType + ')' : ''}${hamNote}. Current HP: ${newHp}/${target.hp.max}${target.deathSaves ? ' — DYING!' : ''}${concentrationNote}`
      };
    },

    async update_inventory(
      item_name, action, quantity = 1, new_name, targetId,
      type, rarity, description, stats, equipped,
      cost_gp, cost_sp, cost_cp, autoDeductMarketPrice, craft
    ) {
      const target = deps.getTarget(targetId);
      if (!target) return fail("Target character not found. Inventory update requires a valid target.");

      const cleanName = item_name?.split(/\s+(?:and|or|then|while|to|into)\s+/)[0]?.trim()?.slice(0, 60) || 'unknown item';

      let msg = "";
      const inv = [...target.inventory];

      let actualCostGp = Number(cost_gp || 0);
      let actualCostSp = Number(cost_sp || 0);
      let actualCostCp = Number(cost_cp || 0);

      if (autoDeductMarketPrice) {
        try {
          const srdData = await this.lookupItemInDB(cleanName);
          const srdCost = srdData?.data?.cost;
          if (srdCost) {
            const parsed = parseCost(srdCost);
            if (parsed) { actualCostGp = parsed.gp; actualCostSp = parsed.sp; actualCostCp = parsed.cp; }
          } else {
            const cachedItem = deps.lookupSRDItem(cleanName);
            if (cachedItem?.cost) {
              const parsed = parseCost(cachedItem.cost);
              if (parsed) { actualCostGp = parsed.gp; actualCostSp = parsed.sp; actualCostCp = parsed.cp; }
            }
          }
        } catch (e) {
          if (isDebugMode) console.warn('[DB] SRD item lookup failed:', e);
        }
      }

      if (actualCostGp || actualCostSp || actualCostCp) {
        const deductionGp = action === 'add' ? -Math.abs(actualCostGp) : Math.abs(actualCostGp);
        const deductionSp = action === 'add' ? -Math.abs(actualCostSp) : Math.abs(actualCostSp);
        const deductionCp = action === 'add' ? -Math.abs(actualCostCp) : Math.abs(actualCostCp);
        const currencyResult = await this.adjust_currency(deductionGp, deductionSp, deductionCp, targetId);
        if (!currencyResult.success) return currencyResult;
        msg += currencyResult.message + ' ';
      }

      if (action === 'add') {
        if (cleanName.split(/\s+/).length < 2 && cleanName.length < 6) {
          return fail(`"${cleanName}" is too generic. Use a more descriptive name (e.g. "iron key" not just "key").`);
        }

        if (craft) {
          const recipe = getRecipe(cleanName);
          if (!recipe) return fail(`No recipe found for "${cleanName}".`);

          const hasTools = recipe.requiredTools.every(tool =>
            target.inventory.some(i => i.name.toLowerCase().includes(tool) || tool.includes(i.name.toLowerCase()))
          );
          if (!hasTools) {
            return fail(`Crafting ${cleanName} requires: ${recipe.requiredTools.join(', ')}.`);
          }

          for (const ing of recipe.ingredients) {
            const invIdx = inv.findIndex(i => i.name.toLowerCase() === ing.item.toLowerCase());
            if (invIdx === -1 || inv[invIdx].quantity < ing.quantity) {
              return fail(`Missing ingredient: ${ing.quantity}x ${ing.item}.`);
            }
            inv[invIdx].quantity -= ing.quantity;
            if (inv[invIdx].quantity <= 0) {
              inv.splice(invIdx, 1);
            }
          }
          msg += `Crafted ${quantity}x ${cleanName}! Consumed ${recipe.ingredients.map(i => `${i.quantity}x ${i.item}`).join(', ')}.`;
          target.inventory = inv;
          return { success: true, data: { inventory: inv, character: target.name }, message: msg };
        }
      }

      const existingIdx = inv.findIndex(i => i.name.toLowerCase() === cleanName.toLowerCase());

      if (action === 'add') {
        if (existingIdx > -1) {
          inv[existingIdx].quantity += quantity;
          if (type) inv[existingIdx].type = type;
          if (rarity) inv[existingIdx].rarity = rarity;
          if (description) inv[existingIdx].description = description;
          if (stats) inv[existingIdx].stats = stats;
          if (equipped !== undefined) inv[existingIdx].equipped = equipped;
          msg = `Increased ${inv[existingIdx].name} quantity by ${quantity} for ${target.name}.`;
        } else {
          let finalType = type;
          let finalRarity = rarity;
          let finalDesc = description;
          let finalStats = stats;
          let finalWeight = 0;
          let finalCost = '0 gp';

          if (!finalType || !finalDesc) {
            try {
              const { data, error } = await this.lookupItemInDB(cleanName);
              if (data && !error) {
                finalType = data.type;
                finalRarity = data.rarity;
                finalDesc = data.description;
                finalStats = data.stats;
                finalWeight = Number(data.weight) || 0;
                finalCost = data.cost;
              }
            } catch (dbErr) {
              if (isDebugMode) console.warn('[DB] SRD item lookup failed:', dbErr);
            }

            if (!finalType || !finalDesc) {
              const cachedItem = deps.lookupSRDItem(cleanName);
              if (cachedItem) {
                finalType = cachedItem.type;
                finalRarity = cachedItem.rarity;
                finalDesc = cachedItem.description;
                finalStats = cachedItem.stats;
                finalWeight = cachedItem.weight || 0;
                finalCost = cachedItem.cost || '0 gp';
              }
            }
          }

          const newItem: InventoryItem = {
            name: cleanName,
            quantity,
            type: finalType || 'other',
            rarity: finalRarity || 'common',
            description: finalDesc || `A custom ${cleanName} found in the world.`,
            weight: finalWeight,
            cost: finalCost,
            stats: finalStats || {},
            equipped: equipped || false
          };

          inv.push(newItem);
          msg = `Added ${quantity}x ${cleanName} to ${target.name}'s inventory.`;
        }
      } else if (action === 'remove') {
        if (existingIdx > -1) {
          inv[existingIdx].quantity -= quantity;
          if (inv[existingIdx].quantity <= 0) {
            msg = `Removed all ${inv[existingIdx].name} from ${target.name}'s inventory.`;
            inv.splice(existingIdx, 1);
          } else {
            msg = `Removed ${quantity}x ${cleanName} from ${target.name}'s inventory.`;
          }
        } else {
          return { success: false, data: { inventory: inv }, message: `Could not find ${cleanName} in ${target.name}'s inventory.` };
        }
      } else if (action === 'edit') {
        if (existingIdx > -1) {
          if (new_name) inv[existingIdx].name = new_name;
          if (quantity !== undefined) inv[existingIdx].quantity = Math.max(0, quantity);
          if (type) inv[existingIdx].type = type;
          if (rarity) inv[existingIdx].rarity = rarity;
          if (description) inv[existingIdx].description = description;
          if (stats) inv[existingIdx].stats = stats;
          if (equipped !== undefined) inv[existingIdx].equipped = equipped;

          if (inv[existingIdx].quantity <= 0) {
            msg = `Removed all ${inv[existingIdx].name} from ${target.name}'s inventory.`;
            inv.splice(existingIdx, 1);
          } else {
            msg = `Modified ${cleanName} in ${target.name}'s inventory.`;
          }
        } else {
          return { success: false, data: { inventory: inv }, message: `Could not find ${cleanName} to edit.` };
        }
      }

      target.inventory = inv;
      return { success: true, data: { inventory: inv, character: target.name }, message: msg };
    },

    clearCurrencyAdjustment(): void {
      lastCurrencyAdjustment = null;
    },

    getLastCurrencyAdjustment() {
      return lastCurrencyAdjustment;
    },
  };
}
