/** Tool definition for VTT grid map movement: move_token and init_battle_map. */
export const tools = [
    {
        type: "function",
        function: {
            name: 'move_token',
            description: 'VTT BATTLE MAP. Moves a combatant to a new cell on the battle grid. Each cell = 5 ft. A creature\'s speed in feet divided by 5 gives the maximum cells it can move per turn (e.g. 30 ft speed = 6 cells). Call this when a player or enemy moves during combat or exploration while a battle map is active.',
            parameters: {
                type: 'object',
                properties: {
                    tokenId: {
                        type: 'string',
                        description: 'Character id, enemy id, or character name of the combatant to move.'
                    },
                    x: {
                        type: 'integer',
                        description: 'Target column on the battle grid (0-based, 0 = left edge).'
                    },
                    y: {
                        type: 'integer',
                        description: 'Target row on the battle grid (0-based, 0 = top edge).'
                    },
                    narration: {
                        type: 'string',
                        description: 'Optional: 1-2 sentence narration of the movement (e.g. "Aria dashes behind the pillar").'
                    }
                },
                required: ['tokenId', 'x', 'y']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'init_battle_map',
            description: 'VTT BATTLE MAP. Initialises a new battle map at the start of an encounter or when the party enters a new tactical space. Auto-places all party members and enemies at sensible starting positions. Call this at the same time as start_combat (or just after) when a visual battle map would enhance play.',
            parameters: {
                type: 'object',
                properties: {
                    label: {
                        type: 'string',
                        description: 'Short name for this encounter location (e.g. "Goblin Cave — Chamber 3").'
                    },
                    width: {
                        type: 'integer',
                        description: 'Grid columns. Defaults to 20. Use 10-15 for cramped rooms, 20-30 for open areas.'
                    },
                    height: {
                        type: 'integer',
                        description: 'Grid rows. Defaults to 15.'
                    },
                    generateImage: {
                        type: 'boolean',
                        description: 'Set true to request a AI-generated map background image. Defaults to false.'
                    }
                },
                required: []
            }
        }
    }
];
