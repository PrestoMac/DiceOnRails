







import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(import.meta.dirname || __dirname, '../../.env') });

import { MockMCPServer, mcpServer } from '../../services/mcpService';
import { runAgentLoop } from '../../services/llm/agentLoop';
import { Message, MessageRole } from '../../types';
import { makeCharacter } from '../helpers/characters';


const originalFetch = global.fetch;
let lastRequestBody: Record<string, unknown> | null = null;
let lastResponseData: Record<string, unknown> | null = null;

function installFetchInterceptor() {
  global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body && typeof init.body === 'string') {
      lastRequestBody = JSON.parse(init.body) as Record<string, unknown>;
    }
    const response = await originalFetch(url, init);
    const clone = response.clone();
    try {
      lastResponseData = await clone.json() as Record<string, unknown>;
    } catch {
      lastResponseData = null;
    }
    return response;
  };
}

function uninstallFetchInterceptor() {
  global.fetch = originalFetch;
  lastRequestBody = null;
  lastResponseData = null;
}


interface Scenario {
  id: number;
  name: string;
  description: string;
  setup?: (server: MockMCPServer) => void;
  prompt: string;
  expectedTool?: string;
  expectedTimeEffect?: string;
}

const SCENARIOS: Scenario[] = [
  
  { id: 1, name: 'Instant action', prompt: 'I look around the tavern.', expectedTool: 'narrate_turn', expectedTimeEffect: '0 min' },
  { id: 2, name: 'Short wait', prompt: 'I sit down and wait for a few minutes.', expectedTool: 'narrate_turn', expectedTimeEffect: '1-5 min' },
  { id: 3, name: 'Conversation', prompt: 'I chat with the bartender about local rumors.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-15 min' },
  { id: 4, name: 'Searching', prompt: 'I search the room thoroughly for hidden doors.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-10 min' },
  { id: 5, name: 'Long activity', prompt: 'I spend time studying my spellbook.', expectedTool: 'narrate_turn', expectedTimeEffect: '30-60 min' },
  { id: 6, name: 'Rest request', prompt: 'I want to take a short rest.', expectedTool: 'short_rest', expectedTimeEffect: '60 min' },
  { id: 7, name: 'Sleep request', prompt: 'I set up camp and go to sleep for the night.', expectedTool: 'long_rest', expectedTimeEffect: '480 min' },

  
  { id: 8, name: 'Simple move', prompt: 'I walk to the blacksmith.', expectedTool: 'move_to', expectedTimeEffect: '0-5 min' },
  { id: 9, name: 'Move with search', prompt: 'I go to the library and look for a specific book.', expectedTool: 'move_to', expectedTimeEffect: '5-15 min' },
  { id: 10, name: 'Long journey', prompt: 'I travel to Waterdeep on the high road.', expectedTool: 'move_to', expectedTimeEffect: '240+ min' },

  
  { id: 11, name: 'Fight then wait', prompt: 'I attack the goblin with my sword.', expectedTool: 'player_attack', expectedTimeEffect: '0 min (combat round)' },
  { id: 12, name: 'Combat round', prompt: 'It\'s my turn in combat. I attack the nearest enemy.', expectedTool: 'player_attack', expectedTimeEffect: '0 min (combat round)' },
  { id: 13, name: 'Defeated enemy', prompt: 'The goblin is dead. What do I do next?', expectedTool: 'narrate_turn', expectedTimeEffect: '0-5 min' },

  
  { id: 14, name: 'Instant spell', prompt: 'I cast firebolt at the goblin.', expectedTool: 'cast_spell', expectedTimeEffect: '0 min (action)' },
  { id: 15, name: 'Concentration spell', prompt: 'I cast bless on myself.', expectedTool: 'cast_spell', expectedTimeEffect: '0 min (concentration started)' },
  { id: 16, name: 'Ritual cast', prompt: 'I cast detect magic as a ritual.', expectedTool: 'cast_ritual', expectedTimeEffect: '10 min' },

  
  { id: 17, name: 'Investigate', prompt: 'I carefully investigate the strange markings on the wall.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-10 min' },
  { id: 18, name: 'Pick lock', prompt: 'I try to pick the lock on the chest.', expectedTool: 'check_skill', expectedTimeEffect: '0-5 min' },
  { id: 19, name: 'Hide', prompt: 'I hide in the shadows and wait.', expectedTool: 'narrate_turn', expectedTimeEffect: '1-5 min' },
  { id: 20, name: 'Long rest denied', prompt: 'I want to take a long rest.', expectedTool: 'long_rest', expectedTimeEffect: '480 min or rejected' },

  
  { id: 21, name: 'Talk to NPC', prompt: 'I ask the merchant about his wares.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-10 min' },
  { id: 22, name: 'Threaten NPC', prompt: 'I draw my sword and threaten the shopkeeper.', expectedTool: 'narrate_turn', expectedTimeEffect: '0-5 min' },
  { id: 23, name: 'Negotiate', prompt: 'I try to haggle for a better price on the armor.', expectedTool: 'check_skill', expectedTimeEffect: '5-10 min' },
  { id: 24, name: 'Sing', prompt: 'I perform a song at the tavern.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-15 min' },

  
  { id: 25, name: 'Equip weapon', prompt: 'I equip my longsword.', expectedTool: 'update_inventory', expectedTimeEffect: '0 min (free action)' },
  { id: 26, name: 'Use potion', prompt: 'I drink a potion of healing.', expectedTool: 'use_resource', expectedTimeEffect: '0 min (action)' },
  { id: 27, name: 'Buy item', prompt: 'I buy a torch from the merchant.', expectedTool: 'adjust_currency', expectedTimeEffect: '0-5 min' },

  
  { id: 28, name: 'Hurry', prompt: 'I rush through the dungeon as fast as I can.', expectedTool: 'narrate_turn', expectedTimeEffect: '1-5 min' },
  { id: 29, name: 'Take time', prompt: 'I take my time and carefully examine everything.', expectedTool: 'narrate_turn', expectedTimeEffect: '10-30 min' },
  { id: 30, name: 'Wait for night', prompt: 'I wait until darkness falls before moving.', expectedTool: 'narrate_turn', expectedTimeEffect: '60-180 min' },

  
  { id: 31, name: 'Downed ally', prompt: 'My friend is dying! I try to stabilize them.', expectedTool: 'roll_death_save', expectedTimeEffect: '0 min (reaction)' },
  { id: 32, name: 'Heal downed', prompt: 'I cast cure wounds on my unconscious friend.', expectedTool: 'cast_spell', expectedTimeEffect: '0 min (action)' },

  
  { id: 33, name: 'No action', prompt: 'What do I see?', expectedTool: 'narrate_turn', expectedTimeEffect: '0 min' },
  { id: 34, name: 'Ambiguous', prompt: 'I do something.', expectedTool: 'narrate_turn', expectedTimeEffect: '0-5 min' },
  { id: 35, name: 'Complex', prompt: 'I move to the door, check for traps, then open it.', expectedTool: 'move_to', expectedTimeEffect: '5-15 min' },

  
  { id: 36, name: 'Short rest healing', prompt: 'I\'m hurt. I take a short rest to recover.', expectedTool: 'short_rest', expectedTimeEffect: '60 min' },
  { id: 37, name: 'Spend hit dice', prompt: 'I spend a hit die to heal during a short rest.', expectedTool: 'short_rest', expectedTimeEffect: '60 min' },
  { id: 38, name: 'Recover slots', prompt: 'I rest until my spell slots recover.', expectedTool: 'long_rest', expectedTimeEffect: '480 min' },

  
  { id: 39, name: 'Move + search', prompt: 'I go to the library and search for a book about dragons.', expectedTool: 'move_to', expectedTimeEffect: '5-15 min' },
  { id: 40, name: 'Talk + move', prompt: 'After chatting with the bartender, I head to my room.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-15 min' },

  
  { id: 41, name: 'Maintain concentration', prompt: 'I\'m concentrating on bless. I move forward carefully.', expectedTool: 'narrate_turn', expectedTimeEffect: '0-5 min' },
  { id: 42, name: 'Break concentration', prompt: 'I drop my concentration on bless and cast firebolt instead.', expectedTool: 'cast_spell', expectedTimeEffect: '0 min' },

  
  { id: 43, name: 'Wild shape', prompt: 'I use my wild shape to become a wolf.', expectedTool: 'polymorph_creature', expectedTimeEffect: '0 min (transformation started)' },
  { id: 44, name: 'Transformed wait', prompt: 'I\'m in wolf form. I wait and observe the camp.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-10 min' },

  
  { id: 45, name: 'Summon creature', prompt: 'I cast conjure animals to summon a wolf.', expectedTool: 'cast_spell', expectedTimeEffect: '0 min (summon appears)' },

  
  { id: 46, name: 'Full turn cycle', prompt: 'I attack the goblin, then end my turn.', expectedTool: 'player_attack', expectedTimeEffect: '0 min (combat)' },
  { id: 47, name: 'Explore then rest', prompt: 'I search the room, then set up camp for a long rest.', expectedTool: 'narrate_turn', expectedTimeEffect: '480 min' },
  { id: 48, name: 'Travel then rest', prompt: 'I travel to the next town and rest there.', expectedTool: 'move_to', expectedTimeEffect: '240+ min' },
  { id: 49, name: 'Fight then rest', prompt: 'After the battle, I take a short rest.', expectedTool: 'short_rest', expectedTimeEffect: '60 min' },
  { id: 50, name: 'Complex adventure', prompt: 'I search the room, find a clue, then head to the tavern to rest.', expectedTool: 'narrate_turn', expectedTimeEffect: '5-480 min' },
];


