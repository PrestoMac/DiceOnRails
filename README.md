# DiceOnRails

> An AI-powered Game Master that runs a fully-rules-aware **5e (SRD)** tabletop roleplaying game — solo or with friends, in the browser, on any device.

DiceOnRails pairs a **large language model** (for narration, roleplay, and intent parsing) with a **deterministic game engine** (for dice, combat, inventory, spells, leveling, and all the math). The LLM tells the story; the engine enforces the rules. Neither one fudges the other.

---

## Highlights

- **AI Storyteller + Rules Engine** — The LLM narrates the world; the engine rolls every die, tracks every HP, and validates every spell. No hallucinated crits.
- **Full 5e SRD mechanics** — Classes, subclasses, races, feats, skills, spell slots, concentration, conditions, death saves, multi-character parties, and a 1–20 XP progression.
- **Function-calling agent loop** — The GM "thinks" by calling tools (`player_attack`, `cast_spell`, `check_skill`, `move_to`, `narrate_turn` …) up to 20 iterations per turn, then narrates the result.
- **Generated atmosphere art** — Auto-commissioned scene art (via ImageRouter / SDXL-Turbo) for every tavern, dungeon, and forest you enter.
- **Voice narration** — In-browser text-to-speech reads the GM's prose aloud.
- **Solo or multiplayer** — Play alone (anonymous/local) or invite friends to a shared cloud campaign with realtime sync.
- **Cross-platform UI** — Responsive layouts for desktop and mobile, voice input, action queueing, dice popups, and a searchable / exportable chat log.
- **Cloud saves & campaigns** — Powered by Supabase (Postgres + Realtime + Auth).
- **Works with any OpenAI-compatible provider** — Default is OpenRouter; bring your own API key.

---

## How It Works

```
┌────────────┐     player text      ┌──────────────┐    tool calls    ┌──────────────┐
│  Your      │ ───────────────────▶ │   LLM Agent  │ ───────────────▶ │ Game Engine  │
│  Input     │                      │   (narrator) │ ◀─── results ─── │ (deterministic)│
└────────────┘                      └──────────────┘                  └──────────────┘
                                           │                                  │
                                           │ final prose                      │ mutated state
                                           ▼                                  ▼
                                    ┌──────────────┐                  ┌──────────────┐
                                    │  Chat Log +  │                  │  Supabase /  │
                                    │  Dice Cards  │                  │  LocalSave   │
                                    └──────────────┘                  └──────────────┘
```

1. **You type an action** ("I attack the goblin with my longsword").
2. The **LLM agent loop** translates that into structured tool calls (`player_attack`, `next_turn`, `narrate_turn`).
3. The **game engine** executes each tool deterministically — rolling real cryptographic dice, applying damage, ticking conditions, awarding XP.
4. Tool results are fed back to the LLM until it produces a **final narration**.
5. State is synced to Supabase (or `localStorage` in solo mode) and rendered with dice cards, HP bars, and atmosphere art.

---

## Quick Start

### Prerequisites

- **Node.js 20+** (the test suite targets Node 20)
- An **LLM API key** — get one free at <https://openrouter.ai/keys>
- *(Optional)* An **ImageRouter API key** for atmosphere art — <https://imagerouter.io>
- *(Optional)* A **Supabase project** for cloud saves & multiplayer — <https://supabase.com>

### 1. Install & Configure

```bash
npm install
npm run dev
```

The first time you run `npm run dev`, the **preflight script** (`scripts/preflight.js`) detects the missing `.env` and automatically launches a **Web Setup Wizard** in your browser. Fill in your API keys there and it will write the `.env` for you.

Alternatively, copy `.env.example` to `.env` and fill it in manually:

```bash
cp .env.example .env
```

### 2. Minimal `.env`

```env
# Required — narration
VITE_LLM_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
VITE_LLM_API_BASE=https://openrouter.ai/api/v1
VITE_LLM_MODEL=deepseek/deepseek-v4-flash

# Optional — scene art (leave blank to disable)
VITE_IMAGE_ROUTER_API_KEY=
VITE_IMAGE_MODEL=stabilityai/sdxl-turbo

# Optional — cloud saves & multiplayer (leave blank for solo/local only)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

> **Tip:** Any OpenAI-compatible endpoint works. Point `VITE_LLM_API_BASE` at `https://api.openai.com/v1`, your local Llama.cpp/Ollama server, or any other provider.

