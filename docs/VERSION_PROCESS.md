# 版本号流程（公开版）

> **公开文档**——本文件入仓追踪。详细本地笔记见 `PROJECT_NOTES.md`（`.gitignore` 排除，仅本地开发用）。

## 概述

Sports Fair 遵循 [Semantic Versioning 2.0.0](https://semver.org/)：

- **patch** (X.Y.Z → X.Y.Z+1)：bug fix / 数据修复 / 文档 / 性能
- **minor** (X.Y.Z → X.Y+1.0)：新功能（新模块 / 新组件 / 新 API）但向后兼容
- **major** (X.Y.Z → X+1.0.0)：不向后兼容的破坏性变更

## 不需要 bump 的例外

- `.gitignore` / `.vercelignore` / 注释 / 重命名文件
- typo 修正（README 等）
- 依赖升级（package.json dependencies）—— 单独发 release

## Bump 5 必做步

1. 改完代码 + 改完 `package.json` version + 改完 `CHANGELOG.md` `[未发布]` 段
2. 一个 commit 包含 (代码 + version + CHANGELOG)
3. 推到 GitHub → Vercel 自动 build/deploy
4. **git tag -a vX.Y.Z -m "Release vX.Y.Z" + git push origin vX.Y.Z**（必做）
5. **GitHub API create release entry**（必做）—— 用 `./scripts/release.sh`

## 工具

| 脚本 | 用途 |
|---|---|
| `scripts/release.sh patch\|minor\|major` | **必用**——自动化 5 必做步：add + commit + tag + push + create release |
| `scripts/backfill_releases.sh v2.1.2 v2.1.3 ...` | 一次性回填历史 release entry |
| `scripts/bump_version.sh patch -y` | 旧工具（已废弃），不含 create release |

## 用法示例

```bash
# 平时 bump
export GITHUB_TOKEN=***  # GitHub PAT with repo scope
./scripts/release.sh patch
# 自动化完成：version bump + commit + tag + push + create release

# 回填历史 release
export GITHUB_TOKEN=***
./scripts/backfill_releases.sh v2.1.2 v2.1.3 v2.1.4 v2.1.5 v2.1.6 v2.1.7 v2.1.8 v2.1.9 v2.1.10 v2.1.11
```

## 历史教训

- 2026-06-12 之前：6+ 个 commit 都漏了 git tag + create release
- 根因：流程只 echo 提示，没自动化
- 修法：`scripts/release.sh` 用 curl + GitHub API 自动化 create release（不依赖 `gh` CLI）

## 相关

- [CHANGELOG.md](../CHANGELOG.md) - 完整版本变更日志
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 贡献指南
- [.github/workflows/release.yml](../.github/workflows/release.yml) - Release workflow 配置
