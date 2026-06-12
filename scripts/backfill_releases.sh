#!/usr/bin/env bash
# backfill_releases.sh — 一次性回填历史 release entry
#
# 背景：v2.1.2-2.1.11 commit + tag 都 push 了，但 GitHub Release 面板只有 v2.1.1
# 这个脚本从已存在的 tag 创建 release entry（不创建新 commit/tag）
#
# 用法：
#   GITHUB_TOKEN=*** ./scripts/backfill_releases.sh v2.1.2 v2.1.3 v2.1.4 v2.1.5 v2.1.6 v2.1.7 v2.1.8 v2.1.9 v2.1.10 v2.1.11
#
# 安全：
#   - GITHUB_TOKEN 不入仓
#   - 自动从 CHANGELOG.md 提取 release notes
#   - 失败立即退出

set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-wuleiyuan/sports-fair}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
CHANGELOG="$ROOT/CHANGELOG.md"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Error: GITHUB_TOKEN env var not set" >&2
  echo "Usage: GITHUB_TOKEN=*** $0 v2.1.2 v2.1.3 ..." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Error: no tags specified" >&2
  echo "Usage: GITHUB_TOKEN=*** $0 v2.1.2 v2.1.3 ..." >&2
  echo "Example: $0 \$(git tag --list 'v2.*' --sort=creatordate)" >&2
  exit 1
fi

# 提取 CHANGELOG 中 [X.Y.Z] 段的 release notes
extract_notes() {
  local ver="$1"
  python3 -c "
import re
with open('$CHANGELOG') as f:
    content = f.read()
pattern = r'## \[${ver}\][^\n]*\n(.*?)(?=\n## \[|\Z)'
m = re.search(pattern, content, re.DOTALL)
notes = m.group(1).strip() if m else 'Release ${ver} - no notes in CHANGELOG.md'
if len(notes) > 1500:
    notes = notes[:1500] + '\n\n_... 截断，完整版见 CHANGELOG.md_'
print(notes)
"
}

# 检查 release 是否已存在
release_exists() {
  local tag="$1"
  local http_code
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$tag")
  [[ "$http_code" == "200" ]]
}

# 创建 release
create_release() {
  local tag="$1"
  local ver="${tag#v}"
  local notes
  notes=$(extract_notes "$ver")

  local body
  body=$(python3 -c "
import json, sys
print(json.dumps({
    'tag_name': '$tag',
    'name': 'Release $tag',
    'body': sys.stdin.read(),
    'draft': False,
    'prerelease': False
}, ensure_ascii=False))
" <<< "$notes")

  local http_code
  http_code=$(curl -sS -o /tmp/release_resp.json -w "%{http_code}" \
    -X POST "https://api.github.com/repos/$GITHUB_REPO/releases" \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "Content-Type: application/json" \
    -d "$body")

  if [[ "$http_code" == "201" ]]; then
    local url
    url=$(python3 -c "import json; print(json.load(open('/tmp/release_resp.json'))['html_url'])")
    echo "✅ $tag → $url"
  else
    echo "❌ $tag failed (HTTP $http_code)"
    cat /tmp/release_resp.json
    echo ""
  fi
}

# Main
echo "→ 回填 release entry for $GITHUB_REPO"
echo "  Tags: $*"
echo ""

for tag in "$@"; do
  if release_exists "$tag"; then
    echo "⏭  $tag (already exists)"
  else
    create_release "$tag"
  fi
done

echo ""
echo "🎉 Done. View: https://github.com/$GITHUB_REPO/releases"
