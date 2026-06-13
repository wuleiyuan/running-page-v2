/**
 * v2.2.1 — AI 个性化健康建议 (Vercel Function)
 *
 * v2.2.0: 直接调 MiMo
 * v2.2.1: 接入 LLM Provider 抽象层 (api/providers/llm.ts)
 *          - 支持 mimo / openai / anthropic 三家
 *          - 切换方式: Vercel env `LLM_PROVIDER=openai` (默认 mimo)
 *          - 配对应 key: MIMO_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
 *
 * 设计原则：
 *   1. Key 全部从 process.env.* 读，不入代码不入日志
 *   2. provider 切换不改 handler
 *   3. 失败返回 { aiGuidance: null, error }，前端降级到 bundle.overall
 *   4. 60s Edge Cache 兜底（同 windowDays 命中）
 *   5. 启动时校验 provider 配置，错时直接 500 暴露（避免静默失败）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildProvider, type LLMMessage, type ProviderName } from './providers/llm';

interface AssessCardSummary {
  key: string;
  title: string;
  main: string;
  sub: string;
  severity: 'good' | 'watch' | 'warn' | 'urgent';
  advice: string;
}

interface RequestBody {
  windowDays: 7 | 30;
  overall: string;
  cards: AssessCardSummary[];
  /** 训练负荷 7 天每日 TRIMP 趋势（可选） */
  trainingLoadTrend?: number[];
  /** v2.2.1: 前端可选指定 provider（不传则用 env LLM_PROVIDER） */
  provider?: ProviderName;
}

function buildPrompt(body: RequestBody): LLMMessage[] {
  const { windowDays, overall, cards, trainingLoadTrend } = body;

  const cardsText = cards
    .map((c) => {
      const sevMap = { good: '良好', watch: '关注', warn: '警告', urgent: '紧急' };
      return `- ${c.title}：${c.main}（${c.sub}）— 状态：${sevMap[c.severity]}\n  静态建议：${c.advice}`;
    })
    .join('\n');

  const trendText =
    trainingLoadTrend && trainingLoadTrend.length > 0
      ? `\n近 7 天每日训练负荷 (TRIMP)：${trainingLoadTrend.map((v) => v.toFixed(0)).join(', ')}`
      : '';

  const system = `你是一位经验丰富的运动健康教练 + 数据分析师，专长是基于用户的近期健康指标和训练记录，给出**个性化、可执行、有温度**的建议。

**严格要求**：
1. 必须**基于提供的数据**，不要编造用户没提供的指标
2. 给出 3 段结构化建议（每段 1-2 句，共 80-150 字）：
   - 【本周重点】1 句：本周最该关注什么
   - 【训练建议】1-2 句：具体怎么调整训练（强度/频次/恢复）
   - 【生活建议】1 句：饮食/睡眠/心态方面
3. 语言：简体中文，口语化、像教练直接对话
4. **禁止医学诊断**（如"你有冠心病"），如发现紧急情况建议就医
5. 输出**纯文本**，不要 markdown 不要项目符号`;

  const user = `【评估窗口】近 ${windowDays} 天
【综合判定】${overall}

【各指标详情】
${cardsText}${trendText}

请基于以上数据，给这位用户的 AI 个性化建议。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body || {}) as RequestBody;

  // 校验
  if (!body.cards || !Array.isArray(body.cards) || body.cards.length === 0) {
    return res.status(400).json({ error: 'cards required' });
  }
  if (body.windowDays !== 7 && body.windowDays !== 30) {
    return res.status(400).json({ error: 'windowDays must be 7 or 30' });
  }

  // 60s CDN cache
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');

  // 构建 provider
  let provider;
  try {
    provider = buildProvider({ providerName: body.provider });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[assess-ai] Provider init failed:', msg);
    return res.status(500).json({
      aiGuidance: null,
      error: msg,
      hint: 'Set LLM_PROVIDER env + the corresponding API key (MIMO_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)',
    });
  }

  // 调 LLM
  try {
    const result = await provider.call({
      messages: buildPrompt(body),
      temperature: 0.7,
      maxTokens: 400,
      timeoutMs: 10_000,
    });

    if (!result.content) {
      return res.status(502).json({
        aiGuidance: null,
        error: 'LLM returned empty content',
        provider: provider.name,
      });
    }

    return res.status(200).json({
      aiGuidance: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[assess-ai] LLM call failed:', msg);
    return res.status(502).json({
      aiGuidance: null,
      error: msg,
      provider: provider.name,
    });
  }
}
