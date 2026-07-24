# DiceOnRails — Agent Guide

## Pre-commit documentation check
Before every commit, read `AGENTS.md`, `ARCHITECTURE.md`, and `README.md`, check whether any decisions, conventions, file additions, or architectural changes made during this session are documented. If not, update the relevant sections before committing. This ensures all doc files remain the source of truth alongside the code.

## Commands
- `npm run dev` — runs `scripts/preflight.js` (auto-installs deps) then Vite on port 3000
- `npm test` — `vitest run --bail=1` (stops on first failure; live tests excluded)
- `npm run test:ci` — same but verbose (run locally before pushing — no CI is currently configured)
- `npm run test:live` — live LLM integration tests (needs real API key)
- `npm run test:live:tier3` — scenario tests via `npx tsx tests/live/run_all.ts`
- `npm run lint` — `eslint . --ext .ts,.tsx`
- `npm run build` — `vite build` → `dist/`

## Pre-commit hooks (Husky)
- **pre-commit** (`.husky/pre-commit`): runs `npm run lint` then `npm test` on **separate lines** (not `&&`-chained) — a lint failure does NOT block the commit if tests pass, because the hook's exit code is that of the last command. Use `git commit --no-verify` to bypass.
- **commit-msg** (`.husky/commit-msg`): if a commit touches both test files (`*.test.*`) AND source files (`*.ts`, `*.tsx`), the message must start with `[RED]` or `[GREEN]`. Otherwise the hook rejects. Always split mixed commits or use `--no-verify`.

## CI
**Not currently configured.** No `.github/workflows/` directory exists in the repo — references to `.github/workflows/test.yml` are aspirational. Run `npm run lint` and `npm run test:ci` locally before pushing.

## Architecture
- **Entry**: `index.html` → `index.tsx` → `App.tsx`. The root returns `<SetupWizard />` unconditionally when `VITE_SETUP_MODE=true`, else `<SplashScreen>` then provider stack.
- **Provider order (must be preserved)**: `AuthProvider > UIProvider > GameProvider > ProgressionProvider > CampaignProvider > ActionsProvider`. Each consumes contexts above it.
- **State**: No external lib (no Redux/Zustand). 6 React Contexts, each backed by a custom hook. `GameContext` composes `useGameState` + `useQueue` — queue functions are spread directly into GameContext, not a separate context.
- **Engine**: `MockMCPServer` (`services/mcpService.ts`) is the single canonical source of truth for `GameState`. Never mutate `gameState` directly — always go through `mcpServer.executeToolCall` or its typed wrappers.
- **Sub-services**: `services/mcp/` — DI-style factories (`createXService(state, deps?)`) closing over shared state. 8 sub-services wired in `mcpService.ts:45-75`. All share the same mutable `state: GameState` reference. Cross-service deps use 4 interfaces: `InventoryDeps`, `CombatDeps`, `SpellcastingDeps`, `TravelDeps`. The `getTarget` function is always `this.party.getTarget`.
- **Deep clone**: `JSON.parse(JSON.stringify(...))` is the universal pattern for state snapshots, rewinds, and transactions (~20 uses). No `structuredClone`, no immutable lib.
- **Path alias**: `@/*` → repo root (not `src/`). Both `tsconfig.json` and `vite.config.ts` agree.

## State management patterns
- **`syncState()`** (GameContext): reads `mcpServer.getFullState()` → `setGameState()`. Pulls engine state into React. No persistence.
- **`syncFinished()`** (useGameActions private): attaches ctx metadata, sets `isProcessing: false`, deep-clones, calls `mcpServer.loadState()` + `setGameState()` + `storageService.syncCampaignState()`. Persists.
- **`syncCampaignState()`** (storageService): writes to Supabase or localStorage depending on `campaignId !== 'anonymous'`.
- **Two independent `processingRef`s**: `useGameActions` guards against concurrent `handleSendMessage` calls. `useGameState` `isProcessingRef` guards Supabase realtime subscription — incoming remote state is skipped when local processing is active.
- **`messagesRef` stale closure pattern**: `handleSendMessage` reads from `messagesRef.current` (a ref mirror of `messages`) instead of the closure-captured variable. It is NOT wrapped in `useCallback`. `handleSendMessageRef` pattern passes latest version to `handleRewind`.
- **`ctxRef` / `ctxLoadedRef` / generation rewind protocol**: Context manager state lives in a ref, hydrated once from `gameState.ctx` on mount. `generation` is bumped on rewind — syncs are tagged with generation, remote clients discard stale updates where `_rewindGeneration < local generation`.
- **`handleSendMessage` is NOT wrapped in `useCallback`** — it's a plain async function inside `useGameActions`, recreated every render.
- **`isSyncableCampaign`**: `campaignId != null && campaignId !== 'anonymous'`. The literal `'anonymous'` gates the entire cloud/local persistence split.

