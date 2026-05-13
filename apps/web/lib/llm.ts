// apps/web/lib/llm.ts
//
// Lightweight LLM router. One entry point — `llm.complete(...)` — that picks
// the right provider based on data sensitivity + which env vars are set.
//
// Providers in priority order:
//   sensitivity = "internal" (default)  → ollama → deepseek → anthropic
//   sensitivity = "sensitive"           → anthropic → deepseek (never ollama)
//
// Why these rules:
//   - Internal task text (titles, descriptions, comments) is fine on the
//     self-hosted Ollama box; cheap and private.
//   - Anything that quotes customer-facing data (Razorpay refund notes,
//     customer emails, plan amounts) is "sensitive" and stays on Anthropic
//     (US-hosted, contractual data handling). Per the hybrid-routing rule
//     in the Truestock playbook.
//
// Env vars consulted:
//   OLLAMA_BASE_URL          e.g. http://10.47.0.8:11434
//   OLLAMA_DEFAULT_MODEL     e.g. qwen3:8b
//   ANTHROPIC_API_KEY        sk-ant-...
//   ANTHROPIC_DEFAULT_MODEL  e.g. claude-haiku-4-5
//   DEEPSEEK_API_KEY         sk-...
//   DEEPSEEK_DEFAULT_MODEL   e.g. deepseek-chat

import { log } from "@/lib/log";

export type DataSensitivity = "internal" | "sensitive";
export type ProviderName = "ollama" | "anthropic" | "deepseek";

export interface CompletionRequest {
  /** System prompt — sets persona / instruction. */
  system?: string;
  /** User prompt. */
  prompt: string;
  /** When supplied, prompt is augmented with "respond with strict JSON matching this schema"
   *  and the result is parsed into `response.parsed`. */
  jsonSchema?: object;
  /** Hint for the router — defaults to "internal". */
  sensitivity?: DataSensitivity;
  /** Force a provider for this call (overrides routing). */
  provider?: ProviderName;
  /** Override default model for the chosen provider. */
  model?: string;
  /** Sampling temperature. Default 0.2 for stable structured output. */
  temperature?: number;
  /** Max output tokens. Default 1024. */
  maxTokens?: number;
  /** Timeout, ms. Default 30000. */
  timeoutMs?: number;
}

export interface CompletionResponse {
  text: string;
  provider: ProviderName;
  model: string;
  parsed?: unknown;
  parseError?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    durationMs: number;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

class LLMError extends Error {
  constructor(message: string, public provider?: ProviderName) {
    super(message);
    this.name = "LLMError";
  }
}

export const llm = {
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const sensitivity = req.sensitivity ?? "internal";

    // If a specific provider is forced, use only that one (no fallback).
    if (req.provider) {
      return callWithProvider(req, req.provider);
    }

    // Build ordered fallback chain based on sensitivity.
    const chain = providerChain(sensitivity);
    if (chain.length === 0) {
      throw new LLMError(
        `no LLM provider available for sensitivity=${sensitivity}. ` +
          `set OLLAMA_BASE_URL, ANTHROPIC_API_KEY, or DEEPSEEK_API_KEY in .env`,
      );
    }

    let lastError: Error | null = null;
    for (const provider of chain) {
      try {
        return await callWithProvider(req, provider);
      } catch (e) {
        lastError = e as Error;
        log.warn("llm.fallback", {
          failedProvider: provider,
          error: (e as Error).message,
          nextProvider: chain[chain.indexOf(provider) + 1] ?? "none",
        });
      }
    }
    throw new LLMError(
      `all providers failed (tried ${chain.join(" → ")}): ${lastError?.message}`,
      chain[chain.length - 1],
    );
  },

