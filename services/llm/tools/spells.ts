/** Tool definitions for spellcasting actions: casting spells, counterspelling/dispelling, ritual casting, managing spellbooks, and summoning/teleporting/polymorphing creatures. */
export const tools = [
    {
        type: "function",
        function: {
            name: 'cast_spell',
            description: 'SPELLCASTING. Casts a spell by ID. Handles saving throws, attack rolls, and concentration automatically.',
            parameters: {
                type: 'object',
                properties: {
                    casterId: { type: 'string', description: 'Character casting the spell' },
                    spellId: { type: 'string', description: 'Spell ID (e.g. "fireball")' },
                    slotLevel: { type: 'integer', description: 'Spell slot level to use' },
                    targets: { type: 'array', items: { type: 'string' }, description: 'Target enemy IDs/names. Pass a single-element array for one target.' },
                    reaction: { type: 'boolean', description: 'Optional: Set true to cast this spell as a reaction.' },
                    metamagic: {
                        type: 'object',
                        description: 'Optional. Sorcerer metamagic option to modify the spell.',
                        properties: {
                            option: { type: 'string', enum: ['twinned', 'quickened', 'subtle', 'empowered', 'careful', 'distant', 'extended', 'heightened'], description: 'Metamagic option to apply' }
                        },
                        required: ['option']
                    }
                },
                required: ['casterId', 'spellId', 'slotLevel']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'spell_effect',
            description: 'COUNTERSPELL or DISPEL MAGIC. Auto-succeeds for spells level 3 or lower. Higher levels require an ability check (DC = 10 + spell level).',
            parameters: {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        enum: ['counter', 'dispel'],
                        description: '"counter" = Counterspell (reaction). "dispel" = Dispel Magic (action).'
                    },
                    casterId: { type: 'string', description: 'Character casting the spell' },
                    targetSpellLevel: { type: 'integer', description: 'Level of the target spell (1-9)' },
                    targetId: { type: 'string', description: 'Target creature with the spell effect (optional for counterspell)' }
                },
                required: ['mode', 'casterId', 'targetSpellLevel']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'cast_ritual',
            description: 'Ritual casting takes 10 minutes. Time advances automatically (no separate narrate_turn needed).',
            parameters: {
                type: 'object',
                properties: {
                    casterId: { type: 'string' },
                    spellId: { type: 'string' }
                },
                required: ['casterId', 'spellId']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'manage_spellbook',
            description: 'Manage a caster\'s spellbook. Add/remove/prepare spells on level up or rest.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string' },
                    action: { type: 'string', enum: ['learn', 'prepare', 'unprepare', 'forget'] },
                    spellId: { type: 'string' }
                },
                required: ['targetId', 'action', 'spellId']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'summon_creature',
            description: 'Summons a creature to fight alongside the party.',
            parameters: {
                type: 'object',
                properties: {
                    casterId: { type: 'string' },
                    creatureName: { type: 'string' },
                    count: { type: 'integer' }
                },
                required: ['casterId', 'creatureName']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'teleport_creature',
            description: 'Teleports a creature to a new location.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string' },
                    destination: { type: 'string' }
                },
                required: ['targetId', 'destination']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'polymorph_creature',
            description: 'Transform a creature into a beast form. For Druids: this IS Wild Shape — the engine auto-consumes wild-shape charges, enforces CR limits, and tracks remaining uses. For non-Druids: standard polymorph (CR capped at caster level). Available beast forms include: wolf, bear, hawk, giant-spider, tiger, owl, rat, cat, frog, spider, horse.',
            parameters: {
                type: 'object',
                properties: {
                    characterId: { type: 'string', description: 'Character ID or name doing the transformation' },
                    targetId: { type: 'string', description: 'Alternative: target character ID or name' },
                    beastForm: { type: 'string', description: 'Beast form to transform into (e.g. "wolf", "bear", "hawk")' },
                    newForm: { type: 'string', description: 'Alternative name for beastForm' },
                    duration: { type: 'integer', description: 'Duration in minutes (default 60). Wild Shape = half druid level hours.' }
                },
                required: ['newForm']
            }
        }
    }
];
