#!/usr/bin/env bash
# 一键把当前目录推送到 GitHub 仓库 cuoti-app（自动创建仓库 + 开启 Pages）
#
# 用法：
#   ./push-to-github.sh                # 交互式输入用户名和 Token
#   GH_USER=xxx GH_TOKEN=yyy ./push-to-github.sh
#
# Token 获取：https://github.com/settings/tokens
#   经典 Token：勾选 repo（公开+私有仓库读写）即可
#   Fine-grained Token：Repository access 选 All repositories，
#     Permissions -> Contents: Read and write，Administration: Read and write
#
# Token 只用于本次推送，脚本不会把它写进仓库或全局配置。

set -euo pipefail

REPO_NAME="cuoti-app"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GH_USER="${GH_USER:-}"
GH_TOKEN="${GH_TOKEN:-}"

if [ -z "$GH_USER" ]; then
  read -r -p "GitHub 用户名: " GH_USER
fi
if [ -z "$GH_TOKEN" ]; then
  read -r -s -p "GitHub Token (输入时不显示): " GH_TOKEN
  echo
fi

API="https://api.github.com"

echo "==> 1/4 校验 Token"
curl -sS -H "Authorization: Bearer $GH_TOKEN" "$API/user" | grep -q '"login"' \
  || { echo "Token 无效或网络不通"; exit 1; }

echo "==> 2/4 创建仓库 $GH_USER/$REPO_NAME（若已存在则跳过）"
curl -sS -X POST "$API/user/repos" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"$REPO_NAME\",\"private\":false,\"has_issues\":true,\"has_wiki\":false,\"description\":\"错题管家 · 家庭错题管理系统（Web PWA + 微信小程序）\"}" \
  | head -c 300
echo

echo "==> 3/4 推送代码"
cd "$PROJECT_DIR"
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GH_USER}:${GH_TOKEN}@github.com/${GH_USER}/${REPO_NAME}.git"
git push -u origin main

echo "==> 4/4 开启 GitHub Pages（从 GitHub Actions 发布）"
curl -sS -X POST "$API/repos/$GH_USER/$REPO_NAME/pages" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{"build_type":"workflow"}' | head -c 300
echo

# 推掉带 Token 的 remote，避免明文凭据留在 .git/config
git remote set-url origin "https://github.com/${GH_USER}/${REPO_NAME}.git"

echo
echo "完成。稍等 1-2 分钟，访问：https://${GH_USER}.github.io/${REPO_NAME}/"
echo "Actions 进度：https://github.com/${GH_USER}/${REPO_NAME}/actions"
