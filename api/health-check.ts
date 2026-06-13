/**
 * v2.2.1 — Health Check 端点
 *
 * 用途：
 *   用户访问 GET /api/health-check 看 LLM provider 配置是否正确
 *   不暴露 key，只暴露 "是否配置了" + provider 名 + model 名
 *
 * 安全：
 *   - 不打印、不返回任何 key 内容
 *   - 仅返回布尔 hasKey
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ProviderName } from './providers/llm';

interface ProviderStatus {
  name: ProviderName;
  envKeyName: string;
  hasKey: boolean;
  isActive: boolean;
  model: string;
}

const ACTIVE_PROVIDER = (process.env.LLM_PROVIDER as ProviderName) || 'mimo';

function checkProvider(name: ProviderName, envKeyName: string, defaultModel: string, modelEnvKey: string): ProviderStatus {
  const apiKey = process.env[envKeyName];
  const model = process.env[modelEnvKey] || defaultModel;
  return {
    name,
    envKeyName,
    hasKey: !!apiKey && apiKey.length > 0,
    isActive: name === ACTIVE_PROVIDER,
    model,
  };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 不缓存（status 经常变）
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const providers: ProviderStatus[] = [
    checkProvider('mimo', 'MIMO_API_KEY', 'mimo-v2-flash', 'MIMO_MODEL'),
    checkProvider('openai', 'OPENAI_API_KEY', 'gpt-4o-mini', 'OPENAI_MODEL'),
    checkProvider('anthropic', 'ANTHROPIC_API_KEY', 'claude-haiku-4-5', 'ANTHROPIC_MODEL'),
  ];

  const active = providers.find((p) => p.isActive);

  return res.status(200).json({
    ok: !!active?.hasKey,
    activeProvider: ACTIVE_PROVIDER,
    activeReady: active?.hasKey ?? false,
    activeModel: active?.model,
    hint: active && !active.hasKey
      ? `Active provider "${ACTIVE_PROVIDER}" is missing ${active.envKeyName}. Set it in Vercel dashboard → Environment Variables.`
      : 'OK',
    providers,
    timestamp: new Date().toISOString(),
  });
}
