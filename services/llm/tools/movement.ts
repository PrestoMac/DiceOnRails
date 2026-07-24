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
                    }
                },
                required: ['narration', 'timePassed']
            }
        }
    }
];
