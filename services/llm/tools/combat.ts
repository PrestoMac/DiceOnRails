import { ENEMY_PROPERTIES } from './shared';

/** Tool definitions for combat actions: adding enemies, starting/ending combat, advancing turns, making attacks, and inflicting damage. */
export const tools = [
    {
        type: "function",
        function: {
            name: 'add_enemy',
            description: 'COMBAT. Adds an enemy combatant. Call this BEFORE start_combat. Optionally specify AC, HP, attacks, or let the system auto-fill from the 5E SRD monster manual by name.',
            parameters: {
                type: 'object',
                properties: { ...ENEMY_PROPERTIES },
                required: ['name']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'start_combat',
            description: 'COMBAT. Optionally register enemies AND begin combat in one call. If enemies are omitted, starts combat with previously registered enemies (backward compatible). Rolls initiative for all combatants.',
            parameters: {
                type: 'object',
                properties: {
                    enemies: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { ...ENEMY_PROPERTIES },
                            required: ['name']
                        },
                        description: 'Batch of enemies to register before starting combat'
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'next_turn',
            description: 'COMBAT. Advances to the next combatant in initiative order. Call this after each creature completes their turn. Enemy turns are auto-resolved by the engine.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: 'end_combat',
            description: 'COMBAT. Ends combat immediately. Use when all enemies are defeated or the party escapes.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: 'player_attack',
            description: 'PLAYER WEAPON ATTACK. Rolls to-hit and damage, applies damage, and handles feats (Two-Weapon Fighting, Great Weapon Fighting, Sneak Attack, Sharpshooter, Great Weapon Master) automatically.',
            parameters: {
                type: 'object',
                properties: {
                    attackerId: { type: 'string', description: 'Player name or ID making the attack' },
                    weaponName: { type: 'string', description: 'Weapon name (e.g. "Longsword")' },
                    targetId: { type: 'string', description: 'Target enemy name or ID' },
                    isOffHand: { type: 'boolean', description: 'Set true for off-hand bonus attack.' },
                    isSneakAttack: { type: 'boolean', description: 'Set true for Rogue Sneak Attack.' },
                    sharpshooter: { type: 'boolean', description: 'Use Sharpshooter feat: -5 to hit, +10 damage.' },
                    greatWeaponMaster: { type: 'boolean', description: 'Use Great Weapon Master feat: -5 to hit, +10 damage.' },
                    divineSmite: { type: 'object', description: 'Optional. Use Divine Smite on a melee hit (Paladin L2+). Expend a spell slot to deal extra radiant d8s.', properties: { slotLevel: { type: 'integer', description: 'Spell slot level to expend (1-5)' } }, required: ['slotLevel'] }
                },
                required: ['attackerId', 'weaponName']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'inflict_damage',
            description: 'DAMAGE & HP. Reduces target HP. Use for traps and environment only.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'integer', description: 'Total damage to apply' },
                    targetId: { type: 'string', description: 'Target enemy name or ID' },
                    damageType: { type: 'string', description: 'Damage type for resistance calculation' }
                },
                required: ['amount']
            }
        }
    }
];