### 3. Play

Open <http://localhost:3000>, watch the splash, then either:

- **Play anonymously** — solo, saved to `localStorage`. No account needed.
- **Sign in** — create an account (Supabase Auth) to enable cloud campaigns.

Create a campaign → choose **Quick Start** (a pre-made hero) or **Custom** creation (Name → Race → Class → Stats → Skills → Feats → Spells → Gear → Starting Grounds) → start playing.

---

## Playing the Game

### The Adventure Screen

| Area | What it does |
|---|---|
| **Chat Log (center)** | The GM's narration, your actions, system logs. Filterable, searchable, and exportable. |
| **Character Sheet (left)** | Your hero's HP, AC, stats, skills, inventory, spellbook, conditions, feats, and resources. Edit anything inline; click spells, items, and conditions for detail popups. |
| **Journal tab** | Active quests + categorized lore (NPCs, Locations, History, Items) the GM has logged. |
| **Compendium (📖)** | In-app reference browser: glossary, all conditions + exhaustion levels, rules tables, the full spell catalog, and SRD items. Read-only, pulls from the same data the engine uses. |
| **Combat Tracker** | Slides in during fights — shows initiative order, current turn, HP bars, conditions. |
| **Atmosphere image** | Generated scene art behind the chat. Click to expand fullscreen. |
| **Action Queue** (multiplayer) | Queue up actions/dialogue and resolve them as a batched "party turn". |
| **Quick Actions** | One-tap buttons for your prepared spells, equipped weapons, class resources, skills, saves, and potions. |
| **Suggested Actions** (opt-in) | Per-turn LLM-suggested next actions, shown as clickable chips above the input. |
| **Onboarding tour** | Auto-launches once on first play; replayable from Settings. |
| **Voice input & TTS** | Microphone button for speech-to-text; speaker icon to hear the GM. |

### Common Actions

Just type naturally — the GM figures out the mechanics.

- `I swing my longsword at the goblin` → engine rolls to-hit + damage
- `I cast fireball at the two orcs` → `cast_spell` rolls saves + AoE damage
- `I try to pick the lock` → `check_skill` rolls Sleight of Hand vs DC
- `I search the room for traps` → Perception check
- `I take a long rest` → full heal, hit dice recovered, time advances 8h
- `I travel to Neverwinter along the high road` → route-based travel with random encounters
- `I buy a healing potion` → inventory update + gold deducted

### Keyboard / UX Shortcuts

- Click the **rewind arrow** next to your last message to undo & retry a turn.
- Click **any dice result** to see the breakdown (d20, modifier, total, DC/AC, crit/fumble).
- The **Resolve Turn** button appears when it's the enemy's turn — the engine auto-rolls their attacks.
- **Settings (⚙)** lets you toggle debug mode, atmosphere art, voice, and TTS speed/pitch.

---

## Character Creation

When you start a new campaign you first choose between two paths:

- **Quick Start** — pick one of 10 pre-made level-1 heroes (spanning every race and a spread of classes), then choose your starting grounds. Fastest way into the game.
- **Custom Character** — the full creation wizard.

### The Creation Wizard

The 10–12 step wizard walks you through a fully SRD-compliant build:

1. **Name** — your hero's identity (with optional backstory)
2. **Race** — from Human to Dragonborn (pick your Draconic Ancestry)
3. **Class** — Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard
4. **Subclass** (early-path classes only — e.g. Cleric Domain at L1)
5. **Stats** — point-buy / standard array style allocation
6. **Skills** — choose proficiencies based on class skill list
7. **Feats & ASI** — at ASI levels (1, 4, 8, 12, 16, 19) take a feat or +2 stat points
8. **Subclass** (late-path classes — e.g. Wizard Arcane Tradition at L2)
9. **Spells** (casters only) — pick cantrips + known/prepared spells
10. **Gear** — starting equipment from your class
11. **Review** — final summary, finalize to enter the world
12. **Starting Grounds** — pick one of 4 LLM-generated taverns/inns (new campaigns only)

---

## Multiplayer & Cloud Campaigns

When signed in via Supabase:

- **Create a campaign** from the dashboard — you become the host.
- **Share the Campaign ID** (copy button in the header) with friends.
- **They join** by entering the ID at the dashboard.
- Every action **syncs to Supabase in realtime** — all players see the same narration, dice, and state.
- The active player's turn **locks the campaign** to prevent race conditions; others can queue actions.
- Delete / rename campaigns from the dashboard.