## LLM Agent Loop (`services/llm/agentLoop.ts`)
- **`MAX_ITERS = 20`**, 60s timeout per iteration, `temperature: 0.7`, `tool_choice: "auto"`.
- **Prompt assembly order**: system (SYSTEM_INSTRUCTION + PROGRESSION_SYSTEM_PROMPT + TOOL_MODE_INSTRUCTION) → frozen messages → mapped chat history → context message (combat state, enemies, active effects).
- **Tool calls are batched**: all tool calls from one LLM response run in **parallel** via `Promise.all`, then sorted by `id.localeCompare` for deterministic ordering.
- **End-of-turn detection**: `narrate_turn`, `long_rest`/`short_rest` (when called with `narration` **or** `autoAdvanceTime: true`), `move_to` (with `route`), OR **any action tool carrying `narration`/`timePassed` or `narrationOnSuccess`/`narrationOnFailure` (gated out of combat)**. When detected: pre-narration tools execute first, then `narrate_turn` (skipped if time already advanced), then loop breaks.
- **Inline turn finalization**: deterministic tools (`update_inventory`, `adjust_currency`, `log_lore`, `upsert_quest`, simple `move_to`) can carry `narration`+`timePassed`+`suggestions` to end the turn in one call. Binary dice tools (`check_skill`, `make_save`) can carry `narrationOnSuccess`+`narrationOnFailure`+`timePassed`+`suggestions` — the engine selects the correct branch from the actual roll outcome (zero-hallucination). The engine helper `maybeFinalizeTurn` (`mcpService.ts`) calls `narrate_turn` internally and merges the result. Only honored out of combat (OOC guard). Attacks and damage spells stay 2-call (numbers in prose require post-roll truthfulness).
- **`next_turn` causes immediate loop break** — the LLM cannot follow `next_turn` with `narrate_turn` in a later iteration. `narrate_turn` must be called before or simultaneously with `next_turn`.
- **Synthetic `narrate_turn(timePassed=0)` appended at loop end** if no time-advancing tool was called. This ensures conditions/DoTs/concentration always tick. The check is gated by `if (!timeAdvancedThisTurn)` — it is conditional, not unconditional.
- **No-tool-call retries**: raw `<tool_call>`/`<function>` text in content (model tool-calling format failure) → up to **2 corrective retries** with a targeted nudge before falling through to standard retries. Iter 0 empty → "You MUST call at least one tool". Iters 1-4 in combat (non-player turn only) → "call `next_turn`". Otherwise break.
- **Post-loop guarantee**: if no `narrate_turn` / rest / move-with-route / inline-finalize fired, a synthetic `narrate_turn(narration='', timePassed=0)` is enforced so DoTs/conditions tick.
- **Critical tool failure** (`cast_spell`, `inflict_damage`, `roll_dice`, `player_attack`) sets `criticalToolFailed`, suppressing inline narration even if >= 50 chars.
- **Token budget checked AFTER batch execution**, not before — can't prevent an iteration from exceeding budget.
- **Tool results sent to LLM**: the function `formatToolResult` (`narration.ts:58-83`) produces a slim per-tool JSON for LLM context (no full `data` blob). This is the single path; `extractRollData` (`narration.ts:19-50`) provides rich data for the UI separately.

