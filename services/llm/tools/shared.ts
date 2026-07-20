export const ON_SUCCESS_PROPERTIES = {
    awardCurrency: {
        type: 'object',
        description: 'Auto-award currency on success.',
        properties: {
            gp: { type: 'integer' }, sp: { type: 'integer' }, cp: { type: 'integer' }
        }
    },
    logLore: {
        type: 'object',
        description: 'Auto-log a lore entry on success.',
        properties: {
            title: { type: 'string' }, content: { type: 'string' },
            category: { type: 'string', enum: ['NPC', 'Location', 'History', 'Item'] }
        },
        required: ['title', 'content', 'category']
    },
    upsertQuest: {
        type: 'object',
        description: 'Auto-add/update a quest on success.',
        properties: {
            title: { type: 'string' }, description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'completed', 'failed'] }
        },
        required: ['title', 'status']
    },
    updateInventory: {
        type: 'object',
        description: 'Auto-add an item to inventory on success.',
        properties: {
            item_name: { type: 'string' }, quantity: { type: 'integer' }
        }
    }
};

export const ENEMY_PROPERTIES = {
    name: { type: 'string', description: 'Enemy name (e.g. "Goblin", "Orc", "Dragon"). Auto-looks up 5E SRD stats.' },
    ac: { type: 'integer', description: 'Optional: Override Armor Class' },
    hp: { type: 'integer', description: 'Optional: Override Hit Points' },
    cr: { type: 'number', description: 'Optional: Challenge Rating' },
    xp: { type: 'integer', description: 'Optional: XP awarded on defeat' },
    size: { type: 'string', description: 'Optional: Small, Medium, Large, etc.' },
    type: { type: 'string', description: 'Optional: beast, humanoid, undead, etc.' }
};
