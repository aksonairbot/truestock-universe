---
name: Skynet LLM routing
description: LLM router at apps/web/lib/llm.ts — auto-fallback chain (Ollama→DeepSeek→Anthropic), knowledge digest injection, provider configs
type: reference
originSessionId: 578800ae-3af6-4391-b443-4c882ff6a97b
---
**LLM Router:** `apps/web/lib/llm.ts`. Single entry: `llm.complete({system?, prompt, jsonSchema?, sensitivity?, provider?, model?, ...})`.

**Auto-fallback chain (shipped 2026-05-13):**
- `sensitivity: "internal"` (default) → tries Ollama → DeepSeek → Anthropic in order
- `sensitivity: "sensitive"` → tries Anthropic → DeepSeek (never Ollama)
- If a provider fails (timeout, HTTP error, network), it logs a warning and tries the next one automatically
- Only throws if ALL providers in the chain fail
- Forced provider (`provider: "deepseek"`) skips fallback — uses only that provider

**Shared Ollama droplet:** `139.59.71.143` ("Monk project"). 2 vCPU / 4 GB, BLR1. Models:
- `qwen3:8b` (5.2 GB) — **default for everything structured.** ~5–15s cold, ~1–2s warm
- `mistral-small:24b` (14 GB) — reserve for prose summaries
- `gemma3:4b` (3.3 GB) — fastest, for high-volume classification

**Network:** Monk and Skynet connected via DO regional eth1 at `10.122.0.0/20`: Monk = `10.122.0.5`, Skynet = `10.122.0.6`. Ollama binds `0.0.0.0:11434`; ufw allows from `10.122.0.0/20` only.

**Env vars on Skynet (`/opt/truestock-universe/.env`):**
- `OLLAMA_BASE_URL=http://10.122.0.5:11434`
- `OLLAMA_DEFAULT_MODEL=qwen3:8b`
- `DEEPSEEK_API_KEY=` (set if available)
- `ANTHROPIC_API_KEY=` (set if available)

**Ollama quirk:** passes `think: false` — qwen3/deepseek-r1-style models default thinking ON and burn `num_predict` on internal reasoning. JSON tasks come back empty unless we disable it.

**Knowledge digest injection (shipped 2026-05-13):**
Both `triage-action.ts` and `clarity-action.ts` call `getDigestContext()` from `lib/knowledge-digest.ts` and append it to the system prompt. The digest contains project snapshots, team patterns, recent completions, and active themes — so the AI knows what the team is working on without being told each time.

**How to apply:**
- For task-text-only features just call `llm.complete({...})` — fallback handles reliability
- For customer data, pass `sensitivity: "sensitive"`
- New model? `ollama pull <model>` on Monk, then bump env var or pass `model: "name"` per call