  /** Quick capability check — returns the list of provider names available right now. */
  available(): ProviderName[] {
    const r: ProviderName[] = [];
    if (process.env.OLLAMA_BASE_URL) r.push("ollama");
    if (process.env.ANTHROPIC_API_KEY) r.push("anthropic");
    if (process.env.DEEPSEEK_API_KEY) r.push("deepseek");
    return r;
  },
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** Returns an ordered list of providers to try, based on sensitivity + what's configured. */
function providerChain(sensitivity: DataSensitivity): ProviderName[] {
  const haveOllama = !!process.env.OLLAMA_BASE_URL;
  const haveAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const haveDeepseek = !!process.env.DEEPSEEK_API_KEY;

  const chain: ProviderName[] = [];
  if (sensitivity === "sensitive") {
    if (haveAnthropic) chain.push("anthropic");
    if (haveDeepseek) chain.push("deepseek");
  } else {
    // internal — ollama first, then deepseek, then anthropic
    if (haveOllama) chain.push("ollama");
    if (haveDeepseek) chain.push("deepseek");
    if (haveAnthropic) chain.push("anthropic");
  }
  return chain;
}

/** Execute a single provider call and wrap the result. */
async function callWithProvider(req: CompletionRequest, provider: ProviderName): Promise<CompletionResponse> {
  const started = Date.now();
  let raw: { text: string; model: string; promptTokens?: number; completionTokens?: number };
  try {
    if (provider === "ollama") raw = await callOllama(req);
    else if (provider === "anthropic") raw = await callAnthropic(req);
    else raw = await callDeepseek(req);
  } catch (e) {
    throw new LLMError(`${provider} call failed: ${(e as Error).message}`, provider);
  }
  const out: CompletionResponse = {
    text: raw.text,
    provider,
    model: raw.model,
    usage: {
      promptTokens: raw.promptTokens,
      completionTokens: raw.completionTokens,
      durationMs: Date.now() - started,
    },
  };
  if (req.jsonSchema) {
    const json = extractJson(raw.text);
    if (json !== undefined) out.parsed = json;
    else out.parseError = "model output did not contain valid JSON";
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

async function callOllama(req: CompletionRequest) {
  const base = (process.env.OLLAMA_BASE_URL ?? "").replace(/\/$/, "");
  const model = req.model ?? process.env.OLLAMA_DEFAULT_MODEL ?? "qwen3:8b";
  const useJson = !!req.jsonSchema;

  const body = {
    model,
    messages: [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      { role: "user", content: buildUserPrompt(req) },
    ],
    stream: false,
    format: useJson ? "json" : undefined,
    // qwen3 / deepseek-r1 family default to thinking=true which burns
    // num_predict on internal reasoning before the real answer. For all our
    // structured tasks we want the answer, not the chain-of-thought.
    think: false,
    options: {
      temperature: req.temperature ?? 0.2,
      num_predict: req.maxTokens ?? 1024,
    },
  };

  const res = await fetchWithTimeout(`${base}/api/chat`, body, req.timeoutMs ?? 30_000);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from Ollama: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    text: data.message?.content ?? "",
    model,
    promptTokens: data.prompt_eval_count,
    completionTokens: data.eval_count,
  };
}

// ---------------------------------------------------------------------------
// Anthropic (Messages API — minimal client)
// ---------------------------------------------------------------------------

async function callAnthropic(req: CompletionRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const model = req.model ?? process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-haiku-4-5";
  const body = {
    model,
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature ?? 0.2,
    system: req.system,
    messages: [{ role: "user", content: buildUserPrompt(req) }],
  };
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", body, req.timeoutMs ?? 30_000, {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from Anthropic: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("");
  return {
    text,
    model,
    promptTokens: data.usage?.input_tokens,
    completionTokens: data.usage?.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// DeepSeek (OpenAI-compatible)
// ---------------------------------------------------------------------------

async function callDeepseek(req: CompletionRequest) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const model = req.model ?? process.env.DEEPSEEK_DEFAULT_MODEL ?? "deepseek-chat";
  const body = {
    model,
    messages: [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      { role: "user", content: buildUserPrompt(req) },
    ],
    temperature: req.temperature ?? 0.2,
    max_tokens: req.maxTokens ?? 1024,
    response_format: req.jsonSchema ? { type: "json_object" } : undefined,
  };
  const res = await fetchWithTimeout("https://api.deepseek.com/v1/chat/completions", body, req.timeoutMs ?? 30_000, {
    Authorization: `Bearer ${key}`,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from DeepSeek: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUserPrompt(req: CompletionRequest): string {
  if (!req.jsonSchema) return req.prompt;
  return [
    req.prompt,
    "",
    "Respond with ONLY valid JSON matching this schema (no prose, no markdown fences):",
    JSON.stringify(req.jsonSchema, null, 2),
  ].join("\n");
}

function extractJson(text: string): unknown | undefined {
  // Try direct parse first.
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Look for the first {...} or [...] block.
  }
  const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(extraHeaders ?? {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
