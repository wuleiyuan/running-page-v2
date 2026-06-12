#!/usr/bin/env bash
# bump_version.sh — 自动 bump package.json 版本号 + 自动 git tag + push tag
#
# 用法：
#   ./scripts/bump_version.sh patch   # 2.1.3 → 2.1.4
#   ./scripts/bump_version.sh minor   # 2.1.3 → 2.2.0
#   ./scripts/bump_version.sh major   # 2.1.3 → 3.0.0
#
# 选项：
#   -y, --yes    非交互模式：自动 git add + commit + tag + push（脚本内完成整条流水线）
#   -h, --help   显示帮助
#
# 必做 4 步（脚本默认提示，-y 自动执行）：
#   1. 脚本改 package.json version
#   2. 手动改 CHANGELOG.md 把 [未发布] 段移到新版本下，填今天日期
#   3. git add + commit -m "chore(release): bump version X.Y.Z"
#   4. git tag -a vX.Y.Z -m "Release vX.Y.Z" + git push --tags（v2.1.8 后由 -y 自动化）
#
# 之后用户可选：在 GitHub UI Draft new release from tag vX.Y.Z（v2.1.7 之前 6 个版本号 release 缺失，待用户手动补）
#
# 版本号约定（语义化版本）：
#   patch (X.Y.Z → X.Y.Z+1)  bug fix / 数据修复 / 文档
#   minor (X.Y.Z → X.Y+1.0)  新功能（新模块 / 新组件 / 新 API）但向后兼容
#   major (X.Y.Z → X+1.0.0)  不向后兼容的破坏性变更

set -euo pipefail

LEVEL="${1:-}"
AUTO_YES=false

# 解析参数：第一个非选项参数是 LEVEL，之后是 flag
for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      AUTO_YES=true
      ;;
    -h|--help)
      echo "Usage: $0 <patch|minor|major> [-y|--yes] [-h|--help]"
      echo ""
      echo "  patch|minor|major   必选: 要 bump 的级别"
      echo "  -y, --yes           自动执行: git add + commit + tag + push"
      echo "  -h, --help          显示此帮助"
      exit 0
      ;;
    -*)
      # 跳过已处理的 flag
      ;;
    *)
      if [[ -z "$LEVEL" ]]; then
        LEVEL="$arg"
      fi
      ;;
  esac
done

if [[ -z "$LEVEL" ]]; then
  echo "Usage: $0 <patch|minor|major> [-y|--yes]" >&2
  echo "Run '$0 --help' for details." >&2
  exit 1
fi

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

# 验证 git 仓库
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository" >&2
  exit 1
fi

# 检查 working tree 是否有未提交改动（除我们刚改的 package.json）
if [[ "$AUTO_YES" == true ]]; then
  # 检查 package.json 是否是唯一被改的文件（其他没改的）
  STAGED=$(git status --porcelain | grep -v 'package\.json' | grep -v '^$' || true)
  if [[ -n "$STAGED" ]]; then
    echo "Warning: 以下文件未提交（除 package.json）:" >&2
    echo "$STAGED" >&2
    echo "请手动处理后再跑 -y 模式" >&2
    exit 1
  fi

  # 自动执行: git add + commit + tag + push
  git add package.json
  # 验证 CHANGELOG.md 是否也改动（如果未改则 warn，但不停）
  if ! git diff --cached --quiet -- CHANGELOG.md 2>/dev/null; then
    git add CHANGELOG.md
    echo "✓ 已 add CHANGELOG.md"
  else
    echo "⚠ CHANGELOG.md 未改动（记得手动加 [未发布] 段）"
  fi

  git commit -m "chore(release): bump version $NEW"
  echo "✓ Committed"

  # 打 tag
  git tag -a "v$NEW" -m "Release v$NEW"
  echo "✓ Tagged v$NEW"

  # push
  git push origin HEAD
  echo "✓ Pushed commit"

  git push origin "v$NEW"
  echo "✓ Pushed tag v$NEW"

  echo ""
  echo "🎉 Release v$NEW 流水线完成"
  echo "  - GitHub tag: https://github.com/wuleiyuan/sports-fair/releases/tag/v$NEW"
  echo "  - 可选: GitHub UI Draft new release from tag v$NEW"
else
  echo "Next steps (手工模式):"
  echo "  1. 编辑 CHANGELOG.md 把 [未发布] 段内容移到新版本下，填今天日期 (YYYY-MM-DD)"
  echo "  2. git add package.json CHANGELOG.md"
  echo "  3. git commit -m 'chore(release): bump version $NEW'"
  echo "  4. git tag -a v$NEW -m 'Release v$NEW' + git push --tags"
  echo "  5. (可选) GitHub UI Draft new release from tag v$NEW"
  echo ""
  echo "💡 提示: 跑 '$0 $LEVEL -y' 可自动执行 add+commit+tag+push"
fi