### Tool system
**28 tool schemas** (29 dispatch cases, 1 default) in `executeToolCall` (`mcpService.ts:237-334`, switch at `:243-322`):
`check_skill` and `move_to` support **onSuccess chaining** via `ON_SUCCESS_PROPERTIES` shared schema — can auto-fire `awardCurrency`, `logLore`, `upsertQuest`, `updateInventory` in the same call.
All deterministic action tools (`update_inventory`, `adjust_currency`, `log_lore`, `upsert_quest`, `move_to`) support **inline finalization** via `END_OF_TURN_PROPERTIES` shared schema — can carry `narration`+`timePassed`+`suggestions` to end the turn in one call.
Binary dice tools (`check_skill`, `make_save`) support **branch finalization** via `BRANCH_NARRATION_PROPERTIES` — carry `narrationOnSuccess`+`narrationOnFailure`+`timePassed`+`suggestions`; the engine selects the branch from the actual roll (zero-hallucination).
| Tool | Sub-service | Notes |
|------|-------------|-------|
| `roll_dice` | travel | `sides\|\|20, count\|\|1, modifier\|\|0`. Vestigial attack params removed (model must use `player_attack`). |
| `add_enemy` | combat | |
| `start_combat` | combat | |
| `next_turn` | combat | No args forwarded. Engine attaches deterministic `data.narration` (from resolved enemy `attackResults[]`) + `data.suggestions` (contextual combat). Agent loop captures both at the break point so the fallback never fires in combat. |
| `end_combat` | combat | |
| `player_attack` | combat | Single `targetId` param (aliases removed). Supports `sharpshooter`, `greatWeaponMaster`. Damage/XP awarded atomically. |
| `move_to` | travel | Supports `END_OF_TURN_PROPERTIES` (simple path only; route path handles time internally). |
| `check_skill` | travel | `difficulty\|\|10`. Supports `BRANCH_NARRATION_PROPERTIES` and `ON_SUCCESS_PROPERTIES` (auto-XP internal). |
| `inflict_damage` | inventory | Accepts `targetId` OR `target_name`. On enemy defeat, **auto-awards combat XP** via `awardEnemyDefeatXp`. |
| `adjust_currency` | inventory | Supports `END_OF_TURN_PROPERTIES`. |
| `update_inventory` | inventory | `action\|\|'add'`. Supports `END_OF_TURN_PROPERTIES`. Accepts `items[]` array for batch loot in one call. |
| `upsert_quest` | content | Supports `END_OF_TURN_PROPERTIES`. |
| `log_lore` | content | `category\|\|'History'`. Supports `END_OF_TURN_PROPERTIES`. |
| `make_save` | combat | `stat\|\|'dex', dc\|\|10`. Supports `BRANCH_NARRATION_PROPERTIES`. |
| `roll_death_save` | combat | |
| `award_experience` | progression | **Combat XP is auto-awarded by the engine on enemy defeat** — the model must NOT call this for kills. Still used for non-combat awards (exploration, quests, roleplay). |
| `level_up` | progression | Dispatches to `allocateStatPoints`. Also chains `learnSpells[]`/`prepareSpells[]` to `manage_spellbook` automatically. |
| `long_rest` / `short_rest` | travel | |
| `cast_spell` | spells | Accepts `characterId` OR `casterId`. Target normalization: `targets[]` array (single target alias removed from schema but engine dispatch still accepts `targetId`/`target_name` for backward compat). |
| `spell_effect` | spells | `mode\|\|'counter'` |
| `manage_spellbook` | spells | Accepts `characterId` OR `targetId` |
| `use_resource` | spells | Accepts `characterId` OR `targetId`. (Tool schema lives in `tools/character.ts`, but dispatch routes to `spells.use_resource`.) |
| `summon_creature` | inline | |
| `teleport_creature` | inline | |
| `polymorph_creature` | inline | |
| `cast_ritual` | spells | **Auto-advances 10 minutes** (no separate `narrate_turn` needed since S3). |
| `narrate_turn` | travel | |

**ToolFilter** (`services/llm/toolFilter.ts`): always visible: `roll_dice`, `check_skill`, `update_inventory`, `adjust_currency`, `move_to`, `upsert_quest`, `log_lore`, `narrate_turn`, `make_save`, `use_resource`, `roll_death_save`, `cast_spell`, `manage_spellbook`, `spell_effect`, `add_enemy`, `start_combat`, `inflict_damage`. Hidden unless: `state.combat?.isActive` → `next_turn`, `end_combat`, `player_attack`; party has unused stat/skill points → `level_up`; party not at full → `short_rest`, `long_rest`; party has spells → `summon_creature`, `teleport_creature`, `polymorph_creature`, `cast_ritual`; combat NOT active → `award_experience`.

