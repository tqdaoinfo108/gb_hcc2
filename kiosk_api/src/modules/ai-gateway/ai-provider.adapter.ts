import { AiProvider } from '@prisma/client';

/** A resolved runner config the adapters need (authKey already decrypted). */
export interface RunnerConfig {
  provider: AiProvider;
  endpoint: string;
  modelName: string;
  authKey?: string;
  timeoutMs: number;
}

export interface GenerateInput {
  system?: string;
  prompt: string;
  /** Ask the provider to return strict JSON when supported. */
  json?: boolean;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
}

/** Common interface every provider adapter implements. */
export interface AiProviderAdapter {
  generate(cfg: RunnerConfig, input: GenerateInput): Promise<GenerateResult>;
  /** Cheap liveness probe — returns latency in ms or throws. */
  probe(cfg: RunnerConfig): Promise<number>;
}

/* ── shared fetch with timeout ─────────────────────────── */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/* ════════════════════════════════════════════════════════
   OLLAMA  (local LLM)  —  POST {endpoint}/api/chat
═══════════════════════════════════════════════════════════ */
class OllamaAdapter implements AiProviderAdapter {
  async generate(cfg: RunnerConfig, input: GenerateInput): Promise<GenerateResult> {
    const t0 = Date.now();
    const res = await fetchWithTimeout(`${trimSlash(cfg.endpoint)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.modelName,
        stream: false,
        format: input.json ? 'json' : undefined,
        options: { temperature: input.temperature ?? 0.2 },
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.prompt },
        ],
      }),
    }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data: any = await res.json();
    return {
      text: data?.message?.content ?? '',
      latencyMs: Date.now() - t0,
      tokensIn: data?.prompt_eval_count,
      tokensOut: data?.eval_count,
    };
  }

  async probe(cfg: RunnerConfig): Promise<number> {
    const t0 = Date.now();
    const res = await fetchWithTimeout(`${trimSlash(cfg.endpoint)}/api/tags`, { method: 'GET' }, 5000);
    if (!res.ok) throw new Error(`Ollama probe HTTP ${res.status}`);
    return Date.now() - t0;
  }
}

/* ════════════════════════════════════════════════════════
   GEMINI  —  POST {endpoint}/v1beta/models/{model}:generateContent
═══════════════════════════════════════════════════════════ */
class GeminiAdapter implements AiProviderAdapter {
  async generate(cfg: RunnerConfig, input: GenerateInput): Promise<GenerateResult> {
    const t0 = Date.now();
    const base = trimSlash(cfg.endpoint || 'https://generativelanguage.googleapis.com');
    const url = `${base}/v1beta/models/${cfg.modelName}:generateContent?key=${cfg.authKey ?? ''}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: input.system ? { parts: [{ text: input.system }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          responseMimeType: input.json ? 'application/json' : 'text/plain',
        },
      }),
    }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data: any = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? '').join('');
    return {
      text,
      latencyMs: Date.now() - t0,
      tokensIn: data?.usageMetadata?.promptTokenCount,
      tokensOut: data?.usageMetadata?.candidatesTokenCount,
    };
  }

  async probe(cfg: RunnerConfig): Promise<number> {
    const t0 = Date.now();
    const base = trimSlash(cfg.endpoint || 'https://generativelanguage.googleapis.com');
    const res = await fetchWithTimeout(
      `${base}/v1beta/models?key=${cfg.authKey ?? ''}`, { method: 'GET' }, 5000,
    );
    if (!res.ok) throw new Error(`Gemini probe HTTP ${res.status}`);
    return Date.now() - t0;
  }
}

/* ════════════════════════════════════════════════════════
   OPENAI-COMPATIBLE  (OpenAI, vLLM, LM Studio, private)
   POST {endpoint}/v1/chat/completions
═══════════════════════════════════════════════════════════ */
class OpenAiCompatAdapter implements AiProviderAdapter {
  async generate(cfg: RunnerConfig, input: GenerateInput): Promise<GenerateResult> {
    const t0 = Date.now();
    const res = await fetchWithTimeout(`${trimSlash(cfg.endpoint)}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.authKey ? { Authorization: `Bearer ${cfg.authKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.modelName,
        temperature: input.temperature ?? 0.2,
        response_format: input.json ? { type: 'json_object' } : undefined,
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.prompt },
        ],
      }),
    }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`);
    const data: any = await res.json();
    return {
      text: data?.choices?.[0]?.message?.content ?? '',
      latencyMs: Date.now() - t0,
      tokensIn: data?.usage?.prompt_tokens,
      tokensOut: data?.usage?.completion_tokens,
    };
  }

  async probe(cfg: RunnerConfig): Promise<number> {
    const t0 = Date.now();
    const res = await fetchWithTimeout(`${trimSlash(cfg.endpoint)}/v1/models`, {
      method: 'GET',
      headers: cfg.authKey ? { Authorization: `Bearer ${cfg.authKey}` } : {},
    }, 5000);
    if (!res.ok) throw new Error(`OpenAI-compat probe HTTP ${res.status}`);
    return Date.now() - t0;
  }
}

const OLLAMA = new OllamaAdapter();
const GEMINI = new GeminiAdapter();
const OPENAI = new OpenAiCompatAdapter();

/** Resolve the adapter for a provider. PRIVATE defaults to OpenAI-compatible. */
export function getAdapter(provider: AiProvider): AiProviderAdapter {
  switch (provider) {
    case AiProvider.OLLAMA: return OLLAMA;
    case AiProvider.GEMINI: return GEMINI;
    case AiProvider.OPENAI_COMPAT:
    case AiProvider.PRIVATE:
    default: return OPENAI;
  }
}
