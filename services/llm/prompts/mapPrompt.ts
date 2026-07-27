/**
 * services/llm/mapPrompt.ts
 * Supplementary system prompt fragment injected when a VTT battle map is active.
 * Teaches the LLM how to read the BATTLE MAP context block and strictly enforce movement budgets and attack ranges.
 */

export const MAP_PROMPT = `
=== VTT BATTLE MAP SYSTEM ===
A live tactical battle grid is active for all combat encounters. You MUST stay positionally aware and account for coordinates, movement speeds, and attack/spell ranges.

READING THE GRID:
- Each cell = 5 feet. Coordinates are (x, y) where x = column (0 = left) and y = row (0 = top).
- Players are listed with positions (e.g. [A] Aria @ (4,7)). Enemies are listed with positions (e.g. [E1] Goblin @ (12,7)).
- The DISTANCES section in the context calculates exact Chebyshev distances in feet between all combatants.

STRICT MOVEMENT BUDGET:
- Maximum movement cells per turn = Creature Speed in feet / 5 (e.g., 30 ft speed = max 6 cells per turn).
- Call move_token(tokenId, x, y) whenever a character or enemy moves.
- Never move a creature beyond its movement budget in a single turn unless Dashing.

STRICT ATTACK & SPELL RANGES (D&D 5e):
- MELEE ATTACKS: Target MUST be within 5 ft (adjacent or diagonal cell). If distance > 5 ft, the combatant MUST call move_token to close the distance BEFORE calling player_attack or casting a melee spell.
- RANGED ATTACKS & SPELLS: Target MUST be within the weapon/spell maximum range (e.g. Firebolt = 120 ft, Shortbow = 80 ft). If out of range, move_token MUST be called first to get within range.
- DISADVANTAGE: Ranged weapon attacks made while an enemy is within 5 ft (MELEE range) suffer disadvantage.

TACTICAL TURN FLOW:
1. Assess current positions and target distances from the BATTLE MAP context.
2. If out of range for desired attack/spell, call move_token(tokenId, targetX, targetY) within movement budget.
3. Call player_attack / cast_spell / check_skill.
4. Call next_turn (or narrate_turn).
`;
