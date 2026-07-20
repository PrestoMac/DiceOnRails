import { ON_SUCCESS_PROPERTIES } from './shared';

export const tools = [
    {
        type: "function",
        function: {
            name: 'move_to',
            description: 'Moves the player to a new location. Supports automatic skill check and route travel.',
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
                    route: {
                        type: 'string',
                        description: 'Optional: Named route for travel between locations (e.g. high-road, neverwinter-woods-trail).'
                    },
                    pace: {
                        type: 'string',
                        enum: ['slow', 'normal', 'fast'],
                        description: 'Optional: Travel pace (default: normal).'
                    }
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
                    narration: { type: 'string', description: '2-4 sentences of vivid, present-tense narration.' },
                    timePassed: {
                        type: 'integer',
                        description: 'REQUIRED. Minutes this action takes. Always estimate: 1-2=quick action/talk, 5-10=search/conversation, 30+=travel. Use 0 ONLY for truly instant events (a single reaction, a brief line). Every narration moves time forward.'
                    }
                },
                required: ['narration', 'timePassed']
            }
        }
    }
];
