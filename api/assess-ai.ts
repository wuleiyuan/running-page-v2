/**
 * v2.2.0 — AI 个性化健康建议 (Vercel Edge Function)
 *
 * 流程：
 *   前端 health-assess.tsx 传入 7/30 天的评估结果
 *   → 本函数拼装 prompt → 调 MiMo (api.xiaomimimo.com) → 返回 AI 建议
 *
 * 设计原则：
 *   1. Key 从 process.env.MIMO_API_KEY 读，不入代码不入日志
 *   2. 设置 10s 短超时（避免慢响应拖垮页面）
 *   3. MiMo 失败时返回 { aiGuidance: null, error }，前端降级到 bundle.overall
 *   4. 60 秒 Edge Cache 兜底（同窗口同日不重复调 LLM）
 *   5. 模型默认 mimo-v2-flash（性价比）；可通过 env MIMO_MODEL 覆盖
 *
 * 环境变量（Vercel dashboard 配置）:
 *   - MIMO_API_KEY   (必填)
 *   - MIMO_MODEL     (可选, 默认 mimo-v2-flash)
 *   - MIMO_BASE_URL  (可选, 默认 https://api.xiaomimimo.com/v1)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

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
}

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2-flash';
const TIMEOUT_MS = 10_000;

function buildPrompt(body: RequestBody): { system: string; user: string } {
  const { windowDays, overall, cards, trainingLoadTrend } = body;

  const cardsText = cards
    .map((c) => {
      const sevMap = { good: '良好', watch: '关注', warn: '警告', urgent: '紧急' };
      return `- ${c.title}：${c.main}（${c.sub}）— 状态：${sevMap[c.severity]}\n  静态建议：${c.advice}`;
    })
    .join('\n');

  const trendText = trainingLoadTrend && trainingLoadTrend.length > 0
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

  return { system, user };
}

async function callMiMo(prompt: { system: string; user: string }): Promise<{
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) {
    throw new Error('MIMO_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`MiMo HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    return {
      content: data.choices?.[0]?.message?.content?.trim() || '',
      usage: data.usage,
    };
  } finally {
    clearTimeout(timeout);
  }
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

  // 简单校验
  if (!body.cards || !Array.isArray(body.cards) || body.cards.length === 0) {
    return res.status(400).json({ error: 'cards required' });
  }
  if (body.windowDays !== 7 && body.windowDays !== 30) {
    return res.status(400).json({ error: 'windowDays must be 7 or 30' });
  }

  // 60s 缓存（Edge cache，相同 windowDays 命中）
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');

  const prompt = buildPrompt(body);

  try {
    const result = await callMiMo(prompt);
    if (!result.content) {
      return res.status(502).json({
        aiGuidance: null,
        error: 'MiMo returned empty content',
      });
    }
    return res.status(200).json({
      aiGuidance: result.content,
      model: MIMO_MODEL,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[assess-ai] MiMo call failed:', msg);
    return res.status(502).json({
      aiGuidance: null,
      error: msg,
    });
  }
}
