/** Tool definitions for rest mechanics: long and short rests. XP is engine-awarded (no manual tool). */
export const tools = [
    {
        type: "function",
        function: {
            name: 'long_rest',
            description: 'LONG REST (8 hours, 480 min). Restores all HP and half total Hit Dice. Time advances automatically when narration is provided.',
            parameters: {
                type: 'object',
                properties: {
                    narration: { type: 'string', description: 'Optional narration of the rest.' },
                    autoAdvanceTime: { type: 'boolean', description: 'Optional: Set true to advance time without narration.' },
                    suggestions: {
                        type: 'array',
                        items: { type: 'string' },
                        maxItems: 3,
                        description: 'Optional: 2-3 suggested next actions in first person (e.g. "I search the campsite").'
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'short_rest',
            description: 'SHORT REST (60 min). Spends Hit Dice to heal. Time advances automatically when narration is provided.',
            parameters: {
                type: 'object',
                properties: {
                    targetId: { type: 'string' },
                    narration: { type: 'string', description: 'Optional narration of the rest.' },
                    autoAdvanceTime: { type: 'boolean', description: 'Optional: Set true to advance time without narration.' },
                    suggestions: {
                        type: 'array',
                        items: { type: 'string' },
                        maxItems: 3,
                        description: 'Optional: 2-3 suggested next actions in first person (e.g. "I search the area").'
                    }
                },
                required: []
            }
        }
    }
];