### Context pipeline (`services/llm/contextManager.ts`)
- **Active window**: last 20 messages, sent verbatim.
- **Frozen raw history**: older messages concatenated with `[Player]/[GM]/[System]` prefixes, capped at `VITE_CONTEXT_RAW_CAP` (30K tokens / 80K chars). Oldest 25% truncated when >80K chars.
- **Episode checkpoints**: LLM-generated summaries (~1.5K tokens, ~1000 words) written by summarization model. Append-only until eviction.
- **Compression triggers**: when `frozenRawTokens >= RAW_CAP` OR no checkpoints exist yet and `frozenRawTokens >= 1000`. Async, non-blocking.
- **Eviction (3-tier)**: 1) drop oldest checkpoints, 2) drop raw history, 3) trim oldest active messages (keep min 2).
- **Generation bumping on rewind**: `ctx.generation` incremented, stale in-flight compression results discarded by generation check.
- **Checkpoint compression prompt** (`atmosphere.ts:174-192`): dense ~1000-word archivist prompt preserving NPCs, quests, items, combat, skill checks, XP, lore, decisions. Uses `fetchWithTimeout` with a **120s primary timeout** and **one 180s retry on AbortError** (summaries are long-running; the old default 30s timeout caused silent `AbortError: signal is aborted without reason` failures). Also falls back to `message.reasoning_content` when `content` is empty.

## Testing conventions
- Vitest + jsdom. Setup in `tests/setup.ts` (polyfills `matchMedia`, `speechSynthesis`, `AudioContext`, `clipboard`).
- Coverage minimums: 55% statements, 43% branches, 50% functions, 60% lines.
- **Never mock `mcpService` when testing tool functions** — create a fresh `MockMCPServer` instance in `beforeEach`. Only mock `cryptoRoll` (random), `supabaseClient`, and `debug`.
- **Dynamic imports for mocked modules**: `const { cryptoRoll } = await import('../../utils/random')` must come AFTER `vi.mock(...)`. All test tool files follow this pattern.
- **Async vs sync**: all MCP tool methods (`add_enemy`, `start_combat`, `cast_spell`, `check_skill`) are `async`. `getFullState`, `getTarget`, `joinParty`, `awardExperience` are sync.
- **Reset mocks in `beforeEach`**: `vi.clearAllMocks(); vi.mocked(cryptoRoll).mockReset(); server = new MockMCPServer()`. Can be replaced by `createTestServer()` (from `tests/helpers/testServer.ts`) — same logic, one call.
- **Sequence random values**: chain `.mockReturnValueOnce(v1).mockReturnValueOnce(v2)` — last call may need `.mockReturnValue(vDefault)`.
- **Live tests** (`tests/live/`): the top-level `0X_*_live.test.ts` files (tier-3, run via `tsx tests/live/run_all.ts`) use a custom `runLiveTest` helper that prints `PASS`/`FAIL` and drives a real `MockMCPServer` with real randomness — but they still `import { expect } from 'vitest'` for assertions. The `tests/live/scenarios/*.test.ts` subdirectory **is** picked up by the default `npm test` run (the vitest exclude pattern is `tests/live/*_live.test.ts` — direct children only, NOT the `scenarios/` subfolder); those scenario files use full vitest (`describe`/`it`/`expect`/`vi`) and DO call `vi.mock('../../../utils/random', ...)` to stub `cryptoRoll`.
- **Hook tests**: use `renderHook` + `act` from `@testing-library/react`. Import dynamically after mocks.
- **Component tests**: need full mocks for `supabaseClient`, `audioService`, `authService`, `debug`.
- Test factories: `makeCharacter(overrides?)`, `makeWizard()`, `makeCleric()`, `makeEnemy()`, `makeCombatState()`, `makeGameState()`, `createTestRunner()`, `createMockAgentLoop()`, `createMockMCPServer()`, `mockRandom()`, `createTestServer()`.
- `no-explicit-any` and `non-null-assertion` are **errors everywhere** (set globally in `.eslintrc.cjs`, not just in tests). Test files additionally enforce `vitest/expect-expect` and strict `testing-library/*` rules.

## ESLint
- Globally error-level: `no-explicit-any`, `no-non-null-assertion`, `ban-ts-comment` (allows `ts-expect-error`, bans `ts-ignore`), `no-trailing-spaces`. Most other rules warn.
- Test override (`tests/**`): enables `vitest/expect-expect` and `testing-library/*` rules (no-node-access, no-container, no-await-sync-queries are errors; prefer-find-by is warn). It does **not** re-set `any`/`!` severity — those are already errors globally.

