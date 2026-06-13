/**
 * v2.2.4 — Health Check 客户端
 *
 * 调 /api/health-check 拉 provider 配置状态
 * 失败容错: 网络错 → 抛回给调用方处理
 */
export interface ProviderStatus {
  name: 'mimo' | 'openai' | 'anthropic';
  envKeyName: string;
  hasKey: boolean;
  isActive: boolean;
  model: string;
}

export interface HealthCheckResponse {
  ok: boolean;
  activeProvider: 'mimo' | 'openai' | 'anthropic';
  activeReady: boolean;
  activeModel?: string;
  hint: string;
  providers: ProviderStatus[];
  timestamp: string;
}

export async function fetchHealthCheck(): Promise<HealthCheckResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const resp = await fetch('/api/health-check', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    return (await resp.json()) as HealthCheckResponse;
  } finally {
    clearTimeout(timeout);
  }
}
