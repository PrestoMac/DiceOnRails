/** Shared JSON Schema properties for on-success chaining (awardCurrency, logLore, upsertQuest, updateInventory). */
export const ON_SUCCESS_PROPERTIES = {    awardCurrency: {
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

/** Shared JSON Schema properties for defining an enemy (name, AC, HP, CR, XP, size, type). */
export const ENEMY_PROPERTIES = {
    name: { type: 'string', description: 'Enemy name (e.g. "Goblin", "Orc", "Dragon"). Auto-looks up 5E SRD stats.' },
    ac: { type: 'integer', description: 'Optional: Override Armor Class' },
    hp: { type: 'integer', description: 'Optional: Override Hit Points' },
    cr: { type: 'number', description: 'Optional: Challenge Rating' },
    xp: { type: 'integer', description: 'Optional: XP awarded on defeat' },
    size: { type: 'string', description: 'Optional: Small, Medium, Large, etc.' },
    type: { type: 'string', description: 'Optional: beast, humanoid, undead, etc.' }
};

/**
 * Optional end-of-turn finalize fields for DETERMINISTIC action tools (update_inventory,
 * adjust_currency, log_lore, upsert_quest, simple move_to). When `narration` is provided,
 * the engine advances time by `timePassed` and ends the turn in the same call — collapsing
 * the action+narrate_turn pair into one tool call. Only honored out of combat.
 */
export const END_OF_TURN_PROPERTIES = {
    narration: { type: 'string', description: 'Optional ending narration. If provided, this action ends the turn (out of combat only).' },
    timePassed: { type: 'integer', description: 'Optional: minutes to advance when ending the turn. Use 0 for an instant action with narration.' }
};

/**
 * Optional conditional narration for BINARY dice tools (check_skill, make_save). The engine
 * selects the branch matching the ACTUAL roll result — the LLM never decides which prose is
 * used, preserving zero-hallucination. Both branches should be provided; if omitted, the tool
 * does not finalize the turn and a separate narrate_turn is still required.
 */
export const BRANCH_NARRATION_PROPERTIES = {
    narrationOnSuccess: { type: 'string', description: 'Narration used if the check/save succeeds. The engine picks this branch from the roll.' },
    narrationOnFailure: { type: 'string', description: 'Narration used if the check/save fails. The engine picks this branch from the roll.' },
    timePassed: { type: 'integer', description: 'Minutes to advance regardless of outcome (applies once a branch is selected).' }
};