## Key conventions

### State
- Campaign ID `'anonymous'` is the sentinel for local-only play (no Supabase sync). All persistence methods check this.
- The ONLY way game time advances: `narrate_turn`, `long_rest`, `short_rest`, `move_to` (with narration/route), **or any action tool with inline narration** (`update_inventory`, `adjust_currency`, `log_lore`, `upsert_quest`, `check_skill`, `make_save`). A synthetic no-op `narrate_turn(timePassed=0)` is appended at loop end if no time-advancing tool ran (gated by `if (!timeAdvancedThisTurn)` at `agentLoop.ts:385-390`) so DoTs/conditions always tick.
- Never call `inflict_damage` after `player_attack` or `cast_spell` — those tools handle damage atomically.
- Spells never use `roll_dice`; spell attack rolls and damage are inside `cast_spell`.
- **`ensureCharacterFields()` / `ensureAllCharacterFields()` live in ONE place**: `services/characterUtils.ts`. Both `stateService` and `travelService` import it from there (not duplicated). `StateService.ensureCharacterFields()` delegates to `ensureAllCharacterFields(state.party)`.
- **`inflict_damage` lives in `InventoryService`**, not `CombatService`. Both CombatService and SpellcastingService depend on it. All damage in the system flows through one function.
- **Combat XP is auto-awarded on enemy defeat**: `awardEnemyDefeatXp` (`services/mcp/progressionService.ts`) hooks into `inflict_damage` — every kill path (player_attack, cast_spell, DoTs, enemy attacks) awards the enemy's `xp` value (party-split + solo +25% buff) idempotently via the `Enemy.xpAwarded` flag.
- **Transactions**: deep-clone via `JSON.parse(JSON.stringify(...))`. 3-tier: transaction (in-flight rollback), rewind point (full state+messages per turn), emergency snapshot (crash recovery).
- **Duplicate currency detection**: `adjust_currency` is suppressed within 500ms for same target+amount. Cleared on `restoreSnapshot` and `reset`.

### Engine mechanics
- **Exhaustion** (levels 1-6): applied as flat `d20Modifier: -level` on ALL d20 rolls (attacks, saves, checks, death saves) and `speedPenaltyFt: -(level * 5)`. Does NOT affect damage dice.
- **Single canonical death save path**: `combatEngine.rollDeathSave()` is now a thin wrapper that delegates to `diceEngine.rollDeathSave()` (the two are unified, no longer independent). Exhaustion is applied via `getExhaustionPenalty()` inside `diceEngine`. **Caveat**: `getDeathSaveBonus()` (Durable / Resilient-CON feat, `featsService.ts:196`) is defined and re-exported but **never called** by either path — the Durable death-save bonus is currently dead code.
- **Enemy attacks bypass `inflictDamageOnTarget`** — `resolveEnemySingleAttack` deals damage directly, skipping resistances/immunities/vulnerabilities/HAM/tempHP on targets.
- **Spell damage for save-based spells rolled independently per target** — each Fireball target gets its own damage roll.
- **Minute-duration conditions are skipped by round-based `tickConditions()`** — only `tickConditionsByTime()` handles them.
- **Conditions from concentration spells are tied by `source: spellId`** — when `breakConcentration` fires, ALL conditions with matching source are removed. Without `source`, conditions become orphans.
- **`isIncapsulated` typo** (conditionEngine.ts:217) must not be removed — it's an alias for `isIncapacitated` (at `:212`) and may exist in serialized game states.
- **Warlock pact magic** is the only short-rest slot reset. Checked in `recalculateResourcePools`. Warlock uses `pactMagic` (not `spellSlots`) — any code reading `spellSlots` blindly will break for warlocks.
- **`sanitizeNarration`** (`utils/textSanitize.ts`): strips `<tool_call>`/`<function>` blocks, ChatML special tokens (`<|im_end|>`, fullwidth variants), and `[System:…]` prefixes from any narration text. Applied at three layers: engine-side (narrate_turn dispatch, maybeFinalizeTurn, cast_ritual), inside generateNarration/generateNarrationStream returns (defense-in-depth), and at the ultimate chokepoint (`finalNarration` → `modelMsg.text` in useGameActions) so no LLM-sourced text reaches the bubble unsanitized.
- **`maybeFinalizeTurn`** (`mcpService.ts`): engine helper that collapses action+narrate_turn into one call. For deterministic tools, reads `narration`/`timePassed` from args and calls `narrate_turn` internally. For binary dice tools (check_skill, make_save), reads `narrationOnSuccess`/`narrationOnFailure` and selects by the actual roll result. OOC guard: only honored when combat is not active.
- **`awardEnemyDefeatXp`** (`services/mcp/progressionService.ts`): called automatically by `inflict_damage` when an enemy drops to 0 HP. Party-splits the enemy's `xp` value (or +25% solo buff), mutates state via engine `awardExperience`, guarded by `Enemy.xpAwarded` flag for idempotence.

