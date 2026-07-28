import { tools as combatTools } from './combat';
import { tools as spellsTools } from './spells';
import { tools as movementTools } from './movement';
import { tools as characterTools } from './character';
import { tools as inventoryTools } from './inventory';
import { tools as journalTools } from './journal';
import { tools as restTools } from './rest';
import { tools as gridTools } from './grid';

/** Aggregated array of all tool definitions from combat, spells, movement, character, inventory, journal, rest, and VTT grid sub-modules. */
export const tools = [
    ...combatTools,
    ...spellsTools,
    ...movementTools,
    ...characterTools,
    ...inventoryTools,
    ...journalTools,
    ...restTools,
    ...gridTools,
];

export { TOOL_MODE_INSTRUCTION } from '../prompts/toolModePrompt';

