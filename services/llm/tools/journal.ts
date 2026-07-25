/** Tool definitions for journal management: upserting quests and logging lore entries. */
import { END_OF_TURN_PROPERTIES } from './shared';

export const tools = [
    {
        type: "function",
        function: {
            name: 'upsert_quest',
            description: 'Adds or updates a quest in the player\'s journal. Supports reputation changes. Completion auto-awards XP based on difficulty.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    status: { type: 'string', enum: ['active', 'completed', 'failed'] },
                    difficulty: { type: 'string', enum: ['trivial', 'easy', 'medium', 'hard', 'deadly'], description: 'Quest difficulty. Controls XP awarded on completion (trivial=50, easy=100, medium=200, hard=400, deadly=800). Set when marking completed.' },
                    reputationChanges: {
                        type: 'array',
                        description: 'Optional: Faction reputation changes on quest completion/failure.',
                        items: {
                            type: 'object',
                            properties: {
                                faction: { type: 'string', description: 'Faction name (e.g. "Harpers")' },
                                delta: { type: 'integer', description: 'Reputation change (-20 to +20).' }
                            },
                            required: ['faction', 'delta']
                        }
                    },
                    ...END_OF_TURN_PROPERTIES
                },
                required: ['title', 'status']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'log_lore',
            description: 'Records a discovered piece of lore (NPC, Location, History, Item). Use when the party meets a significant NPC, discovers a landmark, or learns important information.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    content: { type: 'string' },
                    category: { type: 'string', enum: ['NPC', 'Location', 'History', 'Item'] },
                    ...END_OF_TURN_PROPERTIES
                },
                required: ['title', 'content', 'category']
            }
        }
    }
];
