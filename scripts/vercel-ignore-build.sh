#!/usr/bin/env bash
# Vercel Ignored Build Step (fallback)
# 用途：仅当 src/ 或 vercel.json/package.json/wf 变更时构建
# 数据文件 (src/static/activities.json + assets/*.svg) 的变化**不**触发完整构建
# 注意：Vercel UI 里的 Ignored Build Step 优先于这个脚本
# 在 Vercel Project Settings → Git → Ignored Build Step 里填：
#   if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then exit 0; fi; if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- src/ package.json vercel.json .vercelignore; then echo "⏭️  No source changes, skip build"; exit 1; fi

set -e

if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "ℹ️  No previous SHA (initial deploy), proceed with build"
  exit 0
fi

echo "=== Vercel Ignored Build Step (script) ==="
echo "Previous: $VERCEL_GIT_PREVIOUS_SHA"
echo "Current:  $VERCEL_GIT_COMMIT_SHA"

CHANGED=$(git diff --name-only "$VERCEL_GIT_PREVIOUS_SHA" HEAD 2>/dev/null || echo "")

if echo "$CHANGED" | grep -qE '^(src/|package\.json|vercel\.json|\.vercelignore|tailwind\.config|vite\.config|tsconfig\.json)'; then
  echo "✅ Source/config changed, proceed with build"
  echo "Changed files:"
  echo "$CHANGED" | grep -E '^(src/|package\.json|vercel\.json|\.vercelignore|tailwind\.config|vite\.config|tsconfig\.json)' || true
  exit 0
else
  echo "⏭️  No source changes, skip build"
  echo "Changed files (data only or empty):"
  echo "$CHANGED" | head -20
  exit 1
fi
