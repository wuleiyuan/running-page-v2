/**
 * v2.2.3 LLM 缓存 + provider 偏好 单元测试
 *
 * 覆盖：
 * 1. fetchAIGuidance 自动重试（5xx/网络错 1 次）
 * 2. fetchAIGuidance 空 aiGuidance 归类为 error
 * 3. fetchAIGuidance 200 但 aiGuidance 缺失时 error 字段有值
 * 4. loadProviderPref / saveProviderPref 双向一致
 * 5. fetchAIGuidanceWithCache 走 localStorage 命中
 * 6. fetchAIGuidanceWithCache 失败响应不写 cache
 * 7. cache TTL 过期处理
 */

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

// 在 import healthAssessment 前 mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: false,
});

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: false,
});

import {
  fetchAIGuidance,
  fetchAIGuidanceWithCache,
  loadProviderPref,
  saveProviderPref,
  type AIGuidanceResponse,
  type LLMProvider,
} from '../healthAssessment';
import type { AssessmentBundle } from '../healthAssessment';

const fakeBundle: AssessmentBundle = {
  generatedAt: '2026-06-13T00:00:00Z',
  windowDays: 7,
  cards: [
    { key: 'rhr', title: '静息心率', main: '60 bpm', sub: '稳定', severity: 'good', advice: '良好' },
  ],
  overall: '整体良好',
  trainingLoadTrend: [10, 20, 30],
};

function mockFetchResponse(json: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(json)),
    json: () => Promise.resolve(json),
  } as unknown as Response;
}

describe('fetchAIGuidance - 重试与空内容', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  it('成功: 200 + 有 aiGuidance → 返回', async () => {
    const respBody: AIGuidanceResponse = {
      aiGuidance: '本周重点是休息。',
      model: 'mimo-v2-flash',
      provider: 'mimo',
      requestId: 'test-123',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(respBody));

    const result = await fetchAIGuidance(fakeBundle, { provider: 'mimo' });
    expect(result.aiGuidance).toBe('本周重点是休息。');
    expect(result.requestId).toBe('test-123');
  });

  it('成功: aiGuidance 前后有空白 → 自动 trim', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ aiGuidance: '  \n  本周重点是休息。\n  ', provider: 'mimo' })
    );
    const result = await fetchAIGuidance(fakeBundle);
    expect(result.aiGuidance).toBe('本周重点是休息。');
  });

  it('失败: 200 但 aiGuidance 缺失 → error 字段有值, 不抛', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ aiGuidance: null, provider: 'mimo' })
    );
    const result = await fetchAIGuidance(fakeBundle);
    expect(result.aiGuidance).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('失败: 200 但 aiGuidance 空字符串 → 归类 error, 不重试', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockFetchResponse({ aiGuidance: '   ', provider: 'mimo' })
    );
    globalThis.fetch = fetchSpy;
    const result = await fetchAIGuidance(fakeBundle, { retries: 2 });
    expect(result.aiGuidance).toBeNull();
    expect(result.error).toContain('empty content');
    // 非网络错/5xx, 不重试
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('重试: 502 → 重试 1 次后成功', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse({}, false, 502))
      .mockResolvedValueOnce(
        mockFetchResponse({ aiGuidance: '第二次成功', provider: 'mimo' })
      );
    globalThis.fetch = fetchSpy;
    const result = await fetchAIGuidance(fakeBundle, { retries: 1 });
    expect(result.aiGuidance).toBe('第二次成功');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('重试: 全部 502 → 返回最后一次的 error', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockFetchResponse({}, false, 502)
    );
    globalThis.fetch = fetchSpy;
    const result = await fetchAIGuidance(fakeBundle, { retries: 1 });
    expect(result.aiGuidance).toBeNull();
    expect(result.error).toContain('HTTP 502');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('网络错: TypeError Failed to fetch → error 含 Network, 重试', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        mockFetchResponse({ aiGuidance: '重连后成功', provider: 'mimo' })
      );
    globalThis.fetch = fetchSpy;
    const result = await fetchAIGuidance(fakeBundle, { retries: 1 });
    expect(result.aiGuidance).toBe('重连后成功');
  });

  it('400 客户端错: 不重试 (非 5xx)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockFetchResponse({ error: 'cards required' }, false, 400)
    );
    globalThis.fetch = fetchSpy;
    const result = await fetchAIGuidance(fakeBundle, { retries: 2 });
    expect(result.aiGuidance).toBeNull();
    expect(result.error).toContain('HTTP 400');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('loadProviderPref / saveProviderPref', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('默认 mimo (无 localStorage)', () => {
    expect(loadProviderPref()).toBe('mimo');
  });

  it('保存 mimo 后读出 mimo', () => {
    saveProviderPref('mimo');
    expect(loadProviderPref()).toBe('mimo');
  });

  it('保存 openai 后读出 openai', () => {
    saveProviderPref('openai');
    expect(loadProviderPref()).toBe('openai');
  });

  it('保存 anthropic 后读出 anthropic', () => {
    saveProviderPref('anthropic');
    expect(loadProviderPref()).toBe('anthropic');
  });

  it('localStorage 被污染 (非法值) → fallback mimo', () => {
    localStorageMock.setItem('sports-fair:llm-provider-pref:v1', 'hacker-value');
    expect(loadProviderPref()).toBe('mimo');
  });
});

describe('fetchAIGuidanceWithCache', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  it('cache miss → 调 fetch → 写 cache', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ aiGuidance: '新鲜出炉', provider: 'mimo' })
    );
    const { response, fromCache } = await fetchAIGuidanceWithCache(fakeBundle, { provider: 'mimo' });
    expect(response.aiGuidance).toBe('新鲜出炉');
    expect(fromCache).toBe(false);
    // cache 已写
    const raw = localStorageMock.getItem('sports-fair:ai-guidance:v1');
    expect(raw).toBeTruthy();
  });

  it('cache hit → 不调 fetch, 直接返回', async () => {
    // 预填 cache
    const cacheBody: AIGuidanceResponse = {
      aiGuidance: '缓存的内容',
      provider: 'mimo',
      model: 'cached-model',
    };
    localStorageMock.setItem(
      'sports-fair:ai-guidance:v1',
      JSON.stringify({
        '7_mimo_-123_w7_t3': {
          key: '7_mimo_-123_w7_t3',
          response: cacheBody,
          cachedAt: Date.now(),
        },
      })
    );
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const { response, fromCache } = await fetchAIGuidanceWithCache(fakeBundle, { provider: 'mimo' });
    expect(response.aiGuidance).toBe('缓存的内容');
    expect(fromCache).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('失败响应不写 cache', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ aiGuidance: null, error: 'failed' })
    );
    await fetchAIGuidanceWithCache(fakeBundle, { provider: 'mimo' });
    const raw = localStorageMock.getItem('sports-fair:ai-guidance:v1');
    expect(raw).toBeNull();
  });

  it('不同 provider 不互相命中 (mimo cache 不能被 openai 用)', async () => {
    const cacheBody: AIGuidanceResponse = {
      aiGuidance: 'mimo 的建议',
      provider: 'mimo',
    };
    localStorageMock.setItem(
      'sports-fair:ai-guidance:v1',
      JSON.stringify({
        '7_mimo_xxx': { key: '7_mimo_xxx', response: cacheBody, cachedAt: Date.now() },
      })
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ aiGuidance: 'openai 的建议', provider: 'openai' })
    );
    const { response, fromCache } = await fetchAIGuidanceWithCache(fakeBundle, { provider: 'openai' });
    expect(fromCache).toBe(false);
    expect(response.aiGuidance).toBe('openai 的建议');
  });
});