interface ScenarioResult {
  id: number;
  name: string;
  prompt: string;
  gameTimeBefore: number;
  gameTimeAfter: number;
  timePassed: number;
  toolCallsMade: string[];
  toolCallArgs: Record<string, Record<string, unknown>>;
  llmContent: string;
  narrationReturned: string;
  effects: string[];
  conditionChanges: string[];
  concentrationBefore: string | null;
  concentrationAfter: string | null;
  transformationBefore: boolean;
  transformationAfter: boolean;
  error: string | null;
  llmRequestSummary: string;
  llmResponseSummary: string;
  engineResponseSummary: string;
}


async function runScenario(scenario: Scenario, server: MockMCPServer): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    id: scenario.id,
    name: scenario.name,
    prompt: scenario.prompt,
    gameTimeBefore: server.getFullState().gameTime ?? 0,
    gameTimeAfter: 0,
    timePassed: 0,
    toolCallsMade: [],
    toolCallArgs: {},
    llmContent: '',
    narrationReturned: '',
    effects: [],
    conditionChanges: [],
    concentrationBefore: null,
    concentrationAfter: null,
    transformationBefore: false,
    transformationAfter: false,
    error: null,
    llmRequestSummary: '',
    llmResponseSummary: '',
    engineResponseSummary: '',
  };

  try {
    
    const char = server.getFullState().party[0];
    result.concentrationBefore = char?.concentrationSpellId ?? null;
    result.transformationBefore = !!char?.runtime?.transformationState;

    
    lastRequestBody = null;
    lastResponseData = null;

    
    const history: Message[] = [{
      id: `user-${Date.now()}`,
      role: MessageRole.USER,
      text: scenario.prompt,
      timestamp: Date.now(),
    }];

    
    const agentResult = await runAgentLoop(
      history,
      'You are in a tavern. The time is morning.',
      undefined,
      undefined,
      undefined,
      { maxIters: 5, requestEndNarration: true }
    );

    
    if (lastRequestBody) {
      const msgs = (lastRequestBody.messages || []) as Array<Record<string, unknown>>;
      const userMsg = msgs.find((m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes(scenario.prompt));
      const tools = (lastRequestBody.tools || []) as Array<Record<string, unknown>>;
      const toolNames = tools.map((t) => {
        const fn = t.function as Record<string, unknown> | undefined;
        return fn?.name;
      }).filter(Boolean);
      result.llmRequestSummary = JSON.stringify({
        model: lastRequestBody.model,
        messageCount: msgs.length,
        toolCount: toolNames.length,
        userMessage: typeof userMsg?.content === 'string' ? userMsg.content.substring(0, 200) : 'N/A',
        temperature: lastRequestBody.temperature,
      });
    }

    
    if (lastResponseData) {
      const choices = (lastResponseData.choices || []) as Array<Record<string, unknown>>;
      const choice = choices[0] as Record<string, unknown> | undefined;
      const msg = choice?.message as Record<string, unknown> | undefined;
      result.llmContent = (msg?.content as string) || '';
      const toolCalls = (msg?.tool_calls || []) as Array<Record<string, unknown>>;
      result.toolCallsMade = toolCalls.map((tc) => {
        const fn = tc.function as Record<string, unknown> | undefined;
        return fn?.name as string;
      });
      result.toolCallArgs = {};
      for (const tc of toolCalls) {
        const fn = tc.function as Record<string, unknown> | undefined;
        const name = fn?.name as string;
        try {
          result.toolCallArgs[name] = JSON.parse((fn?.arguments as string) || '{}') as Record<string, unknown>;
        } catch {
          result.toolCallArgs[name] = fn?.arguments as unknown as Record<string, unknown>;
        }
      }
      result.llmResponseSummary = JSON.stringify({
        content: (msg?.content || '').substring(0, 300),
        toolCalls: result.toolCallsMade,
        toolCallArgs: result.toolCallArgs,
        finishReason: choice?.finish_reason,
        usage: lastResponseData.usage,
      });
    }

    
    for (const toolMsg of agentResult.toolMessages) {
      result.engineResponseSummary += toolMsg.text.substring(0, 200) + ' | ';
    }

    
    result.gameTimeAfter = server.getFullState().gameTime ?? 0;
    result.timePassed = result.gameTimeAfter - result.gameTimeBefore;

    const charAfter = server.getFullState().party[0];
    result.concentrationAfter = charAfter?.concentrationSpellId ?? null;
    result.transformationAfter = !!charAfter?.runtime?.transformationState;

    
    if (result.timePassed > 0) {
      result.effects.push(`gameTime advanced by ${result.timePassed} min (${result.gameTimeBefore} → ${result.gameTimeAfter})`);
    }
    if (result.concentrationBefore !== result.concentrationAfter) {
      if (result.concentrationAfter) {
        result.effects.push(`concentration started: ${result.concentrationAfter}`);
      } else if (result.concentrationBefore) {
        result.effects.push(`concentration ended: ${result.concentrationBefore}`);
      }
    }
    if (result.transformationBefore !== result.transformationAfter) {
      result.effects.push(result.transformationAfter ? 'transformation started' : 'transformation ended');
    }
    if (charAfter?.conditions && charAfter.conditions.length > 0) {
      const condIds = charAfter.conditions.map(c => c.id);
      result.conditionChanges.push(`active conditions: ${condIds.join(', ')}`);
    }

    
    result.narrationReturned = agentResult.inlineNarration || '';

  } catch (e: unknown) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}