Don't want an account? **Anonymous mode** works fully offline — your save lives in `localStorage`.

---

## Deployment

### Vercel (recommended)

The repo is Vercel-ready:

1. Push to GitHub.
2. Import the repo at <https://vercel.com/new>.
3. Set your environment variables in the Vercel dashboard.
4. For production, set `VITE_LLM_API_BASE=/api` to route through the **built-in proxy** at `api/chat/completions.ts` (avoids CORS and hides the upstream URL).

`vercel.json` already rewrites all routes to `index.html` for SPA behavior.

### Other static hosts

```bash
npm run build      # outputs to dist/
npm run preview    # local preview of the build
```

Upload `dist/` to any static host (Netlify, Cloudflare Pages, GitHub Pages, S3, etc.). Make sure your LLM provider allows CORS from your domain, or run your own proxy.

---

## npm Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Preflight check + Vite dev server (port 3000) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run unit/component tests (Vitest, bails on first failure) |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Run tests with V8 coverage report |
| `npm run test:ci` | Verbose test run (run locally before pushing — no CI is currently configured) |
| `npm run test:live` | Run live LLM integration tests in `tests/live/` |
| `npm run test:live:tier3` | Run scenario-based live tests via `tsx` |
| `npm run test:all` | Unit tests + tier-3 live scenarios |
| `npm run lint` | ESLint over all `.ts` / `.tsx` |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run check:jsonclone` | Counts `JSON.parse(JSON.stringify(...))` deep-clone usages (diagnostic) |
| `npm run install-app` | Guided CLI installer (`scripts/install.js`) |
| `npm run prepare` | Sets up Husky pre-commit hooks |

---

## Environment Variables Reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_LLM_API_KEY` | **Yes** | — | API key for your LLM provider |
| `VITE_LLM_API_BASE` | No | `https://openrouter.ai/api/v1` | OpenAI-compatible endpoint. Use `/api` in prod for the built-in proxy. |
| `VITE_LLM_MODEL` | No | `deepseek/deepseek-v4-flash` | Model ID for narration + tool-use |
| `VITE_SUMMARIZATION_MODEL` | No | `xiaomi/mimo-v2.5` | Fast non-thinking model for context compression |
| `VITE_IMAGE_ROUTER_API_KEY` | No | — | ImageRouter key (blank disables art) |
| `VITE_IMAGE_MODEL` | No | `stabilityai/sdxl-turbo` | Image generation model |
| `VITE_SUPABASE_URL` | No | — | Supabase project URL (blank = local-only) |
| `VITE_SUPABASE_ANON_KEY` | No | — | Supabase anon/public key |
| `VITE_CONTEXT_RAW_CAP` | No | `30000` | Token threshold to compress raw history into a checkpoint |
| `VITE_CONTEXT_BUDGET` | No | `180000` | Max token budget before old checkpoints are evicted |
| `VITE_LLM_DISABLE_THINKING` | No | — | Set to `true` to disable reasoning traces on supporting models |

---

## Troubleshooting

**The GM isn't responding / errors out.**
Check your `VITE_LLM_API_KEY` and `VITE_LLM_API_BASE`. Open Settings → enable **Debug Mode** to see every request, tool call, and response in the console.

**No scene art is generating.**
You need a valid `VITE_IMAGE_ROUTER_API_KEY`. Leave it blank to disable the feature gracefully.

**Multiplayer isn't syncing.**
Make sure both players are signed in and share the **exact** Campaign ID. The host must be online — state syncs through their campaign row in Supabase.

**My saves disappeared.**
Anonymous play saves to `localStorage` only — clearing your browser wipes it. Create a Supabase account for persistent cloud saves.

**A tool call failed / state got weird.**
Click the **rewind arrow** next to your last action — it restores the snapshot from before the turn and retries. There's also an emergency snapshot fallback.

---

## License

[MIT](./LICENSE) © 2026 Preston Michael

---

## Contributing

This is a personal project but issues and PRs are welcome. Before submitting:

1. `npm run lint` — must pass
2. `npm test` — must pass (run `npm run test:ci` locally for verbose output before pushing)
3. Live tests (`npm run test:live`) require a real LLM key and shouldn't be run in a CI runner

For the full developer reference — file structure, services, the agent loop, context pipeline, and how everything ties together — see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.