### Character creation
- **Prepared vs Known caster asymmetry**: `buildCharacterFromWizard` sets `knownSpells` = cantrips only for prepared casters (wizard/cleric/druid/paladin), and `preparedSpells` = cantrips + selected spells. Known casters (bard/sorcerer/warlock/ranger) get both in `knownSpells`. The wizard UI only enforces max spells for known casters.
- **Half-Elf ASI is the string `'flexible-2'`**, not a normal `Record<string, number>`. Triggers +2 CHA + two +1 choices.
- **ASI/Feat slot indexing**: `asiFeatSlots` array index maps to `ASI_LEVELS[idx]` (`[1, 4, 8, 12, 16, 19]`). The `FeatSelection.level` field is NOT stored in wizard state — set during finalization.
- **`skilled` feat inlines skill allocations** — bypasses normal skill point pool, added in post-processing.
- **`goldPool` is floating point**: integer part = GP, fractional = SP (`12.5` = 12 GP, 5 SP). Uses `toFixed(2)` to avoid drift.
- **`level_up` tool dispatches to `allocateStatPoints`**, not the full level-up flow. The actual level-up validation happens elsewhere.
- **`buildCharacterFromWizard`** (8-step): name validation → location resolution → base stats → racial ASI → ASI/feat slots → con mod & racial traits → resource pools → assemble final Character.

### UI
- **Multiplayer-only UI** (`gameState.party.length > 1`): the Queue Action / Queue Dialogue buttons (`InputArea`, via `isMultiplayer` prop), the `ActionQueuePanel` + its desktop sidebar section / mobile drawer / mobile toggle, and the per-character tab bar (Desktop & Mobile layouts) are all hidden in solo play. The onboarding tour's "Action Queue" step is skipped via `OnboardingTour`'s `multiplayer` prop.
- **Quick Actions only pre-fill input text**, never send or queue. User must press Enter or click "Act Now"/"Queue Action".
- **ChatLog dual roll rendering**: structured `msg.rollData` → `<DiceRollCard>` (animated SVG dice). Regex-parsed text → `<RollCard>` (compact badge).
- **System message text stripping**: `formatMessageText()` removes `[System:identifier]` prefix via `/^\[System:[a-zA-Z0-9_-]+\]\s*/i`.
- **DesktopLayout**: resizable sidebar (200-520px), font scaling `0.625 + (sidebarWidth / 520) * 0.5`, scroll gradient at bottom.
- **MobileLayout**: 3-tab nav (adventure/character/journal), HpStatusBar, queue drawer (70vh, backdrop blur).
- **ChatLog uses triple `requestAnimationFrame`** for initial scroll-to-bottom to wait for layout + animations.
- **SettingsModal builds `buildDebugLog()`** including full party state, combat, enemies, last dice roll, chat log — copied to clipboard.
- **Styling**: Tailwind via CDN (`cdn.tailwindcss.com`), Font Awesome 6.4, Google Fonts (Crimson Pro for narration, Inter for body). Custom CSS in `index.html` (scrollbar, keyframes, markdown styles, dot-grid background).

