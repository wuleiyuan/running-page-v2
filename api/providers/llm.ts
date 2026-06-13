/**
 * v2.2.1 — LLM Provider 抽象层
 *
 * 目的：让前端 / 部署方可在不改动主 handler 的情况下切换 LLM 提供商。
 * 当前实现：
 *   - mimo      (小米 MiMo, OpenAI 兼容)
 *   - openai    (gpt-4o-mini 等)
 *   - anthropic (claude-haiku 等)
 *
 * 切换方式：
 *   1. Vercel dashboard 环境变量 `LLM_PROVIDER=mimo` (默认)
 *   2. 配对应 key: MIMO_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
 *
 * 加新 provider 步骤：
 *   1. 在此文件下加 type ProviderName
 *   2. 加一个 createXxxProvider() 函数
 *   3. 在 PROVIDERS 字典里登记
 */

export type ProviderName = 'mimo' | 'openai' | 'anthropic';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 短超时（毫秒），provider 内部实现 */
  timeoutMs?: number;
}

export interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: LLMUsage;
  /** provider 标识（用于前端徽章 / 日志） */
  provider: ProviderName;
}

export interface LLMProvider {
  name: ProviderName;
  /** 用户在 dashboard 配的 env key 名（用于启动时校验 + 文档） */
  envKeyName: string;
  /** 默认模型 */
  defaultModel: string;
  /** provider 自己的 base URL（可被 env 覆盖） */
  defaultBaseUrl: string;
  /** 实际发请求 */
  call(req: LLMRequest): Promise<LLMResponse>;
}

// ============================================================
// 1. MiMo (小米, OpenAI 兼容)
// ============================================================

interface MiMoProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

function createMimoProvider(opts: MiMoProviderOptions): LLMProvider {
  const baseUrl = opts.baseUrl || 'https://api.xiaomimimo.com/v1';
  const model = opts.model || 'mimo-v2-flash';

  return {
    name: 'mimo',
    envKeyName: 'MIMO_API_KEY',
    defaultModel: 'mimo-v2-flash',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',

    async call(req: LLMRequest): Promise<LLMResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 10_000);

      try {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: req.model ?? model,
            messages: req.messages,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 400,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`MiMo HTTP ${resp.status}: ${err.slice(0, 200)}`);
        }

        const data = await resp.json();
        return {
          content: data.choices?.[0]?.message?.content?.trim() || '',
          model: data.model ?? model,
          usage: data.usage,
          provider: 'mimo',
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

// ============================================================
// 2. OpenAI (gpt-4o-mini / gpt-3.5-turbo / o4-mini 等)
// ============================================================

function createOpenAIProvider(opts: MiMoProviderOptions): LLMProvider {
  const baseUrl = opts.baseUrl || 'https://api.openai.com/v1';
  const model = opts.model || 'gpt-4o-mini';

  return {
    name: 'openai',
    envKeyName: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',

    async call(req: LLMRequest): Promise<LLMResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 10_000);

      try {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: req.model ?? model,
            messages: req.messages,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 400,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`OpenAI HTTP ${resp.status}: ${err.slice(0, 200)}`);
        }

        const data = await resp.json();
        return {
          content: data.choices?.[0]?.message?.content?.trim() || '',
          model: data.model ?? model,
          usage: data.usage,
          provider: 'openai',
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

// ============================================================
// 3. Anthropic (claude-haiku / claude-sonnet 等，API 格式不一样)
// ============================================================

interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

function createAnthropicProvider(opts: AnthropicProviderOptions): LLMProvider {
  const baseUrl = opts.baseUrl || 'https://api.anthropic.com/v1';
  const model = opts.model || 'claude-haiku-4-5';

  return {
    name: 'anthropic',
    envKeyName: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-4-5',
    defaultBaseUrl: 'https://api.anthropic.com/v1',

    async call(req: LLMRequest): Promise<LLMResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 12_000);

      try {
        // Anthropic Messages API 格式与 OpenAI 不同：system 单独字段
        const systemMsg = req.messages.find((m) => m.role === 'system');
        const userMsgs = req.messages.filter((m) => m.role !== 'system');

        const body: Record<string, unknown> = {
          model: req.model ?? model,
          max_tokens: req.maxTokens ?? 400,
          temperature: req.temperature ?? 0.7,
          messages: userMsgs,
        };
        if (systemMsg) {
          body.system = systemMsg.content;
        }

        const resp = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': opts.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Anthropic HTTP ${resp.status}: ${err.slice(0, 200)}`);
        }

        const data = await resp.json();
        return {
          content: data.content?.[0]?.text?.trim() || '',
          model: data.model ?? model,
          usage: data.usage
            ? {
                prompt_tokens: data.usage.input_tokens,
                completion_tokens: data.usage.output_tokens,
                total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
              }
            : undefined,
          provider: 'anthropic',
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

// ============================================================
// Factory
// ============================================================

export interface BuildProviderOptions {
  /** 用户在 env 指定的 provider 名，默认 'mimo' */
  providerName?: ProviderName;
}

export function buildProvider(opts: BuildProviderOptions = {}): LLMProvider {
  const name: ProviderName = opts.providerName ?? 'mimo';

  switch (name) {
    case 'mimo': {
      const apiKey = process.env.MIMO_API_KEY;
      if (!apiKey) throw new Error('MIMO_API_KEY not configured');
      return createMimoProvider({
        apiKey,
        baseUrl: process.env.MIMO_BASE_URL,
        model: process.env.MIMO_MODEL,
      });
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
      return createOpenAIProvider({
        apiKey,
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL,
      });
    }
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
      return createAnthropicProvider({
        apiKey,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
        model: process.env.ANTHROPIC_MODEL,
      });
    }
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}
