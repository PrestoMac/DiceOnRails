import { ON_SUCCESS_PROPERTIES, BRANCH_NARRATION_PROPERTIES } from './shared';

/** Tool definitions for character-related actions: rolling dice, skill checks, saving throws, death saves, leveling up, and using class resources. */
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
                    modifier: { type: 'integer', description: 'Modifier to add' }
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
                    },
                    ...BRANCH_NARRATION_PROPERTIES
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
                    dc: { type: 'integer', description: 'Difficulty Class of the save' },
                    ...BRANCH_NARRATION_PROPERTIES
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
                    },
                    learnSpells: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional: spell IDs to learn for known casters (Bard/Sorcerer/Warlock/Ranger) on level up. Chained automatically — no separate manage_spellbook call needed.'
                    },
                    prepareSpells: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional: spell IDs to add to the daily prepared list (Cleric/Druid/Wizard/Paladin) on level up. Chained automatically.'
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
            description: 'Use a limited class/race resource. ENGINE-BACKED: rage (barbarian: sets raging, +2/+3/+4 damage), ki (monk: returns DC and martial arts die for Flurry of Blows/Stunning Strike/Patient Defense), second-wind (fighter: heals 1d10+level), breath-weapon (dragonborn: returns DC and rolled damage), lay-on-hands-pool (paladin: heals amount HP with targetId), channel-divinity (cleric: Preserve Life or Turn Undead), sorcery-points (sorcerer: spend for metamagic), bardic-inspiration (bard: returns rolled BI die with targetId).',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string', description: 'Character using the resource' },
                    characterId: { type: 'string', description: 'Alternative: character using the resource' },
                    resourceId: { type: 'string', description: 'Resource ID: rage, ki, second-wind, breath-weapon, lay-on-hands-pool, channel-divinity, sorcery-points, bardic-inspiration, action-surge, relentless-endurance' },
                    amount: { type: 'integer', description: 'Amount to spend (for lay-on-hands-pool: HP to heal. For sorcery-points: metamagic cost.)' }
                },
                required: ['resourceId']
            }
        }
    }
];
