/**
 * services/llm/mapPrompt.ts
 * Supplementary system prompt fragment injected when a VTT battle map is active.
 * Teaches the LLM how to read the BATTLE MAP context block and use grid-aware tools.
 */

export const MAP_PROMPT = `
=== VTT BATTLE MAP ===
A live tactical grid is active. Use the spatial information below to make decisions.

READING THE MAP:
- Each cell = 5 feet. Distances are in the DISTANCES section of the context.
- (x, y): x = column (0 = left), y = row (0 = top).
- Tokens labelled [A], [B] = players. [E1], [E2] = enemies.

MOVEMENT:
- call move_token(tokenId, x, y) to reposition a combatant.
- A creature's Speed / 5 = max cells per turn (e.g. 30 ft speed = 6 cells max).
- Moving through difficult terrain costs 2 cells per cell. Dashing doubles the movement budget.

RANGE RULES (D&D 5e):
- Melee attack: target must be ≤ 5 ft (adjacent or diagonal cell). Check RANGE section.
- Ranged attack / spell: use the stated spell/weapon range. If the target exceeds that, the action cannot be taken without moving closer first (call move_token before attacking).
- If RANGE says "LONG RANGE", the character MUST move closer or use a ranged weapon/spell before attacking in melee.

TURN FLOW (when map is active):
1. move_token (if repositioning before acting)
2. player_attack / cast_spell / check_skill (the action)
3. next_turn (advance initiative)
4. narrate_turn (prose — include the distance/positioning details)

INIT BATTLE MAP:
- Call init_battle_map at the start of a combat encounter to place all tokens automatically.
- Pass generateImage: true to request an AI-generated map background (async, shows spinner).
- Omit generateImage or set false for instant placement with a plain grid.
`;
