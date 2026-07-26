# Architecture

> Developer reference for DiceOnRails. This is the source of truth for the file layout, services, data flow, and how every subsystem ties together.

For a friendly introduction, see **[README.md](./README.md)** first.

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Top-Level Layout](#2-top-level-layout)
3. [Application Bootstrap & Stage Machine](#3-application-bootstrap--stage-machine)
4. [State Management: The Context Layer](#4-state-management-the-context-layer)
5. [The Game Engine (`services/mcpService.ts`)](#5-the-game-engine-servicesmcpservicets)
6. [The LLM Subsystem (`services/llm/`)](#6-the-llm-subsystem-servicesllm)
7. [The Turn Lifecycle (end-to-end)](#7-the-turn-lifecycle-end-to-end)
8. [Context Pipeline (memory & token budget)](#8-context-pipeline-memory--token-budget)
9. [Engine Subsystems](#9-engine-subsystems)
10. [Persistence Layer](#10-persistence-layer)
11. [Character Creation Pipeline](#11-character-creation-pipeline)
12. [Components & UI Layouts](#12-components--ui-layouts)
13. [Types System](#13-types-system)
14. [Static Game Data](#14-static-game-data)
15. [Build, Test & CI](#15-build-test--ci)
16. [Configuration Reference](#16-configuration-reference)
17. [Key Invariants & Conventions](#17-key-invariants--conventions)

---

## 1. Technology Stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5.8 (strict mode, `noImplicitAny`, `strictNullChecks`) |
| UI | React 19.2 |
| Build tool | Vite 6.2 (`@vitejs/plugin-react`) |
| Styling | Tailwind via CDN + custom CSS in `index.html`; Font Awesome 6; Google Fonts (Crimson Pro / Inter) |
| State | React Context + hooks (no Redux/Zustand) |
| Backend / DB | Supabase (Postgres + Realtime + Auth) |
| AI transport | OpenAI-compatible Chat Completions API over `fetch` + SSE streaming |
| AI provider | OpenRouter by default; any OpenAI-compatible endpoint works |
| Image gen | ImageRouter (`stabilityai/sdxl-turbo` default) |
| Markdown | `react-markdown` |
| Tests | Vitest 4 + `@testing-library/react` + `jsdom` |
| Lint | ESLint 8 + `@typescript-eslint` |
| Git hooks | Husky 9 |
| Deploy | Vercel (SPA + serverless proxy) |
| Analytics | `@vercel/analytics` + `@vercel/speed-insights` |

`moduleResolution: bundler`, `target: ES2022`, JSX via `react-jsx`. Path alias `@/*` → repo root.

---

## 2. Top-Level Layout

```
DiceOnRails/
├── api/                      # Serverless functions (Vercel)
│   └── chat/completions.ts   # CORS proxy to upstream LLM provider
├── App.tsx                   # Root component: stage machine + providers
├── index.tsx                 # ReactDOM.createRoot entry
├── index.html                # Vite HTML shell (Tailwind CDN, fonts, animations)
├── constants.ts              # Re-exports + SYSTEM_INSTRUCTION + INITIAL_CHARACTER
├── components/               # All React UI components
│   ├── compendium/           # Compendium modal tabs (Glossary, Conditions, Rules, Spells, Items)
│   ├── creation/             # Character creation wizard (12+ steps)
│   ├── dice/                 # DiceEngine component
│   ├── layouts/              # DesktopLayout, MobileLayout
│   ├── levelup/              # Level-up modal panels
│   ├── modals/               # Extracted detail modals (Spell, Item, Condition)
│   ├── onboarding/           # OnboardingTour, WelcomeChips
│   ├── shared/               # Reusable atoms (HpBar, BaseModal, Toggle, …)
│   ├── sheet/                # CharacterSheet subpanels (SpellPanel)
│   ├── ui/                   # Generic Tooltip primitive (portal + mobile long-press)
│   ├── wizard/               # Generic StepWizard framework + shared ASI/skill UI
│   └── *.tsx                 # Top-level screens & modals (incl. CompendiumModal, QuickStartFlow, StartModeScreen)
├── contexts/                 # 6 React Context providers
├── data/                     # Static SRD catalogs + reference data (classes, races, spells, conditionInfo, glossary, referenceConstants, …)
├── hooks/                    # 10 custom hooks backing the contexts
├── public/                   # Static assets (splash-bg.png)
├── scripts/                  # Node tooling (preflight, installer, benchmarks)
├── services/                 # All business logic
│   ├── llm/                  # LLM client, agent loop, narration, context mgmt
│   │   ├── prompts/          # System/tool-mode prompts
│   │   └── tools/            # OpenAI function-calling tool schemas
│   ├── mcp/                  # Sub-services consumed by MockMCPServer
│   └── *.ts                  # Engine + infra services
├── supabase/migrations/      # SQL schema (campaigns, game_saves, srd_items, srd_monsters)
├── tests/                    # Vitest test suite
│   ├── helpers/              # Test factories & mocks
│   ├── live/                 # Tier-3+ live LLM scenario tests
│   ├── services/ hooks/ components/ utils/
├── types/                    # All TypeScript types (character, combat, spell, game, common)
├── utils/                    # Pure helpers (random, dice, time, env, catalogs)
├── .env.example              # Documented env-var template
├── .eslintrc.cjs
├── vite.config.ts            # Dev server, setup-wizard middleware, proxy, build chunks
├── vitest.config.ts
├── tsconfig.json
└── vercel.json               # SPA rewrites
```

---

## 3. Application Bootstrap & Stage Machine

### Entry chain

`index.html` → `/index.tsx` → `App.tsx` (default export).

`App.tsx:45-69` — the root `App` component decides what to render:

1. If `import.meta.env.VITE_SETUP_MODE === 'true'` → render `<SetupWizard />` (first-run installer that writes `.env`). The flag is injected by `vite.config.ts` based on whether `.env` contains `VITE_SUPABASE_URL`.
2. `initAudio()` on mount (primes `speechSynthesis` voices).
3. Show `<SplashScreen />` once per page load (purely decorative).
4. Wrap the rest in the provider stack:

```
AuthProvider
└─ UIProvider
  └─ GameProvider
    └─ ProgressionProvider
      └─ CampaignProvider
        └─ ActionsProvider
          └─ <AppContent />
```

The order matters: each provider consumes the contexts above it.

### Stage machine

`AppStage` enum (`types/common.ts:10`) drives the entire UX:

| Stage | Rendered by `AppContent.getContent()` | When |
|---|---|---|
| `AUTH` | `<AuthScreen />` | No user id and not anonymous |
| `DASHBOARD` | `<CampaignDashboard />` | User signed in, not yet in a campaign |
| `START_MODE` | `<StartModeScreen />` | New/joined campaign, choosing Quick Start vs. Custom |
| `QUICK_START` | `<QuickStartFlow />` | Quick Start path — pick a preset character, then starting grounds |
| `CREATION` | `<WizardShell />` | Custom path — full character creation wizard |
| `PLAY` | `<DesktopLayout />` or `<MobileLayout />` (wrapped in `<ErrorBoundary>`) | Active game |

Layout choice (`isMobile`) comes from `UIContext` which listens to `window.innerWidth < 768`.

Overlays rendered on top regardless of stage: `<SettingsModal>`, `<CampaignModal>`, `<DiceRollModal>`, `<QueueNotification>`, `<CompendiumModal>` (reference browser), `<OnboardingTour>` (PLAY stage only), plus `<Analytics />` and `<SpeedInsights />`.

A `useEffect` in `AppContent` does a one-time "warmup" POST to the LLM (a `ping` with `max_tokens: 1`) when entering the PLAY stage — this primes the provider's cache for faster first-turn response.

---

## 4. State Management: The Context Layer

There is **no external state library**. Six contexts, each backed by a hook, expose a flat API to the rest of the app.

| Context | Hook | File | Owns |
|---|---|---|---|
| `AuthContext` | `useAuth` | `hooks/useAuth.ts` | `userId` (from Supabase session), `setUserId`, `handleLogout` |
| `UIContext` | `useSettings` + local state | `contexts/UIContext.tsx` | `AppSettings`, settings modal open state, `isMobile`, dice-roll modal data |
| `GameContext` | `useGameState` + `useQueue` | `contexts/GameContext.tsx` | `GameState`, `messages`, `stage`, campaign id/name, character ids, queue actions, atmosphere updates |
| `ProgressionContext` | `useProgression` | `contexts/ProgressionContext.tsx` | Level-up modal state, stat allocations, feat/subclass choices |
| `CampaignContext` | `useCampaigns` | `contexts/CampaignContext.tsx` | Campaign list CRUD, create/join/delete/rename |
| `ActionsContext` | `useGameActions` + local | `contexts/ActionsContext.tsx` | `handleSendMessage`, `handleRewind`, `handleExecuteBatch`, `handleCharacterCreated`, `handleResolveEnemyTurn` |

Every context throws if `useXContext` is called outside its provider (`Error: useXContext must be used within XProvider`). The contexts compose the underlying hooks — the hooks themselves are also independently testable and are the actual loci of logic.

### Two singletons

- **`mcpServer`** — proxy around `MockMCPServer`, defined in `services/mcpService.ts:344` (singleton getter `getMcpServer` at `:339`). Lazy-instantiated, accessed globally.
- **`supabase`** — proxy around the Supabase client, defined in `services/supabaseClient.ts:27`. Lazy-instantiated, falls back to placeholder URLs if env is missing.

Both are `Proxy` objects that bind method calls to a lazily-created underlying instance, so importing them never crashes even when misconfigured.

---

## 5. The Game Engine (`services/mcpService.ts`)

The single most important file in the repo. The `MockMCPServer` class is the **in-memory source of truth for game state**. "Mock" is historical — it's a real engine, just in-process (vs. an external MCP server).

### State

Holds a single `GameState` object (shape in `types/game.ts:46`):

```ts
GameState = {
  party: Character[],            // all PCs
  worldDescription: string,
  sessionLogs: string[],
  quests: Quest[],
  lore: LoreEntry[],
  startingLocation?: StartingLocation,
  locationImages?: Record<string, string>,   // name → image URL cache
  currentAtmosphereUrl?: string,
  isProcessing?: boolean,                     // multiplayer lock
  processingUser?: string,
  actionQueue: QueuedAction[],                // multiplayer queued turns
  combat?: CombatState,
  lastDiceRoll?: { sides, count, modifier, results, total },
  ctx?: ContextMetadata,                      // context pipeline state
  gameTime?: number,                          // minutes since epoch
  lastLongRestTime?: number,
  _tiredWarningFired?: boolean,
  factionReputations?: Record<string, number>,
  lastSuggestions?: string[],                 // suggested next actions, cached per turn (4-tier fallback chain — see AGENTS.md)
}
```

### Service composition

`MockMCPServer` delegates to **8 sub-services** in `services/mcp/`, all created in the constructor and sharing the same `state` reference:

| Sub-service | File | Domain |
|---|---|---|
| `stateManager` | `stateService.ts` | load/reset/snapshot, transactions, rewind points, emergency snapshots, field initialization |
| `party` | `partyService.ts` | add/replace characters, look up by id/name, expose `campaign://` resources |
| `inventory` | `inventoryService.ts` | items, currency, damage application |
| `combat` | `combatService.ts` | initiative, attacks, enemy AI, saves, death saves |
| `spells` | `spellcastingService.ts` | spell casting, slots, concentration, rituals, counterspell/dispel |
| `progression` | `progressionService.ts` | XP, leveling, stat allocation |
| `content` | `contentService.ts` | quests, lore, reputation |
| `travel` | `travelService.ts` | movement, routes, narration/time, rests, dice, skill checks |

Sub-services are factory functions (`createXService(state, deps?)`) that close over the shared `state` and a small dependency object. The wiring lives in `mcpService.ts:45-75`. This is a lightweight **dependency injection** pattern — combat needs `inflict_damage` from inventory, travel needs `update_inventory`/`adjust_currency` from inventory + `log_lore`/`upsert_quest` from content, etc.

### Tool dispatcher

`MockMCPServer.executeToolCall(name, args)` (`mcpService.ts:237-334`, switch at `:243-322`) is the **canonical entry point for all mutations**. It's a switch over ~30 tool names. Every branch:

1. Coerces args to the correct types (LLMs send strings; engine needs numbers).
2. Delegates to the relevant sub-service method.
3. For certain tools (deterministic actions, binary dice checks), wraps the result through **`maybeFinalizeTurn(args, result)`** — an engine helper that collapses action+narrate_turn into one call. It reads `narration`/`timePassed` (deterministic) or `narrationOnSuccess`/`narrationOnFailure` (branch, selected by the actual roll outcome) from the tool args, calls `narrate_turn` internally, and merges the narration into `data.narration` (for the bubble) while keeping time-advancement logs in the `message` (for the system log). Only honored out of combat (OOC guard).
4. Returns an `MCPResponse = { success: boolean; data: any; message?: string }`.

This same method is called by the agent loop **and** by the React layer (e.g. `mcpServer.resolveAllPendingEnemyTurns()` from `ActionsContext.handleResolveEnemyTurn`).

Combat XP is auto-awarded on enemy defeat: `inflict_damage` calls `awardEnemyDefeatXp(state, enemy)` which awards CR-based XP flat to all party members via `xpEngine.computeXp('combat', ...)` idempotently via the `Enemy.xpAwarded` flag.

### Transactions, snapshots & rewind

The state manager supports:
- **`beginTransaction / rollbackTransaction / commitTransaction`** — deep clone for atomic ops (used by batched party turns).
- **`captureRewindSnapshot`** — captures the in-flight transaction snapshot.
- **`saveRewindPoint(gameState, messages)` / `loadRewindPoint`** — full state+messages snapshot saved before every player turn so a "retry" can restore it.
- **`saveEmergencySnapshot / loadEmergencySnapshot`** — second-chance snapshot in case the rewind point itself was lost.

`handleRewind` in `hooks/useGameActions.ts:333-423` orchestrates all of this and either replays the user's message or falls back to the emergency snapshot.

---

## 6. The LLM Subsystem (`services/llm/`)

```
services/llm/
├── index.ts              # Re-exports
├── agentLoop.ts          # runAgentLoop — the multi-turn tool-use driver
├── llmApiClient.ts       # resolveLLMConfig, mapHistoryToMessages, fetchWithTimeout
├── narration.ts          # generateNarration, generateNarrationStream, extractRollData, formatToolResult
├── atmosphere.ts         # generateAtmosphere (image), generateStartingLocations, compressRawToCheckpoint
├── portrait.ts           # generatePortrait (character portrait image), buildPortraitPrompt
├── contextManager.ts     # Token-budget enforcement + episode-checkpoint pipeline
├── tokenEstimation.ts    # Heuristic length→token estimator + budget constants
├── toolDefinitions.ts    # Re-export shim (tools + TOOL_MODE_INSTRUCTION)
├── toolFilter.ts         # Strips irrelevant tools from the schema based on state
├── prompts/
│   └── toolModePrompt.ts # TOOL_MODE_INSTRUCTION — the giant system instruction
└── tools/                # OpenAI function-calling schemas (one file per domain)
    ├── index.ts          # Aggregates all tool defs into `tools[]`
    ├── shared.ts         # Shared JSON-schema fragments
    ├── combat.ts         # add_enemy, start_combat, next_turn, end_combat, player_attack, inflict_damage
    ├── spells.ts         # cast_spell, spell_effect, cast_ritual, manage_spellbook, summon_creature, teleport_creature, polymorph_creature
    ├── character.ts      # roll_dice, check_skill, make_save, roll_death_save, level_up, use_resource
    ├── inventory.ts      # update_inventory, adjust_currency
    ├── movement.ts       # move_to, narrate_turn
    ├── journal.ts        # upsert_quest, log_lore
    └── rest.ts           # long_rest, short_rest
```

### `tools[]`

A flat array of OpenAI-style `{ type: "function", function: { name, description, parameters } }` definitions. Aggregated in `tools/index.ts:10`. The `description` of each tool is **the most important cue the LLM gets** for picking the right one — they're written in a punchy, instruction-heavy style ("COMBAT. Adds an enemy combatant. Call this BEFORE start_combat.").

**`shared.ts`** provides three reusable JSON-schema fragments:
- **`ON_SUCCESS_PROPERTIES`** — chaining block for `check_skill`/`move_to`: auto-fire `awardCurrency`, `logLore`, `upsertQuest`, `updateInventory` on success.
- **`END_OF_TURN_PROPERTIES`** — optional `narration` + `timePassed` + `suggestions` for deterministic tools (`update_inventory`, `adjust_currency`, `log_lore`, `upsert_quest`, simple `move_to`). When present, the engine calls `narrate_turn` internally and ends the turn in one call (OOC only).
- **`BRANCH_NARRATION_PROPERTIES`** — optional `narrationOnSuccess` + `narrationOnFailure` + `timePassed` + `suggestions` for binary dice tools (`check_skill`, `make_save`). The engine selects the branch matching the actual roll outcome, so the LLM never decides which prose is used (zero-hallucination).

### `TOOL_MODE_INSTRUCTION`

`services/llm/prompts/toolModePrompt.ts` — a ~93-line supplement appended to the system prompt during the agent loop. It contains:
- The strict combat sequence (`start_combat` → `player_attack` → `next_turn` → `narrate_turn`)
- A "QUICK REFERENCE" table mapping natural-language verbs to tools
- Guidance for ending a turn in ONE call via inline narration (deterministic) or branch narration (binary dice), with the OOC guard noted
- Instructions to put ALL narration in the `narration` field (never in `content`), enforcing a single source of truth
- Class-feature narration guidance (Rage, Sneak Attack, Fighting Style, …)
- Race-trait narration guidance (Darkvision, Lucky, Hellish Resistance, …)
- Spell-combat prerequisites ("Enemies must be registered FIRST")
- An outright ban on writing `[System:tool_name]` patterns or raw `<tool_call>`/`<function>` markup in narration/content; only the structured `tools` parameter may be used

### `resolveLLMConfig`

`llmApiClient.ts:11` — picks model, URL, and headers based on env (`VITE_LLM_MODEL`, `VITE_LLM_API_BASE`, `VITE_LLM_API_KEY`) and an optional provider override. The provider resolution logic is in `services/llmClient.ts`:

- `resolveProvider` → `'openai'` if the base isn't openrouter.ai, else `'openrouter'`
- `normalizeModelName` → strips the `vendor/` prefix for non-OpenRouter bases (OpenAI's API doesn't accept `deepseek/...`)
- `buildChatCompletionUrl` / `buildChatCompletionHeaders` — OpenRouter needs `HTTP-Referer` and `X-Title` headers; OpenAI doesn't

### `streamChatCompletion`

`services/streamingClient.ts` — an **async generator** that parses Server-Sent Events. Emits typed chunks: `content`, `reasoning`, `tool_calls`, `usage`, `done`, `error`. Includes a 60s-read-timeout watchdog. Used by `generateNarrationStream`; the agent loop itself uses non-streaming `fetch` because it needs the full tool-call payload per iteration.

### `filterTools`

`toolFilter.ts` — shrinks the tool schema sent to the LLM based on current state. Examples: hide `next_turn`/`player_attack` outside combat; hide `long_rest`/`short_rest` when the party is full; hide `cast_ritual`/`summon_creature` if nobody has spells. Smaller schema = lower latency, less confusion.

---

## 7. The Turn Lifecycle (end-to-end)

The single most important flow to understand. Entry point: `useGameActions.handleSendMessage` in `hooks/useGameActions.ts:182`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ handleSendMessage(text)                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
  │
  ├─ 1. Bail if already processing (processingRef / gameState.isProcessing)
  ├─ 1b. Remote pre-check: if syncable campaign, SELECT isProcessing from Supabase.
  │      Abort if true. (Fail-open on error; anonymous campaigns skip.)
  ├─ 2. Build userMsg, append to messages
  ├─ 3. Lock the campaign:
  │      - mcpServer.loadState({ ...state, isProcessing: true, processingUser })
  │      - storageService.syncCampaignState(...) so other players see the lock
  ├─ 4. Snapshot for rewind:
  │      - mcpServer.saveRewindPoint(currentState, [...msgs, userMsg])
  │      - mcpServer.saveEmergencySnapshot(currentState)
  │
  ├─ 5. prepareContext(...) → { frozen, activeMessages }
  │      (episode checkpoints + frozen raw history prepended; budget enforced)
  │
  ├─ 6. Decide what kind of input this is:
  │      - isClientSideAction  → starts with "[" (e.g. potion-use from sheet)
  │      - isTrivialInput      → "hi", "ok", "lol" (regex matchers, <40 chars)
  │      - otherwise: real action → run the agent loop
  │
  ├─ 7. runAgentLoop(history, contextString, frozen, onToolResult, opts)
  │      ↓ see "Inside runAgentLoop" below
  │      Returns: { toolMessages, inlineNarration, suggestions, usage }
  │      inlineNarration may come from nartate_turn, an inline-finalized action tool,
  │      or a branch (engine-selected by roll). Sanitized at agent-loop return.
  │
  ├─ 8. Append toolMessages + a placeholder model message
  │
  ├─ 9. resolveNarration(text, toolMessages, inlineNarration, …)
  │      - Degenerate stub returning inlineNarration ?? 'The adventure continues...'.
  │        The actual tiered fallback lives directly in handleSendMessage:
   │        1. inlineNarration from agent loop (content-prose / tool-result /
   │           narrate_turn-args only — NEVER reasoning_content, never prose
   │           alongside tool calls; see no-bleed rule in AGENTS.md).
  │        2. generateNarration retry (≥25 chars post-sanitize).
  │        3. generateNarrationSimple — minimal-prompt LLM retry at temp 0.9.
  │        4. buildDeterministicNarration — zero-LLM one-liner from rollData.
  │        → literal "The adventure continues..." only when no tool data exists.
  │      All LLM outputs are sanitized inside the function AND at the final
  │      modelMsg.text chokepoint in handleSendMessage.
  │
  ├─ 10. autoSpeak(modelMsg.text) — TTS if settings.autoSpeak
  │
  ├─ 11. syncFinished(messagesToSync):
  │       - ctxRef → game_state.ctx metadata
  │       - mcpServer.loadState({ ...state, isProcessing: false })
  │       - storageService.syncCampaignState(...)
  │
  ├─ 12. runContextPipeline(): increment turnCounter, maybe freeze messages,
  │       maybe compress raw → checkpoint asynchronously
  │
  └─ 13. finally: setIsLoading(false); syncState();
```

### Inside `runAgentLoop`

`services/llm/agentLoop.ts:67` (JSDoc starts at `:56`). A bounded loop (default `MAX_ITERS = 20`) that drives the LLM:

1. **Build the message array:**
   - system: `SYSTEM_INSTRUCTION + PROGRESSION_SYSTEM_PROMPT + TOOL_MODE_INSTRUCTION`
   - frozen messages (episode checkpoints + raw history, prepended as system entries)
   - mapped chat history (roles translated to `user`/`assistant`/`tool`/`system`)
   - a context message: live combat state, current turn, enemies, **PARTY summary (computed AC per member)**, active effects

2. **Per iteration:**
   - Re-filter tools against current state.
   - POST `/chat/completions` with `tools`, `tool_choice: "auto"`, `temperature: 0.7`, 60s timeout.
   - Add usage tokens to running totals (prompt, completion, cached).
   - **Tool results sent to LLM:** the function `formatToolResult` (`narration.ts:58-83`) produces a slim per-tool JSON for LLM context (no full `data` blob). This is the single path; `extractRollData` (`narration.ts:19-50`) provides rich data for the UI separately.
   - If no tool calls:
     - Raw `<tool_call>`/`<function>` text detected in content (model format failure) → push a targeted corrective nudge and retry (up to 2×).
     - Iteration 0 (no raw text) → push "you MUST call at least one tool" and continue.
     - Active combat, current actor is enemy, <5 iters → push "call next_turn".
     - Otherwise break.
   - **End-of-turn detection:** if any tool call is `narrate_turn`, or a rest/move with narration/autoAdvanceTime, OR **any action tool carrying `narration`/`timePassed` or `narrationOnSuccess`/`narrationOnFailure` (gated out of combat)** → execute pre-end calls first, extract suggestions from their args, then (if time hasn't already advanced) execute `narrate_turn`, then break. The narration from inline-finalized or branched tools is captured as `inlineNarration` from the tool result's `data.narration` field.
  - Otherwise batch-execute all tool calls in parallel via `executeToolBatch`, append `{role: assistant, tool_calls}` + per-tool `{role: tool, tool_call_id}` messages, loop.
  - **Critical-tool tracking:** `cast_spell`, `inflict_damage`, `roll_dice`, `player_attack` — if any fails, set `criticalToolFailed` so we don't trust inline narration.
  - **Budget guard:** if estimated payload exceeds 95% of `CONTEXT_BUDGET`, break early.
  - **Combat shortcut:** if `next_turn` succeeded, break (turn is over).

3. **Post-loop enforcement:** if no `narrate_turn` / rest / inline-finalize fired, synthesize a `narrate_turn(narration='', timePassed=0)` so conditions/DoTs/concentration still tick consistently. The check is gated by `if (!timeAdvancedThisTurn)` at `agentLoop.ts:385-390` — it is conditional, not unconditional.

4. **Return:** `{ toolMessages, iterationCount, promptTokens, completionTokens, cachedTokens, inlineNarration, suggestions }`. `inlineNarration` is sanitized via `sanitizeNarration` at the return point to catch any remaining artifacts.

### Batched party turns (`handleExecuteBatch`)

`useGameActions.ts:337`. When multiplayer action queue is flushed:

- Builds a `[Collaborative Turn]` user message containing every queued entry tagged with the character name (`playerName`); the `userId` (auth id) is kept on the queue item for audit but is NOT sent to the LLM. Message is created and broadcast *before* the lock sync so remote players see what's being processed.
- Builds context via `buildBatchContextString()` (`gameActionHelpers.ts`) which emits `ACTIVE CLASS FEATURES / RESOURCES / SPELLS / FEATS` for **every** party member (not just the active one), so the LLM can attribute spells/resources to the right character. Private `notes`/`gmNotes` are stripped via `withoutPrivateNotes()`.
- Same agent-loop flow as solo, including `dispatchToolRolls` (dice roll animations), `enableSuggestions`, and atmosphere updates on `move_to` — full parity with `handleSendMessage`.
- Narration retry chain (tiers 2+3) is wrapped in `withNarrationRetryTimeout` (45s `Promise.race`) — same freeze protection as solo.
- **Post-batch attribution diagnostic** (`warnIfBatchAttributionIncomplete`): `console.warn`s if any queued character never appeared as a tool-call actor. Pure observability, never blocks.
- Error handler mirrors solo: reads from `mcpServer.getFullState()` (not stale closure), clears both `isProcessing` and `processingUser`, calls `mcpServer.loadState()` + `syncState()`.
- Queue preservation: before clearing the queue on success, fetches the latest campaign state from Supabase (`storageService.fetchGameState`) and filters out only the executed item IDs — items added by other players during processing are preserved. Falls back to `[]` on fetch failure.
- `handleRewind` detects `[Collaborative Turn]` messages and re-executes via `handleExecuteBatchRef` (the queue items are restored by the undo snapshot).

### Multiplayer attribution hardening
The engine trusts the LLM to pass the correct actor id per tool call, silently defaulting to `party[0]` when omitted. Hardening (all gated on `party.length > 1`, so solo is byte-identical unless noted):
- **`MULTIPLAYER_PROMPT`** (`services/llm/prompts/multiplayerPrompt.ts`) is injected into the system message only when `party.length > 1`. It makes the attribution contract explicit.
- **`PARTY:` context line** (`agentLoop.ts`) — `name (hp/max, AC N) [conditions]` per member via `calculateAc`. Additive; also helps solo.
- **Actor-id warn-stamp** (`mcpService.executeToolCall`) — appends `WARNING: ...` to `result.message` when an actor tool is called with no id in multiplayer. `long_rest` excluded (party-wide). XP is engine-driven (no LLM tool).
- **`getTarget` ambiguity warning** (`partyService.ts`) — warns on 2+ name matches; resolution order unchanged.

### Rewind flow (`handleRewind`)

`useGameActions.ts:606`:

1. If currently processing → bail.
2. Load the rewind point (state + messages from before the user's last message).
3. If no rewind point → fall back to emergency snapshot, slice messages back to the last user msg, **bump `ctx.generation`** (invalidates in-flight compression), and re-call `handleSendMessage(text, isRetry=true)`.
4. Otherwise restore the snapshot, restore messages, **bump generation**, sync to Supabase, and re-call retry. Before restoring, `restoreToBeforeLastTurn` captures the current `actionQueue` and re-merges any items not in the snapshot after restore — this preserves queue items added by other players during the original batch processing window.
5. Retry routing: if the restored text starts with `[Collaborative Turn]` AND the engine has queue items (restored from snapshot), re-execute via `handleExecuteBatchRef` (batch retry). Otherwise re-send via `handleSendMessageRef(text, isRetry=true)` (solo retry).

---

## 8. Context Pipeline (memory & token budget)

A custom episodic-memory system so the LLM can remember hours of play without overflowing context. Lives in `services/llm/contextManager.ts`.

### Concepts

| Concept | Description |
|---|---|
| **Active window** | The last `ACTIVE_MSG_WINDOW = 20` messages, sent verbatim. |
| **Frozen raw history** | Messages that aged out of the active window, concatenated into one string with `[Player]/[GM]/[System]` prefixes. Capped at `RAW_CAP` (30K tokens, 80K chars). |
| **Episode checkpoints** | Compressed summaries of frozen raw history. Each ~1.5K tokens (~1000 words), written by a fast non-thinking model (`VITE_SUMMARIZATION_MODEL`, default `xiaomi/mimo-v2.5`). |
| **Generation** | Monotonic counter; bumped on rewind. Stale in-flight compression results are discarded by comparing generations. |
| **CONTEXT_BUDGET** | Hard cap (default 180K tokens). When the payload exceeds it, oldest checkpoints are evicted, then raw history is trimmed. |

### Flow

Per turn (`runContextPipeline` in `contextManager.ts:174`):

1. Increment `turnCounter`.
2. Every `FREEZE_INTERVAL = 5` turns → `freezeMessages`: slide messages older than the active window into `frozenRawHistory`, update `frozenMessageCount`.
3. `compressToCheckpointIfNeeded`: if raw tokens exceed `RAW_CAP` **or** no checkpoints exist yet and raw > 1K → kick off **async** compression (sets `isCompressing`, stores `compressPromise`). On success, the raw history is cleared and the checkpoint pushed onto `episodeCheckpoints`. Failures are logged and swallowed.

Before each turn (`prepareContext` in `contextManager.ts:187`):

1. Rebuild "frozen messages" array from `episodeCheckpoints` (as `[RECENT SESSION]`) and `frozenRawHistory` (as `[EARLIER EVENTS]`).
2. `enforceTokenBudget`: while payload > budget, drop oldest checkpoint, then drop raw, then trim the active window from the front.
3. Return `{ frozen, activeMessages }` — `activeMessages` is what gets sent to the LLM.

### Checkpoint compression prompt

`atmosphere.ts:174-192`. A dense ~1000-word archival prompt instructing the summarizer to preserve every NPC, quest, item, transaction, combat, skill check, XP award, lore entry, player decision, and character-development event in `[T#] Type: description.` format. These are the **only** record of those turns after compression — the model is told to be exhaustive.

### Persistence

The `ContextState` is serialized into `GameState.ctx` (`ContextMetadata` in `types/game.ts:36`) on every `syncFinishedState` call. On load, `useGameActions`'s `useEffect` hydrates `ctxRef.current` from `gameState.ctx`. This means checkpoints survive page reloads and sync to other multiplayer clients. The same `useEffect` also **re-hydrates from remote** when another player's turn advances `ctx.turnCounter` past the local value (cross-client ctx sync, issue 12) — transient `isCompressing`/`compressPromise` stay local.

---

## 9. Engine Subsystems

All engine services are **pure functions or close-over-state factories**. They never touch React.

### `diceEngine.ts`

Cryptographically-secure dice (`cryptoRoll` from `utils/random.ts`). Public API: `rollDice`, `rollDiceWithAdvantage`, `rollAttackRoll`, `rollDamage`, `rollSkillCheck`, `rollSavingThrow`, `rollDeathSave`, `calculateModifier`. Honors feats: Great Weapon Fighting (reroll 1s and 2s on heavy melee), Two-Weapon Fighting (off-hand ability mod), Sharpshooter/Great Weapon Master flags. Skill checks map free-text skill names to stats via `SKILLS_LIST`.

### `combatEngine.ts`

The math layer behind `mcp/combatService.ts`. `addEnemyToCombat` auto-fills stats from the SRD monster manual (`lookupMonster`). `initializeCombat` rolls initiative (with Alert feat bonus). `advanceToNextTurn` ticks conditions, handles DoTs, expires transformations. `resolveEnemySingleTurn` / `resolveAllEnemyTurns` are the auto-AI for enemy turns. Uses `getConditionEffects`, `isUnconscious`, `isIncapacitated`, etc.

### `classEngine.ts`

~350 lines. The class/race/Subsystem authority. Key exports: `getClassDef`, `getRaceDef`, `getSubclassDef`, `calculateMaxHp`, `calculateAc`, `calculateSpeed`, `getDarkvisionRange`, `getSavingThrowBonus`, `getProficiencyBonus`, `getSpellSaveDc`, `getSpellAttackBonus`, `getDamageResistances`, `canEquipArmor`, `recalculateResourcePools`. Handles Unarmored Defense (Barbarian/Monk), Draconic Resilience, fighting styles, armor proficiency gating, etc.

### `spellcastingEngine.ts`

~500 lines. Slot tracking, spell attack rolls, saving throws, damage/healing rolls, cantrip scaling, concentration tracking, ritual casting, spell preparation/learning. Powers `mcp/spellcastingService.ts`.

### `inventoryEngine.ts`

Currency normalization (10 cp = 1 sp = 1/10 gp), equipment equip/unequip effects (mutually-exclusive armor/shield), SRD item lookup (`utils/srdItems`), market price deduction. Powers `mcp/inventoryService.ts`.

### `conditionEngine.ts`

The conditions subsystem: 16 standard conditions (blinded, charmed, frightened, paralyzed, …), exhaustion levels, concentration checks, save-ending conditions, duration ticking per round or per minute. `applyCondition`, `removeCondition`, `tickConditions`, `tickConditionsByTime`, `tickConditionsByRounds`, `rollSaveAgainstCondition`, `getExhaustionPenalty`. Used by combat, spells, and the time system.

### `featsService.ts`

~350 lines. All ASI/feat logic: `hasFeat`, `getFeat`, `getAllFeats`, `validateFeatPrereqs`, `applyAsiChoice`, `applyFeatChoice`, plus per-feat helpers (`getAlertInitiativeBonus`, `getToughHpBonus`, `getMobileSpeedBonus`, `getHeavyArmorMasterReduction`, etc.). Backed by `FEATS_CATALOG` in `utils/feats.ts`.

### `progressionService.ts`

XP table lookups, `calculateXPToNextLevel`, `awardExperience` (with multi-level ups, ASI flags, subclass-feature-unlock flags), `applyStatAllocation`, `calculateHPGainForLevelUp`, `getProgressionContext` (string summary for the LLM). XP is always awarded flat to every party member (no split, no solo buff).

**`awardEnemyDefeatXp(state, enemy)`** (`mcp/progressionService.ts:10`): a free function called automatically by `inflict_damage` when an enemy drops to 0 HP. Awards CR-based XP flat to all party members via `xpEngine.computeXp('combat', ...)`, idempotent via the `Enemy.xpAwarded` flag. Covers every kill path: `player_attack`, `cast_spell`, DoTs, enemy attacks.

### `xpEngine.ts`

~120 lines. Centralized XP engine — every award in the system routes through one of two functions:

- **`computeXp(trigger, ctx)`** — pure: returns the XP amount for a given trigger + context bundle. 6 triggers: `combat` (CR-based), `skill` (DC-bracketed, nat 20 = ×2), `explore` (first-visit, `significance`-tiered), `quest` (`difficulty`-tiered), `lore` (flat 10), `roleplay` (auto-awards 1 XP baseline on every non-combat narrated turn; `roleplay: 'creative'` tag or explicit `xp` param boosts up to 10; clamped 1-10).
- **`awardXpToParty(state, amount)`** — mutates state: awards the full amount to every party member (no split, no solo buff). Returns `{ amount, reports, anyLevelUp, levelUpSummaries }`.

Designed as a single config table (`XP_CONFIG`) to make tuning game feel a one-liner. No `award_experience` LLM tool exists — XP flows through tool parameters (`significance` on `move_to`, `difficulty` on `upsert_quest`, `xp` on `narrate_turn`) and engine-side auto-awards.

### `summoningEngine.ts` / `teleportationEngine.ts` / `transformationEngine.ts`

Specialized mechanics for summons (create summoned creatures with CR caps), teleportation (Misty Step, Dimension Door range checks), and transformations (Polymorph, Wild Shape, True Polymorph with beast CR caps by level / class).

### `auditor.ts`

A data-integrity checker. Runs a battery of rules over `GameState` and reports `AuditResult[]` — checks feats exist in the catalog, race/class IDs are valid, spell IDs resolve, armor proficiencies match class, etc. Most rules also have a `repair` function for auto-fix. Not currently wired into the runtime but available for diagnostics and tests.

### `characterUtils.ts`

Home of `ensureCharacterFields()` / `ensureAllCharacterFields()` — the single shared field-hydration pass that backfills sane defaults whenever a character enters the engine. `stateService` and `travelService` both import it from here (no duplication).

### `rewindGeneration.ts`

A tiny module backing the generation-rewind protocol: a module-level counter (`getRewindGeneration` / `bumpRewindGeneration`) incremented on rewind. `storageService.syncCampaignState` tags every persisted payload with `_rewindGeneration` so remote clients can discard updates older than their local generation.

### `characterCreationService.ts`

`buildCharacterFromWizard(wizard, options)` — pure function that turns the wizard state into a valid `Character`. Used by both `WizardShell.handleFinalize` (production) and tests.

### `audioService.ts`

Thin wrapper over `window.speechSynthesis`. Chunks text by sentence, picks a preferred male English voice, applies rate/pitch/volume from `AppSettings`. `initAudio` primes the voice list.

### `storageService.ts` / `authService.ts` / `supabaseClient.ts`

[Persistence layer — see §10](#10-persistence-layer).

### `streamingClient.ts`

[See §6 — LLM subsystem](#6-the-llm-subsystem-servicesllm).

---

## 10. Persistence Layer

### `supabaseClient.ts`

Lazily creates a Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Falls back to placeholder URLs and logs a warning if missing (so the app doesn't crash on first load). Exposes both `getSupabaseClient()` and a `Proxy` named `supabase` that auto-binds methods.

### `authService.ts`

Thin wrapper: `signUp`, `signIn`, `signOut`, `getSession`, `updatePassword`, `resetPasswordForEmail`. All return `{ error }` or `{ session }` shapes.

### `storageService.ts`

The persistence facade. Behavior switches on whether `userId` and a real `campaignId` (not `'anonymous'`) are present:

- **Cloud mode:** Supabase `campaigns` table.
- **Local mode:** `localStorage` under key `diceonrails_game_data`.

Key methods:

- `subscribeToCampaign(campaignId, onUpdate)` — Supabase Realtime channel on the `campaigns` table; used by `useGameState` to sync multiplayer state.
- `syncCampaignState(campaignId, gameState, messages?)` — **batched** update. Multiple calls within a microtask are coalesced into a single Supabase UPDATE via `enqueueSync` (`storageService.ts:241`)/`drain` (`:249`) using a per-campaign merge Map (`pendingPayloads` at `:236`). This prevents one player's turn from generating 20 separate DB writes.
- `createCampaign`, `loadCampaigns`, `loadGame`, `saveGame`, `deleteCampaign`, `renameCampaign`, `clearLocalSave`.

`loadCampaigns` queries both the modern `campaigns` table **and** the legacy `game_saves` table (tagged `[LEGACY]`), preserving saves from older versions of the app.

### Schema (`supabase/migrations/`)

- **`20240101000000_initial_schema.sql`** — `campaigns(id, host_id, name, game_state JSONB, messages JSONB, created_at)` with public read/insert/update policies and host-only delete. Also creates legacy `game_saves` table.
- **`20260627000000_add_progression.sql`** — SQL functions (`get_character_xp`, `get_character_level`, `get_character_unused_points`) and the `campaign_party_progression` view for dashboards.
- **`20260706000000_create_srd_items.sql`** — `srd_items` reference table.
- **`20260710000000_create_monsters.sql`** — `srd_monsters` reference table.

The runtime uses static TS catalogs (`data/srdItems.ts`, `data/monsters.ts`) — the SQL tables exist for community tooling / dashboards. The setup wizard (`components/SetupWizard.tsx`) ships the same schema as a string and will execute it via the Supabase REST endpoint if the user pastes their keys during install.

### Multiplayer lock

Before any turn, `handleSendMessage` (and `handleExecuteBatch`) perform a **remote processing pre-check**: for syncable campaigns, they call `storageService.isCampaignProcessing(campaignId)` (a SELECT on Supabase) to verify no other player has started processing since the last realtime sync. If the remote is processing, the turn is aborted. This is fail-open (returns `false` on error). Anonymous campaigns skip the check entirely.

After passing the pre-check, the handler sets `isProcessing: true` and `processingUser: <name>` and writes that to Supabase. Other clients in `useGameState`'s subscription handler (lines 124-159) check `isProcessingRef`: if the local client thinks it's processing and the remote cleared the flag, that's the "unlock" signal; otherwise incoming remote state is applied.

---

## 11. Character Creation Pipeline

### Components

```
components/creation/
├── WizardShell.tsx       # Orchestrator — owns wizardState, assembles steps
├── types.ts              # WizardState interface
├── constants.ts          # STEP_LABELS, DRAGON_ANCESTRIES, sub-class lists
├── asiUtils.ts           # getEffectiveAsiMap (resolves Half-Elf flexible-2 into a concrete ASI map)
├── skillPoints.ts        # computeSkillBudget / computeRemainingSkillPoints (single source for the skill-point house rule)
├── SharedComponents.tsx  # StepH, NavBtn, SubclassList, DragonColorPicker
├── NameStep.tsx
├── RaceStep.tsx
├── ClassStep.tsx
├── StatsStep.tsx
├── SkillsStep.tsx
├── FeatsStep.tsx
├── SpellsStep.tsx
├── GearStep.tsx
├── ReviewStep.tsx
└── StartingGroundsStep.tsx
```

Plus the generic framework:

```
components/wizard/
├── WizardStep.ts        # WizardStep<TState> interface + context type
├── StepWizard.tsx       # Generic visible-step / history / navigation engine
└── shared/              # Reusable ASI/skill/feat UI atoms (StatRow, SkillRow, FeatCard, …)
```

### How it works

1. `WizardShell` declares an array of `WizardStep<WizardState>` objects. Each step has `{ key, label, isVisible?, render({state, updateState, context}) }`. Validation is performed by each step's own continue handler and `WizardShell.handleFinalize` (the framework defines no `validate` hook).
2. The optional `defaultLevel` prop sets the starting level (used when joining an existing party — defaults to the party's max level). `WizardState.level` inits to `defaultLevel ?? 1`.
3. `StepWizard` filters by `isVisible` (e.g. the subclass step only shows if `selectedClass.subclassLevel <= level`), maintains a step-history stack for back-navigation, and renders the current step plus a progress bar.
4. Steps mutate `wizardState` via `updateWizard` (a stable `useCallback`).
5. The wizard includes two "Path" steps — `subclass-early` (for classes like Cleric whose subclass is chosen at L1) and `subclass-late` (for classes whose subclass comes at L2+). Only one is visible depending on the class.
6. On the **Review** step, `handleFinalize` (WizardShell:90) computes final stats, applies racial ASIs (including Half-Elf flexible choices), collects feats, builds the resource pools (`recalculateResourcePools`), assigns HP from class hit die + CON mod, and calls `onComplete(character)`.
7. For **new campaigns**, a final **StartingGrounds** step calls `onGenerateStartingLocations` (which hits the LLM with `STARTING_LOCATIONS_PROMPT`) to produce 4 unique taverns, each with an LLM-generated atmosphere image. The chosen location seeds the world.

### `onComplete` → `handleCharacterCreated`

`useGameActions.ts:587`:

1. Tag character with `ownerId = userId`.
2. Set `myCharacterId`, `viewingCharacterId`.
3. Read starting location from state, set character location.
4. **Join detection**: if `party.length > 0` before `joinParty` (party already has members, meaning the campaign was loaded from storage rather than created fresh), the handler takes the **join path**:
   - Append a `[System]` join notice (`"<Name> has joined the party."`) to existing messages — preserves the campaign's chat history.
   - Skip the intro welcome message and auto-speak.
5. Otherwise (new/anonymous campaign): build the intro message (`"Greetings, X. Your journey begins in Y…"`) and set messages.
6. `mcpServer.joinParty(character)` → adds to `state.party`.
7. `setStage(AppStage.PLAY)`.
8. Sync to Supabase or localStorage (the new campaign creates a row; the join path or existing campaign syncs the existing row). All branches use the explicitly-constructed message array (fixes a latent stale-closure bug).
9. If atmosphere art is enabled, fetch and cache the starting image.

---

## 12. Components & UI Layouts

### Layouts

`DesktopLayout.tsx` and `MobileLayout.tsx` are the two Play-stage shells. Both:

- Pull state from all 6 contexts.
- Render `<ChatLog>`, `<InputArea>`, `<CharacterSheet>`, `<Journal>`, `<LevelUpModal>`, `<CombatTracker>`, `<ActivityBell>`, `<AtmosphereOverlay>`.
- Use `useActivityTracking` to summarize recent events for the bell.

Differences:

- **Desktop** — three-column resizable sidebar (Character/Journal tabs), top header with location/time/share/Activity Bell, combat tracker as a floating bar, queue panel below the sidebar.
- **Mobile** — bottom nav (`Adventure` / `Hero` / `Journal` / `Settings`), atmosphere strip above chat, slide-up queue sheet, persistent HP/AC status bar.

### Top-level screens & modals

| Component | Purpose |
|---|---|
| `SplashScreen` | Decorative intro; calls `onComplete` after animation. |
| `AuthScreen` | Sign-in / sign-up / anonymous play; calls `onComplete(uid?)`. |
| `CampaignDashboard` | Lists campaigns; create / join (by ID) / delete / rename. |
| `CampaignModal` | Modal for naming a new campaign. |
| `StartModeScreen` | Choose Quick Start (preset) vs. Custom character creation. |
| `QuickStartFlow` | Pick a preset character, then a starting ground; can switch to Custom. |
| `CompendiumModal` | Tabbed reference browser: Glossary, Conditions, Rules, Spells, Items (read-only). |
| _(suggestion chips)_ | Inline in `ChatLog` — 2-3 clickable next-action chips below the last narration. Populated by the 4-tier suggestion fallback chain (`services/llm/suggestions.ts`), opt-in via `enableSuggestions`. |
| `SetupWizard` | First-run installer; writes `.env` via dev-server middleware or pastes SQL into Supabase. |
| `SettingsModal` | Toggles for voice, atmosphere, portraits, debug mode, TTS sliders, account actions, debug-log export. |
| `DiceRollModal` | Big animated dice popup for skill checks / attacks. |
| `LevelUpModal` | Allocates stat points, picks ASI vs. Feat, picks subclass features. |
| `ArcaneRecoveryModal` | Wizard-only modal for choosing which spell slots to recover via Arcane Recovery (once per long rest). Opens from InputArea. |
| `SpellbookModal` | Caster spell management. Prepared casters prepare/unprepare freely out of combat; known casters swap one spell per level-up (Tasha's rule) when `pendingSpellSwap` is set. Cantrips can be learned when free slots exist (via level-up), and swapped like-for-like by any caster via the 2024 long-rest rule when `cantripSwapAvailable` is true (set by `long_rest`). Opens from CharacterSheet "Manage" button + InputArea Quick Action. Locked in combat. |
| `FeatDetailModal` | Reference modal for feat definitions. |
| `ErrorBoundary` | Wraps the Play layout; catches render errors so a single bad turn doesn't kill the session. |

### `ChatLog.tsx`

The story view. Notable features:
- Parses `[System:*]` log prefixes and renders them as bordered "System Log" cards.
- Two regex-based roll parsers (`ATTACK_ROLL_RE`, `SKILL_ROLL_RE`) extract roll data from older message text and render `RollCard` components inline.
- Modern messages carry `msg.rollData` directly (set by `extractRollData` in `narration.ts`) and render via `DiceRollCard`.
- Filters: All / Narration / Player / System; plus full-text search.
- Export menu: copy to clipboard or download `.txt`.
- Per-message TTS button.
- Rewind button next to the latest user message.
- Auto-scroll-to-bottom with a manual "jump to latest" button when the user scrolls up.

### `InputArea.tsx`

The input box. Notable features:
- **Quick Actions** — auto-generated from the character's prepared/known spells, equipped weapons, and class resources. Plus hardcoded Short Rest / Long Rest shortcuts, Arcane Recovery modal button (wizard only, once per long rest), and Manage Spells modal button (any caster, locked in combat).
- **Voice input** via `webkitSpeechRecognition` (browser support gated).
- **Queue Action / Queue Dialogue** buttons for multiplayer turn queueing. Only rendered when `gameState.party.length > 1` (2+ party members); in solo play the buttons, the Action Queue panel/drawer, the mobile queue toggle, and the per-character tab bar are all hidden. The onboarding tour's "Action Queue" step is likewise skipped in solo via the `multiplayer` prop.
- **Resolve Turn** button appears during enemy turns; calls `handleResolveEnemyTurn`.
- Input is disabled (`effectivelyLocked`) while the LLM is processing or it's an enemy's turn.

### `CharacterSheet.tsx`

~400 lines. Renders everything about a character: name, race/class/level, HP bar, AC, XP bar, stats grid, speed/darkvision/proficiency/hit dice/spell DC chips, class & subclass feature accordions, saving throws, resources, spell slots (visualized as pip circles), conditions (with mechanical summaries), damage resistances, proficient skills, full inventory (with edit/remove/equip/drink-potion affordances and rarity-colored hover tooltips via `createPortal`), currency editor, current location.

A level-up CTA appears whenever `unusedStatPoints` or `unusedSkillPoints` is non-zero.

### `CombatTracker.tsx`

Two rendering modes (`isMobile` prop). Lists initiative order with HP bars, current-turn highlight, expandable rows showing raw roll + modifier + AC + conditions. Collapsible.

### `shared/`

Reusable atoms:

- `HpBar` — colored HP bar.
- `BaseModal` — generic modal shell with backdrop and escape handling.
- `Toggle` — settings switch.
- `SectionH`, `TabButton`, `CategoryButton`, `AddBtn`, `AdjBtn` — small styled primitives.
- `AtmosphereOverlay` — fullscreen background image with parallax.
- `ActivityBell` — dropdown of recent party activity (level-ups, combat, discoveries).

---

## 13. Types System

```
types/
├── index.ts        # Re-exports everything
├── common.ts       # MessageRole, AppStage, AppSettings, Message, Campaign, RollData, MCPResponse, SavedGameData, QueuedAction
├── character.ts    # Character, InventoryItem, Currency, ResourcePool, ClassFeature, SubclassSummary, RacialTrait, ActiveCondition, FeatSelection, TransformationState, LevelUpSummary, DeathSaveStatus, …
├── combat.ts       # Enemy, EnemyAttack, InitiativeEntry, CombatState (with activeDoTs)
├── spell.ts        # SpellDefinition, SpellSchool, SpellScaling, SpellcastingProfile
└── game.ts         # GameState, Quest, LoreEntry, StartingLocation, ContextMetadata, XPTableEntry
```

### Key invariants

- `Character.stats` is always `{ str, dex, con, int, wis, cha }` (all six).
- `Character.conditions?: ActiveCondition[]` — duration is in **rounds** unless `durationUnit: 'minute'` is set.
- `Message.role` uses the `MessageRole` enum; mapped to lowercase strings for the LLM API by `mapHistoryToMessages`.
- `AppStage` enum has 6 values: `AUTH`, `DASHBOARD`, `START_MODE`, `QUICK_START`, `CREATION`, `PLAY`.
- `RollData.type` is one of `'attack' | 'skill' | 'damage' | 'cast_spell' | 'save' | 'death_save'`.
- `MCPResponse = { success: boolean; data: Record<string, unknown>; message?: string }` — every tool returns this shape.

The `Character` interface has ~50 optional fields covering every subclass choice (divine domain, sorcerous origin, warlock patron, arcane tradition, fighting style, draconic ancestry, sneak attack dice, …). The `stateService.ensureCharacterFields` function (in `mcp/stateService.ts:46`) hydrates sane defaults whenever a character enters the engine.

---

## 14. Static Game Data

```
data/
├── constants.ts          # SKILLS_LIST (18 skills), XP_TABLE (levels 1-20), STAT_POINTS_PER_LEVEL, MAX_STAT_VALUE, ASI_LEVELS, FALLBACK_STARTING_LOCATION
├── classes.ts            # 12 SRD classes with full class features, subclasses, spellcasting profiles, proficiencies
├── races.ts              # 9 SRD races with ASIs, traits (darkvision, lucky, relentless endurance, …), size, speed
├── feats.ts              # SRD feat catalog (Alert, Great Weapon Master, Sharpshooter, Tough, Resilient, …)
├── spells.ts             # SRD spell definitions (level, school, damage, save, scaling, components, …)
├── monsters.ts           # SRD monster stat blocks (goblin, orc, dragon, …) — used by lookupMonster
├── srdItems.ts           # SRD weapons, armor, shields, potions with mechanical stats
├── shopItems.ts          # Purchaseable shop stock
├── presetCharacters.ts   # 10 pre-made level-1 characters for Quick Start (specs built via buildCharacterFromWizard)
├── conditionInfo.ts      # Condition + exhaustion reference data (icon, summary, effects) — single source of truth for sheet/Compendium/tooltips
├── referenceConstants.ts # Pure-data reference (stat/skill/derived-stat/rest/death-save/currency metadata) for Compendium + tooltips
└── glossary.ts           # Jargon glossary entries surfaced in the Compendium Glossary tab
```

These same catalogs are re-exported via `utils/classes.ts`, `utils/races.ts`, `utils/spells.ts`, `utils/feats.ts`, `utils/monsters.ts`, `utils/srdItems.ts` and accessible through the `utils/index.ts` barrel.

The `data/constants.ts` file is re-exported via the top-level `constants.ts`, which also defines `SYSTEM_INSTRUCTION`, `PROGRESSION_SYSTEM_PROMPT`, and `INITIAL_CHARACTER` (a frozen default character template — used in tests and as a fallback).

### System prompts

`constants.ts:8-83` — two large prompt strings:

- **`SYSTEM_INSTRUCTION`** (`constants.ts:8-39`) — base GM persona: "world-class Game Master", 14 numbered RULES (use tools for deterministic actions, manage currency, narrate equipped weapons correctly, handle time/durations, English-only responses, etc.), style guidelines, and the architectural note explaining the Storyteller/Engine split.
- **`PROGRESSION_SYSTEM_PROMPT`** (`constants.ts:43-87`) — engine-driven XP: 6 auto-award triggers (combat, skill, explore, quest, lore, roleplay), LLM triggers via `significance`/`difficulty`/`xp` params, long-rest rules. No CR/DC XP tables — engine owns them.

Combined with `TOOL_MODE_INSTRUCTION` from `prompts/toolModePrompt.ts`, these form the agent loop's system message.

---

## 15. Build, Test & CI

### Vite config (`vite.config.ts`)

- `appType: 'spa'`, dev/preview on port 3000, host `0.0.0.0`.
- **Proxy** at `/api` → `VITE_LLM_PROXY_TARGET || VITE_LLM_API_BASE || 'https://opencode.ai/zen/go/v1'`, with path rewrite stripping `/api`. This is what makes `VITE_LLM_API_BASE=/api` work in production.
- **Setup-mode middleware**: when `VITE_SETUP_MODE=true`, registers a `POST /__setup/save` handler that writes the `.env` file from the SetupWizard's JSON payload.
- `define`: injects `process.env.API_KEY` and `process.env.GEMINI_API_KEY` (legacy compat, both sourced from `env.GEMINI_API_KEY`) and `import.meta.env.VITE_SETUP_MODE`.
- Path alias `@` → repo root.
- Manual chunks: `vendor-react`, `vendor-supabase`, `vendor-vercel`, `vendor-ui`.

### Test config (`vitest.config.ts`)

- `globals: true`, `environment: 'jsdom'`, setup file `tests/setup.ts` (polyfills `matchMedia`, `speechSynthesis`, `AudioContext`, `navigator.clipboard`).
- Coverage via V8. Includes `components/`, `hooks/`, `services/`, `utils/`. Thresholds: 55% statements / 43% branches / 50% functions / 60% lines.
- Excludes only direct children `tests/live/*_live.test.ts` from the default run. The `tests/live/scenarios/*.test.ts` subfolder **is** picked up by `npm test` (it matches the `tests/**/*.test.{ts,tsx}` include pattern) — those scenario files use full vitest (`describe`/`it`/`expect`/`vi`) and `vi.mock('../../../utils/random', ...)` to stub `cryptoRoll`.

### Test layout

```
tests/
├── setup.ts                  # jsdom polyfills
├── helpers/                  # Test factories
│   ├── characters.ts         # Build test characters
│   ├── combat.ts             # Build combat states
│   ├── engineRunner.ts       # Spin up mcpServer + run tool sequences
│   ├── mockLLM.ts            # Mock fetch responses
│   ├── mockMCP.ts            # Mock MCP server
│   ├── mocks.ts              # Generic mocks
│   ├── state.ts              # Build game states
│   └── tuningOutput.ts       # Test output formatting
├── live/                     # Tier-3+ tests that hit a real LLM
│   ├── run_all.ts            # Runs all live tests via tsx
│   ├── helpers/liveRunner.ts
│   ├── scenarios/            # Multi-turn play scenarios
│   └── 0X_*_live.test.ts     # Feature-specific live tests
├── components/               # Component tests (smoke test)
├── hooks/                    # Hook tests (6 files)
├── services/                 # Service tests (~30 files)
├── services/llm/             # agentLoop + toolFilter
└── utils/                    # Util tests (10 files)
```

### npm scripts (recap)

| Script | Notes |
|---|---|
| `npm run dev` | Runs `scripts/preflight.js` which auto-installs deps, then either launches the SetupWizard or Vite. |
| `npm run build` | `vite build` |
| `npm run preview` | `vite preview` — local preview of the production build |
| `npm test` | `vitest run --bail=1` — stops on first failure |
| `npm run test:watch` | `vitest` in watch mode |
| `npm run test:coverage` | `vitest run --coverage` — V8 coverage report |
| `npm run test:ci` | `vitest run --bail=1 --reporter=verbose` — verbose CI-style run (run locally; no CI is configured) |
| `npm run test:live` | Live tests against a real LLM (`vitest run tests/live/`) |
| `npm run test:live:tier3` | Scenario tests via `tsx tests/live/run_all.ts` |
| `npm run test:all` | Unit + tier-3 |
| `npm run lint` | `eslint . --ext .ts,.tsx` |
| `npm run lint:fix` | `eslint . --ext .ts,.tsx --fix` |
| `npm run install-app` | Guided CLI installer (`inquirer` + `chalk`) |
| `npm run prepare` | `husky` — installs Git pre-commit + commit-msg hooks |

### CI (`.github/workflows/test.yml`)

> **Not currently configured.** No `.github/workflows/` directory exists in the repo — the script `npm run test:ci` is the equivalent of the historical CI run and should be invoked locally before pushing. The intended pipeline (when restored) would be: on push to `main` / `develop` or PR to `main`, checkout → setup Node 20 → cache npm → `npm ci` → `npm run lint` → `npm run test:ci` with `CI: true`.

### Husky / pre-commit

`npm run prepare` installs Husky. The `.husky/` directory contains:
- **`pre-commit`** — runs `npm run lint` then `npm test` on separate lines (not `&&`-chained; a lint failure does NOT block the commit if tests pass).
- **`commit-msg`** — if a commit stages both test files (`*.test.*`) and source files (`*.ts`/`.tsx`), the message must start with `[RED]` or `[GREEN]`. Use `git commit --no-verify` to bypass.

---

## 16. Configuration Reference

### `.env` variables

| Var | Required | Default | Used by |
|---|---|---|---|
| `VITE_LLM_API_KEY` | ✅ | — | All LLM calls |
| `VITE_LLM_API_BASE` | no | `https://openrouter.ai/api/v1` | LLM endpoint; set to `/api` in prod |
| `VITE_LLM_MODEL` | no | `deepseek/deepseek-v4-flash` | Primary model |
| `VITE_SUMMARIZATION_MODEL` | no | `xiaomi/mimo-v2.5` | Checkpoint compression |
| `VITE_IMAGE_ROUTER_API_KEY` | no | — | Atmosphere art + character portraits |
| `VITE_IMAGE_MODEL` | no | `stabilityai/sdxl-turbo` | Atmosphere + portrait model |
| `VITE_SUPABASE_URL` | no | — | Cloud DB / auth |
| `VITE_SUPABASE_ANON_KEY` | no | — | Cloud DB / auth |
| `VITE_CONTEXT_RAW_CAP` | no | `30000` | Tokens before raw history → checkpoint |
| `VITE_CONTEXT_BUDGET` | no | `180000` | Hard token budget |
| `VITE_LLM_DISABLE_THINKING` | no | — | `true` disables reasoning traces |
| `VITE_LLM_PROXY_TARGET` | no | — | Vercel proxy override |

### Vercel proxy (`api/chat/completions.ts`)

Serverless function: handles CORS preflight, validates method, forwards the request body to `VITE_LLM_PROXY_TARGET || 'https://opencode.ai/zen/go/v1'` with the original `Authorization` header, and pipes back the JSON. Solves CORS for browser→LLM calls in production.

### `vercel.json`

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Standard SPA fallback so client-side routes work on refresh.

### `tsconfig.json` highlights

- `strict`, `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` all on.
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`.
- `jsx: react-jsx`, `allowImportingTsExtensions: true`, `noEmit: true` (Vite handles emit).
- Path alias: `@/*` → `./*`.

### ESLint (`.eslintrc.cjs`)

- Extends `eslint:recommended` + `@typescript-eslint/recommended`.
- Plugins: `@typescript-eslint`, `vitest`, `testing-library`.
- Globally error-level: `no-explicit-any`, `no-non-null-assertion`, `ban-ts-comment` (bans `ts-ignore`, allows `ts-expect-error`), `no-trailing-spaces`. Most other rules warn.
- Test override (`tests/**`): enables `vitest/expect-expect` and several `testing-library/*` rules (no-node-access, no-container, no-await-sync-queries are errors; prefer-find-by is warn). It does **not** re-set `any`/`!` severity — those are already errors globally.

---

## 17. Key Invariants & Conventions

These are unwritten rules that hold across the codebase. Violate them at your peril.

### State

- **`mcpServer` is the only source of truth for `GameState`.** React state mirrors it via `syncState()` (`useGameState.ts:26`) which just calls `setGameState(mcpServer.getFullState())`. Never mutate `gameState` directly — always go through `mcpServer`.
- **All tool execution flows through `mcpServer.executeToolCall`** (or its typed wrappers on `MockMCPServer`). Don't call `combatEngine`/`spellcastingEngine` directly from React. `executeToolCall` now wraps certain results through `maybeFinalizeTurn` which collapses action+narrate_turn into one call for inline-finalized tools.
- **A campaign is "syncable" iff `campaignId != null && campaignId !== 'anonymous'`.** The literal string `'anonymous'` is the sentinel for local-only play.
- **`isProcessing` is a multiplayer lock.** Always set it before a turn and clear it in a `finally`.
- **Combat XP is auto-awarded on enemy defeat.** `inflict_damage` calls `awardEnemyDefeatXp` which awards CR-based XP flat to all party members via `xpEngine.computeXp('combat', ...)`. Idempotent via `Enemy.xpAwarded` flag. Covers every kill path.

### Tools

- **`narrate_turn` is the primary way game time advances**, but deterministic action tools (`update_inventory`, `adjust_currency`, `log_lore`, `upsert_quest`, simple `move_to`) can optionally carry `narration`+`timePassed` to advance time and end the turn in one call (inline finalization). Binary dice tools (`check_skill`, `make_save`) carry `narrationOnSuccess`/`narrationOnFailure` — the engine selects the branch from the roll. `long_rest`/`short_rest`/`move_to` (with inline `narration`/`timePassed`) also advance time inline. `move_to` additionally supports an optional `significance` param (`minor`/`major`/`landmark`) — first-visit exploration XP is auto-awarded on arrival (defaults to landmark=100 XP when omitted). `narrate_turn` supports an optional `xp` param (1-10) for roleplay XP, plus an optional `roleplay: 'dialogue'\|'creative'` tag. Any non-empty narration auto-awards 1 XP baseline (no tag needed); `creative` = 5 XP default when `xp` omitted; explicit `xp` overrides; `xp=0` suppresses. The agent loop enforces a no-op `narrate_turn(timePassed=0)` at the end if nothing else advanced time, so conditions/DoTs always tick. **Travel guardrails:** the named-route system is removed; `move_to` legs are capped at 240 min (longer legs rejected pre-dispatch), and the `narrate_turn` exhaustion loop is capped at `MAX_SAFE_EXHAUSTION` (2) so no single advance can kill via travel-fatigue.
- **Never call `inflict_damage` after `player_attack` or `cast_spell`** — those tools handle damage atomically. This is repeated loudly in `TOOL_MODE_INSTRUCTION`.
- **Spells never use `roll_dice`.** Spell attack rolls and damage are inside `cast_spell`.
- **Critical tools** (`cast_spell`, `inflict_damage`, `roll_dice`, `player_attack`) failing sets `criticalToolFailed`, which suppresses inline narration and forces a separate narration pass.
- **Inline finalization is OOC-only.** `maybeFinalizeTurn` checks `state.combat?.isActive` — in combat, turns are driven by `next_turn`, never by inline narration.

### LLM

- **English-only output.** Hardcoded in `SYSTEM_INSTRUCTION`. The narration layer re-asserts it.
- **Never write `[System:tool_name]` or raw `<tool_call>`/`<function>` markup in narration** — these are internal protocol between engine and LLM. `sanitizeNarration()` strips them at three layers (engine-side, generateNarration return, and `modelMsg.text` chokepoint). ChatLog strips `[System:…]` prefixes from SYSTEM messages.
- **Tool calls per iteration are batched and parallel** (`Promise.all` in `executeToolBatch`), but the agent loop respects tool ordering by `tool_call_id` for assistant/tool message pairing.
- **Tool results sent to the LLM are slim.** `formatToolResult()` produces a compact per-tool JSON (no full `data` blob), reducing per-iteration token growth. The rich `data` is extracted for the UI separately by `extractRollData()`.

### Context

- **Generation bumping on rewind.** `handleRewind` always sets `ctx.generation = (old + 1)` so any in-flight compression promise rejects its result.
- **Compression is async and non-blocking.** The player's turn never waits on a compression call; it just runs in the background and the next turn picks up the new checkpoint.
- **Checkpoints are append-only** until budget eviction. Oldest dropped first.

### Dice

- **`cryptoRoll` is the only dice function.** Uses `globalThis.crypto.getRandomValues` with rejection sampling for uniform distribution; falls back to `Math.random` only if crypto fails. Never use `Math.random` directly for game mechanics.
- **All die results are ≥ 1.** `cryptoRoll(sides)` returns `1..sides`.

### Naming

- Class and race IDs are always lowercased on entry to the engine (`stateService.ensureCharacterFields` and `partyService.joinParty` both `.toLowerCase()` them).
- Subclass IDs follow `<class>-<path>` conventions (e.g. `life-domain`, `draconic-bloodline`, `champion`).
- Spell IDs are kebab-case (`fireball`, `mage-armor`, `eldritch-blast`).
- Item types are `'weapon' | 'armor' | 'potion' | 'shield' | 'gear' | 'other'`.

### Files

- **No comments.** Codebase convention is to write self-documenting code. (Inline `// ───` section banners appear in some services but are rare.)
- **No barrel exports for components.** Components are imported by direct path (e.g. `./components/chat/MessageBubble` historically; today `./components/modals/SpellDetailModal`). Services and utils do have barrels (`services/index.ts`, `utils/index.ts`).
- **Hook names start with `use`.** Context hooks are `useXContext` (e.g. `useGameContext`); raw hooks are `useX` (e.g. `useGameState`).
- **All React components are default exports.** All engine functions are named exports.

---

## Appendix: Where to Start Reading

If you're new to the codebase, read in this order:

1. **`App.tsx`** — see the stage machine and provider stack.
2. **`types/index.ts` + `types/game.ts` + `types/character.ts`** — learn the shapes.
3. **`services/mcpService.ts`** — read the constructor and `executeToolCall`. This is the engine's public surface.
4. **`services/mcp/stateService.ts`** + **`partyService.ts`** — see how state is held and initialized.
5. **`hooks/useGameActions.ts`** — the turn lifecycle.
6. **`services/llm/agentLoop.ts`** — the LLM driver.
7. **`services/llm/contextManager.ts`** — memory management.
8. **`services/llm/tools/*`** + **`prompts/toolModePrompt.ts`** — what the LLM can actually do.
9. **`components/layouts/DesktopLayout.tsx`** — how everything is wired into the UI.
10. **`tests/services/mcpService.test.ts`** + **`tests/helpers/engineRunner.ts`** — concrete examples of driving the engine.

Welcome to the dungeon. 🐉
