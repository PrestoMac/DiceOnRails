import { ON_SUCCESS_PROPERTIES } from './shared';

export const tools = [
    {
        type: "function",
        function: {
            name: 'roll_dice',
            description: 'Rolls dice for non-attack purposes (saving throws, ability checks, out-of-combat rolls, or generic checks). Enemy attacks are auto-resolved by next_turn — use player_attack for player weapon attacks.',
            parameters: {
                type: 'object',
                properties: {
                    sides: { type: 'integer', description: 'Number of sides (20 for checks, 4-12 for damage dice)' },
                    count: { type: 'integer', description: 'Number of dice to roll' },
                    modifier: { type: 'integer', description: 'Modifier to add' },
                    target_ac: { type: 'integer', description: 'Optional backward compatibility target AC' },
                    target_name: { type: 'string', description: 'Optional backward compatibility target name' },
                    isOffHand: { type: 'boolean', description: 'Optional backward compatibility isOffHand flag' },
                    weaponName: { type: 'string', description: 'Optional backward compatibility weapon name' },
                    attackerId: { type: 'string', description: 'Optional backward compatibility attacker ID' }
                },
                required: ['sides']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'check_skill',
            description: 'SKILL CHECKS. Use this for PERSUADING, INTIMIDATING, DECEIVING, SNEAKING, LISTENING, LOOKING FOR TRAPS, UNLOCKING, INVESTIGATING, or RECALLING KNOWLEDGE/LORE.',
            parameters: {
                type: 'object',
                properties: {
                    skill_name: { type: 'string' },
                    difficulty: { type: 'integer' },
                    targetId: { type: 'string' },
                    onSuccess: {
                        type: 'object',
                        description: 'Optional: Actions auto-fired when the check succeeds. Eliminates the need for a separate tool call.',
                        properties: { ...ON_SUCCESS_PROPERTIES }
                    }
                },
                required: ['skill_name', 'difficulty']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'make_save',
            description: 'SAVING THROWS. Use for DEX/CON/WIS/STR/INT/CHA saves against traps, spells, poison, and environmental effects. Now supports enemy targets too.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string', description: 'Character or enemy ID/name making the save' },
                    stat: { type: 'string', description: 'Ability: strength, dexterity, constitution, intelligence, wisdom, or charisma' },
                    dc: { type: 'integer', description: 'Difficulty Class of the save' }
                },
                required: ['targetId', 'stat', 'dc']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'roll_death_save',
            description: 'DEATH SAVES. Use when a character is at 0 HP. Rolls a d20 death save (10+ success, 1-9 failure, 20 = revive at 1 HP). 3 successes = stable, 3 failures = death.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string', description: 'Character making the death save' }
                },
                required: ['targetId']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'level_up',
            description: 'LEVEL UP. Allocate stat points, skill points, and HP after leveling up. Handles all progression in one call.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string', description: 'Character leveling up' },
                    stats: {
                        type: 'object',
                        description: 'Stat increases, e.g. {"str": 2, "con": 1}. Only include stats being increased.',
                        properties: {
                            str: { type: 'integer' }, dex: { type: 'integer' }, con: { type: 'integer' },
                            int: { type: 'integer' }, wis: { type: 'integer' }, cha: { type: 'integer' }
                        }
                    },
                    skills: {
                        type: 'object',
                        description: 'Skill proficiency increases, e.g. {"stealth": 1, "perception": 1}.',
                        additionalProperties: { type: 'integer' }
                    },
                    hpDeviation: {
                        type: 'integer',
                        description: 'HP roll adjustment from the class hit die (0 = average, positive = rolled high, negative = rolled low).'
                    }
                },
                required: ['targetId']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'use_resource',
            description: 'Use a limited class resource (Rage, Ki, Second Wind, Action Surge, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string' },
                    resourceId: { type: 'string', description: 'Resource ID (e.g. "second-wind")' },
                    action: { type: 'string', description: 'Specific action to take with the resource' }
                },
                required: ['targetId', 'resourceId']
            }
        }
    }
];
