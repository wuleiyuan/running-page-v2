/**
 * v2.2.4 — AIDiagnosticsPanel 组件测试
 *
 * 覆盖：默认折叠 / 展开后 fetch / 失败错误展示 / 成功表格渲染
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: false });
Object.defineProperty(globalThis, 'window', { value: { localStorage: localStorageMock }, writable: false });

// mock healthCheckClient
vi.mock('../../../utils/healthCheckClient', () => ({
  fetchHealthCheck: vi.fn(),
}));

import AIDiagnosticsPanel from '../AIDiagnosticsPanel';
import { fetchHealthCheck } from '../../../utils/healthCheckClient';

describe('AIDiagnosticsPanel', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  it('默认折叠: 只显示 toggle 按钮, 不显示 body', () => {
    render(<AIDiagnosticsPanel />);
    expect(screen.getByText(/AI 配置诊断/)).toBeTruthy();
    // body 不应该出现
    expect(screen.queryByText(/正在检测/)).toBeNull();
  });

  it('autoOpenOnError=true 时默认展开', () => {
    (fetchHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      activeProvider: 'mimo',
      activeReady: false,
      hint: 'test hint',
      providers: [],
      timestamp: '2026-06-13T00:00:00Z',
    });
    render(<AIDiagnosticsPanel autoOpenOnError={true} />);
    // 应自动触发 fetch 并展开
    expect(fetchHealthCheck).toHaveBeenCalled();
  });

  it('点击 toggle 后展开, 调 fetchHealthCheck', async () => {
    (fetchHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      activeProvider: 'mimo',
      activeReady: true,
      activeModel: 'mimo-v2-flash',
      hint: 'OK',
      providers: [
        { name: 'mimo', envKeyName: 'MIMO_API_KEY', hasKey: true, isActive: true, model: 'mimo-v2-flash' },
        { name: 'openai', envKeyName: 'OPENAI_API_KEY', hasKey: false, isActive: false, model: 'gpt-4o-mini' },
      ],
      timestamp: '2026-06-13T00:00:00Z',
    });

    render(<AIDiagnosticsPanel />);
    const toggleBtn = screen.getByText(/AI 配置诊断/);
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/mimo-v2-flash/)).toBeTruthy();
    });
    expect(fetchHealthCheck).toHaveBeenCalledTimes(1);
  });

  it('fetch 失败时显示错误 + 重试按钮', async () => {
    (fetchHealthCheck as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network down'));

    render(<AIDiagnosticsPanel autoOpenOnError={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Network down/)).toBeTruthy();
    });
    expect(screen.getByText('重试')).toBeTruthy();
  });

  it('activeReady=true 时显示 ✓ Ready 徽章', async () => {
    (fetchHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      activeProvider: 'mimo',
      activeReady: true,
      activeModel: 'mimo-v2-flash',
      hint: 'OK',
      providers: [],
      timestamp: '2026-06-13T00:00:00Z',
    });

    render(<AIDiagnosticsPanel autoOpenOnError={true} />);

    await waitFor(() => {
      expect(screen.getByText('✓ Ready')).toBeTruthy();
    });
  });

  it('activeReady=false 时显示 ⚠ 未就绪 徽章', async () => {
    (fetchHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      activeProvider: 'mimo',
      activeReady: false,
      hint: 'mimo missing MIMO_API_KEY',
      providers: [],
      timestamp: '2026-06-13T00:00:00Z',
    });

    render(<AIDiagnosticsPanel autoOpenOnError={true} />);

    await waitFor(() => {
      expect(screen.getByText('⚠ 未就绪')).toBeTruthy();
    });
    expect(screen.getByText(/mimo missing MIMO_API_KEY/)).toBeTruthy();
  });

  it('表格渲染 3 家 provider (mimo/openai/anthropic)', async () => {
    (fetchHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      activeProvider: 'mimo',
      activeReady: true,
      activeModel: 'mimo-v2-flash',
      hint: 'OK',
      providers: [
        { name: 'mimo', envKeyName: 'MIMO_API_KEY', hasKey: true, isActive: true, model: 'mimo-v2-flash' },
        { name: 'openai', envKeyName: 'OPENAI_API_KEY', hasKey: false, isActive: false, model: 'gpt-4o-mini' },
        { name: 'anthropic', envKeyName: 'ANTHROPIC_API_KEY', hasKey: false, isActive: false, model: 'claude-haiku-4-5' },
      ],
      timestamp: '2026-06-13T00:00:00Z',
    });

    render(<AIDiagnosticsPanel autoOpenOnError={true} />);

    await waitFor(() => {
      expect(screen.getByText('MIMO_API_KEY')).toBeTruthy();
      expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy();
      expect(screen.getByText('ANTHROPIC_API_KEY')).toBeTruthy();
    });
    // hasKey=true 的 mimo 显示 "✓ 已配置"
    expect(screen.getByText('✓ 已配置')).toBeTruthy();
    // hasKey=false 的 openai/anthropic 显示 "✗ 未配置"
    expect(screen.getAllByText('✗ 未配置').length).toBe(2);
  });
});
