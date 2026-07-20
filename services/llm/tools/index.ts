import { tools as combatTools } from './combat';
import { tools as spellsTools } from './spells';
import { tools as movementTools } from './movement';
import { tools as characterTools } from './character';
import { tools as inventoryTools } from './inventory';
import { tools as journalTools } from './journal';
import { tools as restTools } from './rest';

/** Aggregated array of all tool definitions from combat, spells, movement, character, inventory, journal, and rest sub-modules. */
export const tools = [
    ...combatTools,
    ...spellsTools,
    ...movementTools,
    ...characterTools,
    ...inventoryTools,
    ...journalTools,
    ...restTools,
];

export { TOOL_MODE_INSTRUCTION } from '../prompts/toolModePrompt';
