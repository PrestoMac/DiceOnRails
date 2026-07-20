/** Tool definitions for rest and experience: awarding XP, and taking long/short rests. */
export const tools = [
    {
        type: "function",
        function: {
            name: 'award_experience',
            description: 'AWARD XP. Use immediately when a challenge is overcome. Without targetId = party-wide split.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'integer', description: 'Total XP to award' },
                    targetId: { type: 'string', description: 'Specific character ID (omit for party-wide)' }
                },
                required: ['amount']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'long_rest',
            description: 'LONG REST (8 hours, 480 min). Restores all HP and half total Hit Dice. Time advances automatically when narration is provided.',
            parameters: {
                type: 'object',
                properties: {
                    narration: { type: 'string', description: 'Optional narration of the rest.' },
                    autoAdvanceTime: { type: 'boolean', description: 'Optional: Set true to advance time without narration.' }
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
                    autoAdvanceTime: { type: 'boolean', description: 'Optional: Set true to advance time without narration.' }
                },
                required: []
            }
        }
    }
];
