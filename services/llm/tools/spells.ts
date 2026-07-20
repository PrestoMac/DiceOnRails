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
                    targets: { type: 'array', items: { type: 'string' }, description: 'Target enemy IDs/names' },
                    targetId: { type: 'string', description: 'Single target' },
                    reaction: { type: 'boolean', description: 'Optional: Set true to cast this spell as a reaction.' }
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
            description: 'Ritual casting takes 10 minutes. Call narrate_turn(timePassed=10) separately to advance time.',
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
                    action: { type: 'string', enum: ['learn', 'unlearn', 'prepare', 'unprepare'] },
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
            description: 'Polymorphs a creature into a different form.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string' },
                    newForm: { type: 'string' },
                    duration: { type: 'integer' }
                },
                required: ['targetId', 'newForm']
            }
        }
    }
];