### Persistence
- **Sync coalescing**: `enqueueSync`/`drain` batches multiple `syncCampaignState` calls within the same microtask into a single Supabase `UPDATE`. Uses `queueMicrotask`, not `setTimeout`. Merge semantics: multiple calls for same campaignId within one tick are merged.
- **Supabase Proxy** (`supabaseClient.ts`): `then`/`catch`/`finally` return `undefined` to prevent the proxy from being treated as a thenable/Promise. All other properties delegate to the real client with methods auto-bound.
- **Supabase tables**: `campaigns(id, host_id, name, game_state JSONB, messages JSONB)`, legacy `game_saves`, `srd_items`, `srd_monsters`. The runtime uses static TS catalogs (`data/`) — SQL tables are for community tooling.
- **auditor.ts**: 16 audit rules (hp-bounds, currency-non-negative, inventory-quantity-non-negative, character-location-exists, unique-lore-entries, quest-id-unique, xp-non-negative, unused-stat-points-valid, experience-to-next-level-positive, feats-valid, classes-valid, races-valid, spells-valid, proficiency-valid, game-time-valid, last-long-rest-valid) with auto-repair. Not wired into runtime, available for diagnostics/tests. Each rule mutates a running copy of state.
- **`cryptoRoll`** (`utils/random.ts`): rejection sampling over `Uint32Array(1)` from `crypto.getRandomValues` to avoid modulo bias. Falls back to `Math.random()` if crypto unavailable.
- **Streaming client** (`services/streamingClient.ts`): async generator parsing SSE. 60s read-timeout watchdog reset on every `reader.read()`. Yields `content`, `reasoning`, `tool_calls`, `usage`, `done`, `error` chunks.

### Agent loop prompts
- **`SYSTEM_INSTRUCTION`** (`constants.ts:8-39`): 14 numbered rules (mandatory tool usage, currency math, equipped weapon narration, time/durations, English only, etc.)
- **`PROGRESSION_SYSTEM_PROMPT`** (`constants.ts:42-83`): XP calibration tables, CR-to-XP, DC-to-XP, solo +25% buff, mandatory concurrent `award_experience` pairing.
- **`TOOL_MODE_INSTRUCTION`** (`services/llm/prompts/toolModePrompt.ts`, 93 lines): strict combat sequence, quick reference table, 11 feat descriptions, class feature narration, race trait guidance, spell prerequisites, ban on `[System:tool_name]` in narration, plus ban on emitting `<tool_call>`/`<function>` markup in content or narration (only use the structured `tools` parameter).
- **Narration fallback chain** (4 tiers, in `useGameActions.ts` + `services/llm/narration.ts`): 1. `inlineNarration` from the agent loop (now also captures assistant prose / `reasoning_content` emitted alongside tool calls — previously dropped — see `agentLoop.ts` `lastNarrationCandidate`); 2. `generateNarration` retry (must be ≥25 chars post-sanitize); 3. `generateNarrationSimple` — minimal-prompt LLM retry at `temperature: 0.9`, fires only when tiers 1+2 produced nothing usable; 4. `buildDeterministicNarration(toolMessages)` — zero-LLM one-liner derived from the turn's `rollData` (e.g. "The strike lands for 12 damage."), always truthful; → finally literal `"The adventure continues..."` (only when no tool data exists). All four tiers share the ≥25-char post-sanitize gate except tier 4 which produces short deterministic strings. `resolveNarration` (`useGameActions.ts:157-162`) is still a degenerate stub returning `inlineNarration ?? 'The adventure continues...'`; the tiered logic lives directly in `handleSendMessage`/`handleExecuteBatch`. **`reasoning_content` handling**: `generateNarration`, `generateNarrationSimple`, the agent loop's narration-candidate tracking, and `compressRawToCheckpoint` all prefer `message.content` then fall back to `message.reasoning_content` (deepseek-v4-flash often leaves `content` empty).
- **Combat narration via `next_turn`**: combat is driven by `next_turn`, which produces no narration prose of its own and breaks the loop before the narration-capture block (`agentLoop.ts:416`). The engine attaches a deterministic `data.narration` (built from resolved `attackResults[]`, zero-hallucination) and `data.suggestions` (contextual: heal wounded / attack / cast) to the `next_turn` result in `combatService.next_turn`. The agent loop captures both at the break point (`agentLoop.ts:416-440`) so the fallback and empty suggestion tray never fire during combat. LLM-provided narration (via `narrate_turn`) still takes priority.
- **`extractRollData`** (`narration.ts:20`): extracts structured `RollData` from tool results for UI display. Covers `roll_dice`, `check_skill`, `player_attack`, `cast_spell`, `make_save`, `roll_death_save`, `inflict_damage`, `use_resource`, and `next_turn`. Returns a `RollData[]` when multiple cards are needed — `player_attack` (attack + damage card on hit), `cast_spell` (attack + damage card when both exist), `next_turn` (attack + damage card per resolved enemy attack). Single rolls return a `RollData` object. Return type is `RollData | RollData[] | undefined`.
- **`Message.rollData`** (`types/common.ts:76`): `RollData | RollData[]` — supports multiple cards per message (e.g. multi-enemy `next_turn`). `ChatLog.tsx` normalizes to an array for rendering. Old persisted single-object messages remain valid.
- **`dispatchToolRolls`** (`gameActionHelpers.ts:83`): fires the `<DiceRollModal>` popup per tool. Handles `roll_dice`, `player_attack` (attack modal + damage modal on hit at +3400ms), `check_skill`, `make_save`, `roll_death_save`, `cast_spell` (attack + damage at +3400ms), `use_resource`, `inflict_damage`, `start_combat`, and `next_turn` (loops `attackResults[]`, staggered `setTimeout` fire-and-forget — does not block the agent loop).
- **`formatToolResult`** (`narration.ts:58-83`): produces a slim per-tool JSON for the LLM context (the `tool` messages fed to each subsequent iteration). This is the single source of truth for what the LLM sees; the full `data` blob is never sent back.

