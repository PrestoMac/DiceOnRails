/** Tool definitions for inventory and currency management: updating items and adjusting GP/SP/CP. */
import { END_OF_TURN_PROPERTIES } from './shared';

export const tools = [
    {
        type: "function",
        function: {
            name: 'update_inventory',
            description: 'INVENTORY. Use this for BUYING, SELLING, DRINKING potions, EATING, PICKING UP items, LOOTING bodies, or DROPPING items.',
            parameters: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        description: 'Optional: batch of items to add in one call (e.g. looting a body). Each entry: {item_name, quantity, type, rarity, description, stats}. Mutually exclusive with item_name.',
                        items: {
                            type: 'object',
                            properties: {
                                item_name: { type: 'string' },
                                quantity: { type: 'integer' },
                                type: { type: 'string', enum: ['weapon', 'armor', 'potion', 'shield', 'gear', 'other'] },
                                rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'very rare', 'legendary'] },
                                description: { type: 'string' },
                                stats: { type: 'object' }
                            },
                            required: ['item_name']
                        }
                    },
                    item_name: { type: 'string' },
                    action: { type: 'string', enum: ['add', 'remove', 'edit'] },
                    quantity: { type: 'integer' },
                    new_name: { type: 'string' },
                    type: { type: 'string', enum: ['weapon', 'armor', 'potion', 'shield', 'gear', 'other'] },
                    rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'very rare', 'legendary'] },
                    description: { type: 'string', description: 'Flavor description of the item.' },
                    stats: {
                        type: 'object',
                        description: 'Mechanical stats compliant with 5e rules.',
                        properties: {
                            damage: { type: 'string', description: 'e.g. "1d6" or "2d4"' },
                            damageType: { type: 'string', description: 'e.g. "piercing", "slashing", "bludgeoning"' },
                            healing: { type: 'string', description: 'e.g. "2d4+2" or "4d4+4"' },
                            acBonus: { type: 'integer', description: 'e.g. 2 for shield' },
                            acFormula: { type: 'string', description: 'e.g. "11 + DEX" or "16"' },
                            properties: { type: 'array', items: { type: 'string' }, description: 'e.g. ["finesse", "light", "thrown (20/60)"]' },
                            strengthReq: { type: 'integer', description: 'e.g. 13' },
                            stealthDisadv: { type: 'boolean' }
                        }
                    },
                    equipped: { type: 'boolean' },
                    cost_gp: { type: 'integer', description: 'Optional: Gold pieces to auto-deduct (positive) or credit (negative).' },
                    cost_sp: { type: 'integer', description: 'Optional: Silver pieces to auto-deduct.' },
                    cost_cp: { type: 'integer', description: 'Optional: Copper pieces to auto-deduct.' },
                    autoDeductMarketPrice: { type: 'boolean', description: 'Optional: If true, look up SRD price and deduct.' },
                    craft: { type: 'boolean', description: 'Optional: Set true to craft from ingredients.' },
                    ...END_OF_TURN_PROPERTIES
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'adjust_currency',
            description: 'MANAGE MONEY. Use for BUYING, SELLING, REWARDS, TAXES, or any GP/SP/CP transaction.',
            parameters: {
                type: 'object',
                properties: {
                    gp: { type: 'integer', description: 'Gold pieces to add' },
                    sp: { type: 'integer', description: 'Silver pieces to add' },
                    cp: { type: 'integer', description: 'Copper pieces to add' },
                    targetId: { type: 'string' },
                    ...END_OF_TURN_PROPERTIES
                },
                required: []
            }
        }
    }
];
