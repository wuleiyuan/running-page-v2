#!/usr/bin/env bash
# bump_version.sh — 手动 bump package.json 版本号 + 自动更新 CHANGELOG.md
#
# 用法：
#   ./scripts/bump_version.sh patch   # 2.1.3 → 2.1.4
#   ./scripts/bump_version.sh minor   # 2.1.3 → 2.2.0
#   ./scripts/bump_version.sh major   # 2.1.3 → 3.0.0
#
# bump 完后需要：
#   1. 编辑 CHANGELOG.md 把 [未发布] 段移动到新版本号下，填日期
#   2. git add package.json CHANGELOG.md
#   3. git commit -m "chore(release): bump version X.Y.Z"
#   4. git tag -a vX.Y.Z -m "Release vX.Y.Z"
#   5. git push && git push --tags
#   6. 在 GitHub UI 发 Release（vX.Y.Z tag）
#
# 版本号约定（语义化版本）：
#   patch (X.Y.Z → X.Y.Z+1)  bug fix / 数据修复 / 文档
#   minor (X.Y.Z → X.Y+1.0)  新功能（新模块 / 新组件 / 新 API）但向后兼容
#   major (X.Y.Z → X+1.0.0)  不向后兼容的破坏性变更

set -euo pipefail

LEVEL="${1:-patch}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$ROOT/package.json"
CHANGELOG="$ROOT/CHANGELOG.md"

if [[ ! "$LEVEL" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 <patch|minor|major>" >&2
  exit 1
fi

# 用 jq 解析 + 修改 JSON（避免 sed/awk 改 JSON 格式破坏）
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required (brew install jq)" >&2
  exit 1
fi

CURRENT=$(jq -r '.version' "$PACKAGE_JSON")
echo "Current version: $CURRENT"

IFS='.' read -r MAJOR MINOR PATCH <<<"$CURRENT"

case "$LEVEL" in
  patch)
    PATCH=$((PATCH + 1))
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW"

# 用 Python 原地修改（jq 写 JSON 会改 key 顺序，更安全用 Python）
python3 -c "
import json
with open('$PACKAGE_JSON', 'r', encoding='utf-8') as f:
    data = json.load(f)
data['version'] = '$NEW'
# 保持 key 顺序稳定
ordered = {'name': data['name']}
for k, v in data.items():
    if k not in ordered:
        ordered[k] = v
ordered['version'] = '$NEW'
with open('$PACKAGE_JSON', 'w', encoding='utf-8') as f:
    json.dump(ordered, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('updated package.json: $NEW')
"

echo ""
echo "✓ Bumped $CURRENT → $NEW"
echo ""
echo "Next steps:"
echo "  1. 编辑 CHANGELOG.md 把 [未发布] 段内容移到新版本下，填今天日期 (YYYY-MM-DD)"
echo "  2. git add package.json CHANGELOG.md"
echo "  3. git commit -m 'chore(release): bump version $NEW'"
echo "  4. git tag -a v$NEW -m 'Release v$NEW'"
echo "  5. git push && git push --tags"
echo "  6. 在 GitHub UI 发 Release (Draft new release from v$NEW tag)"
