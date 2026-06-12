#!/usr/bin/env bash
# release.sh — 一键 bump version + tag + push + create GitHub Release
#
# 用法：
#   GITHUB_TOKEN=ghp_xxx ./scripts/release.sh patch   # 2.1.10 → 2.1.11 全自动
#   GITHUB_TOKEN=ghp_xxx ./scripts/release.sh minor
#   GITHUB_TOKEN=ghp_xxx ./scripts/release.sh major
#
# 必做 5 步（脚本内完成）：
#   1. 读 package.json 当前 version
#   2. 计算新 version
#   3. 改 package.json version
#   4. git add + commit + tag + push（commit + tag）
#   5. 调用 GitHub API create release（含 CHANGELOG 段内容）
#
# 环境：
#   GITHUB_TOKEN    必填，GitHub PAT with repo scope
#   GITHUB_REPO     可选，默认 wuleiyuan/sports-fair
#
# 安全：
#   - GITHUB_TOKEN 不入仓（脚本不打印，不 echo）
#   - CHANGELOG.md 不在脚本里 hardcode 段名（自动从 [X.Y.Z] 提取）
#   - 失败立即退出（set -euo pipefail）

set -euo pipefail

LEVEL="${1:-}"

if [[ -z "$LEVEL" ]]; then
  echo "Usage: GITHUB_TOKEN=ghp_xxx $0 <patch|minor|major>" >&2
  echo ""
  echo "Environment:"
  echo "  GITHUB_TOKEN    Required. GitHub PAT with repo scope"
  echo "  GITHUB_REPO     Optional. Default: wuleiyuan/sports-fair"
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Error: GITHUB_TOKEN env var not set" >&2
  echo "Usage: GITHUB_TOKEN=ghp_xxx $0 $LEVEL" >&2
  exit 1
fi

GITHUB_REPO="${GITHUB_REPO:-wuleiyuan/sports-fair}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$ROOT/package.json"
CHANGELOG="$ROOT/CHANGELOG.md"

# 1. 读当前 version
CURRENT=$(python3 -c "import json; print(json.load(open('$PACKAGE_JSON'))['version'])")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$LEVEL" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *)
    echo "Error: invalid level '$LEVEL' (use patch|minor|major)" >&2
    exit 1
    ;;
esac

NEW="${MAJOR}.${MINOR}.${PATCH}"
NEW_TAG="v${NEW}"
TODAY=$(date +%Y-%m-%d)

echo "→ Bumping $CURRENT → $NEW"

# 2. 改 package.json
python3 -c "
import json
p = '$PACKAGE_JSON'
d = json.load(open(p))
d['version'] = '$NEW'
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
"

# 3. 检查 CHANGELOG 是否有 [未发布] 段要移到新版本
if grep -q "## \[未发布\]" "$CHANGELOG" 2>/dev/null; then
  echo "⚠ CHANGELOG.md 仍有 [未发布] 段，请先手动迁移到 [${NEW}] 段下"
  echo "  编辑后跑：git add CHANGELOG.md && git commit --amend"
  exit 1
fi

# 4. git add + commit + tag + push
git add package.json
# 提示 CHANGELOG 也要 add
if ! git diff --cached --quiet -- CHANGELOG.md 2>/dev/null; then
  git add CHANGELOG.md
  echo "✓ 已 add CHANGELOG.md"
fi

git commit -m "chore(release): bump version $CURRENT → $NEW"
git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
git push origin HEAD
git push origin "$NEW_TAG"

echo "✓ Pushed commit + tag $NEW_TAG"

# 5. 提取 CHANGELOG 当前版本的 release notes
RELEASE_NOTES=$(python3 -c "
import re
with open('$CHANGELOG') as f:
    content = f.read()
# 匹配从 [NEW] 段开始到下一个 [X.Y.Z] 或 [未发布] 之前
pattern = r'## \[${NEW}\][^\n]*\n(.*?)(?=\n## \[|\Z)'
m = re.search(pattern, content, re.DOTALL)
notes = m.group(1).strip() if m else 'No release notes'
# 截断到 1200 字符（GitHub release notes 限制）
if len(notes) > 1200:
    notes = notes[:1200] + '\n\n_... 截断，完整版见 CHANGELOG.md_'
print(notes)
")

# 6. 调用 GitHub API create release
RELEASE_BODY=$(python3 -c "
import json, sys
notes = sys.stdin.read()
print(json.dumps({
    'tag_name': '$NEW_TAG',
    'name': 'Release $NEW',
    'body': notes,
    'draft': False,
    'prerelease': False
}, ensure_ascii=False))
" <<< "$RELEASE_NOTES")

echo "→ Creating GitHub release for $NEW_TAG..."

HTTP_CODE=$(curl -sS -o /tmp/release_response.json -w "%{http_code}" \
  -X POST "https://api.github.com/repos/$GITHUB_REPO/releases" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d "$RELEASE_BODY")

if [[ "$HTTP_CODE" == "201" ]]; then
  RELEASE_URL=$(python3 -c "import json; print(json.load(open('/tmp/release_response.json'))['html_url'])")
  echo "🎉 Created release: $RELEASE_URL"
else
  echo "❌ Failed to create release (HTTP $HTTP_CODE)"
  cat /tmp/release_response.json
  exit 1
fi

echo ""
echo "✅ Done! v$NEW is live:"
echo "  - Tag: https://github.com/$GITHUB_REPO/releases/tag/$NEW_TAG"
echo "  - Code: $(git rev-parse HEAD | cut -c1-7)"
echo "  - Vercel: auto deploy in ~5 min"