async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TIER 4 INTEGRATION TEST — Real LLM Calls');
  console.log('  50 scenarios × real API = full production pipeline');
  console.log('═══════════════════════════════════════════════════════════════\n');

  installFetchInterceptor();

  const results: ScenarioResult[] = [];
  const BATCH_SIZE = 5;
  const batches: Scenario[][] = [];
  for (let i = 0; i < SCENARIOS.length; i += BATCH_SIZE) {
    batches.push(SCENARIOS.slice(i, i + BATCH_SIZE));
  }

  console.log(`Running ${SCENARIOS.length} scenarios in ${batches.length} batches of ${BATCH_SIZE}...\n`);

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    console.log(`─── Batch ${bIdx + 1}/${batches.length} (scenarios ${batch[0].id}-${batch[batch.length-1].id}) ───`);

    const batchResults = await Promise.all(
      batch.map(async (scenario) => {
        
        mcpServer.reset();
        const hero = makeCharacter({ id: 'hero-1', name: 'Valerius' });
        mcpServer.joinParty(hero);

        
        if (scenario.setup) {
          scenario.setup(mcpServer);
        }

        const result = await runScenario(scenario, mcpServer);
        return result;
      })
    );

    results.push(...batchResults);

    
    for (const r of batchResults) {
      const status = r.error ? '❌' : '✅';
      const time = r.timePassed > 0 ? `+${r.timePassed}min` : '0min';
      const tools = r.toolCallsMade.length > 0 ? r.toolCallsMade.join(', ') : '(enforcement: narrate_turn)';
      console.log(`  ${status} #${String(r.id).padStart(2)} ${r.name.padEnd(25)} time=${time.padEnd(8)} tools=[${tools}]`);
    }
    console.log('');
  }

  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DETAILED REPORT — Every LLM Request/Response Cycle');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    console.log(`┌─ Scenario #${r.id}: ${r.name}`);
    console.log(`│  Player Action: "${r.prompt}"`);
    console.log(`│`);
    console.log(`│  📤 SENT TO LLM:`);
    console.log(`│    ${r.llmRequestSummary || '(no request captured)'}`);
    console.log(`│`);
    console.log(`│  📥 LLM RESPONSE:`);
    console.log(`│    ${r.llmResponseSummary || '(no response captured)'}`);
    console.log(`│`);
    console.log(`│  ⚙️ ENGINE EFFECTS:`);
    if (r.effects.length > 0) {
      for (const e of r.effects) console.log(`│    • ${e}`);
    } else {
      console.log(`│    • No time effects`);
    }
    if (r.conditionChanges.length > 0) {
      for (const c of r.conditionChanges) console.log(`│    • ${c}`);
    }
    if (r.concentrationBefore !== r.concentrationAfter) {
      console.log(`│    • Concentration: ${r.concentrationBefore || 'none'} → ${r.concentrationAfter || 'none'}`);
    }
    if (r.narrationReturned) {
      console.log(`│`);
      console.log(`│  📖 NARRATION: "${r.narrationReturned.substring(0, 150)}${r.narrationReturned.length > 150 ? '...' : ''}"`);
    }
    if (r.error) {
      console.log(`│`);
      console.log(`│  ❌ ERROR: ${r.error}`);
    }
    console.log(`└──────────────────────────────────────────────────\n`);
  }

  
  const totalScenarios = results.length;
  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => !!r.error).length;
  const toolCalls = results.filter(r => r.toolCallsMade.length > 0).length;
  const narrateTurnCalls = results.filter(r => r.toolCallsMade.includes('narrate_turn')).length;
  const timeAdvanced = results.filter(r => r.timePassed > 0).length;
  const avgTimePassed = results.reduce((s, r) => s + r.timePassed, 0) / totalScenarios;
  const maxTimePassed = Math.max(...results.map(r => r.timePassed));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total scenarios:          ${totalScenarios}`);
  console.log(`  Successful:               ${successful}`);
  console.log(`  Failed:                   ${failed}`);
  console.log(`  LLM made tool calls:      ${toolCalls}`);
  console.log(`  narrate_turn called:      ${narrateTurnCalls}`);
  console.log(`  Time advanced:            ${timeAdvanced}`);
  console.log(`  Avg timePassed:           ${avgTimePassed.toFixed(1)} min`);
  console.log(`  Max timePassed:           ${maxTimePassed} min`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  uninstallFetchInterceptor();
}

main().catch(e => {
  console.error('FATAL:', e);
  uninstallFetchInterceptor();
  process.exit(1);
});