## Environment
- Required: `VITE_LLM_API_KEY`. Others optional. See `.env.example`.
- Default LLM model: `deepseek/deepseek-v4-flash`. Default summarizer: `xiaomi/mimo-v2.5`.
- `VITE_CONTEXT_RAW_CAP` (default 30000) — token threshold before raw history compresses to checkpoint. `VITE_CONTEXT_BUDGET` (default 180000) — hard cap before eviction.
- Setup mode auto-launches if `.env` is missing. Web wizard writes `.env` via dev-server middleware at `/__setup/save`.
- In production, set `VITE_LLM_API_BASE=/api` to route through the Vercel proxy (`api/chat/completions.ts`), solving CORS.
- `VITE_LLM_PROXY_TARGET` overrides the proxy target. Three-tier fallback: `VITE_LLM_PROXY_TARGET` → `VITE_LLM_API_BASE` → `https://opencode.ai/zen/go/v1`.
- Env vars accessed via `getEnv()`: tries `import.meta.env` first, falls back to `process.env`. Never throws. **Truthy-only**: empty strings return `undefined`.
- `VITE_LLM_DISABLE_THINKING=true` disables reasoning traces (sends `{ thinking: { type: 'disabled' } }`).
- **preflight.js** requires `.env` to contain the literal string `VITE_SUPABASE_URL` to skip setup mode. Even `VITE_SUPABASE_URL=` (empty value) satisfies this.

## Build quirks
- `npm run dev` goes through `scripts/preflight.js` (auto-install, env check) before spawning `vite` as a child process. Not a direct `vite` call.
- Setup mode is detected TWICE: `preflight.js` sets env var, `vite.config.ts` re-verifies by reading `.env`. Config wins.
- Build chunking: 4 vendor chunks (`vendor-react`, `vendor-supabase`, `vendor-vercel`, `vendor-ui`). Everything else in default chunk.
- Vitest `include` is `tests/**/*.test.{ts,tsx}` (not alongside source). `css: true` processes CSS imports. `globals: true` makes `describe`/`it`/`expect` available without imports.
- **Untested services**: `services/llm/contextManager.ts`, `services/mcp/partyService.ts`, `services/supabaseClient.ts` have no direct test coverage. Be cautious editing them.

## Type system invariants
- `Character.stats` is always `{ str, dex, con, int, wis, cha }` — exactly 6 keys. Same for `Enemy.stats?`.
- `Character.hp.current` is clamped to `[0, max]` by every tool that modifies HP. Same for `hitDice.current` and `resources[].current`.
- `SpellDefinition.level: 0` = cantrip. Cantrips use `cantripScaling`, levelled spells use `scaling`.
- `ActiveCondition.durationUnit` defaults to `'round'` when undefined. `'minute'`/`'permanent'` skipped by `tickConditions()`.
- `CombatState.isActive` must be true when `combat` is present. `initiative` must have >= 1 entry, `round >= 1`.
- `Character.subclassId` and subclass-specific fields (`divineDomain`, `sorcerousOrigin`, `warlockPatron`, `arcaneTradition`, `fightingStyle`, `sneakAttackDice`, `draconicAncestry`) are mutually exclusive by class.
- `ReactionAvailable` / `ReactionUsedThisTurn` pair: `reactionUsedThisTurn = false` reset at start of each character's turn.
- `CombatState.activeDoTs[].remainingRounds: null` = indefinite (persists until saved against or dispelled).
