import { ON_SUCCESS_PROPERTIES, END_OF_TURN_PROPERTIES } from './shared';

/** Tool definitions for movement and narration: moving to locations and ending turns with narration. */
export const tools = [
    {
        type: "function",
        function: {
            name: 'move_to',
            description: 'Moves the player to a new location. Supports an automatic skill check on arrival. For long journeys, break the trip into multiple move_to legs (each ~4 hours max) with long_rest stops along the way; the engine rejects any leg that would overexert the party.',
            parameters: {
                type: 'object',
                properties: {
                    location_name: { type: 'string' },
                    description: { type: 'string' },
                    targetId: { type: 'string' },
                    significance: { type: 'string', enum: ['minor', 'major', 'landmark'], description: 'Optional: significance of the location. Controls exploration XP on first visit (minor=25, major=50, landmark=100). Omit defaults to landmark (100 XP).' },
                    skillCheck: {
                        type: 'object',
                        description: 'Optional: Auto-perform a skill check upon arrival.',
                        properties: {
                            skill_name: { type: 'string', description: 'Skill to check (perception, investigation, etc.)' },
                            difficulty: { type: 'integer', description: 'DC of the check' },
                            onSuccess: {
                                type: 'object',
                                description: 'Actions fired on success.',
                                properties: { ...ON_SUCCESS_PROPERTIES }
                            }
                        },
                        required: ['skill_name', 'difficulty']
                    },
                    ...END_OF_TURN_PROPERTIES
                },
                required: ['location_name']
            }
        }
    },
    {
        type: "function",
        function: {
            name: 'narrate_turn',
            description: 'END OF TURN + NARRATION + TIME. Advances the game clock by timePassed minutes.',
            parameters: {
                type: 'object',
                properties: {
                    narration: { type: 'string', description: '3-6 sentences of vivid, present-tense narration covering action, sensory detail, and immediate consequence.' },
                    timePassed: {
                        type: 'integer',
                        description: 'REQUIRED. Minutes this action takes. Always estimate: 1-2=quick action/talk, 5-10=search/conversation, 30+=travel. Use 0 ONLY for truly instant events (a single reaction, a brief line). Every narration moves time forward.'
                    },
                    suggestions: {
                        type: 'array',
                        items: { type: 'string', description: 'A single suggested action in first person, e.g. "I attack the goblin" (max 80 chars).' },
                        maxItems: 3,
                        description: 'Optional: 2-3 suggested next actions in first person, e.g. "I cast Cure Wounds on the fighter". Include when the player might need tactical guidance.'
                    },
                    roleplay: {
                        type: 'string',
                        enum: ['dialogue', 'creative'],
                        description: 'Optional: Tag the turn to award baseline roleplay XP. Use "dialogue" when the turn centers on speaking with, persuading, intimidating, deceiving, or otherwise soliciting a response from an NPC (engine awards 1 XP baseline). Use "creative" for clever problem-solving, lateral thinking, or inventive use of abilities/items/environment (pass xp=2-10 based on ingenuity; if omitted, engine awards 5 XP). Do NOT tag routine exploration, travel narration, or combat descriptions.'
                    },
                    xp: { type: 'integer', description: 'Optional: Roleplay XP (1-10) to award. Overrides the roleplay-tag baseline. Hard cap is 10 per turn.' }
                },
                required: ['narration', 'timePassed']
            }
        }
    }
];
