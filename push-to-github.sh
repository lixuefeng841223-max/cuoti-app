#!/usr/bin/env bash
# 一键把当前目录推送到 GitHub 仓库 cuoti-app（自动创建仓库 + 开启 Pages）
#
# 用法：
#   ./push-to-github.sh                 # 交互式输入 Token，用户名自动识别
#   GH_TOKEN=xxx ./push-to-github.sh    # 直接给 Token
#
# Token 获取（推荐 classic，一个勾就够）：
#   https://github.com/settings/tokens -> Generate new token (classic)
#   Note 填 cuoti-deploy，Expiration 选 90 days，勾选 "repo" 整个大项，生成
#
# 如用 fine-grained token，必须同时满足：
#   Repository access: All repositories
#   Permissions -> Administration: Read and write   （建仓库）
#   Permissions -> Contents:       Read and write   （推代码）
#   Permissions -> Pages:          Read and write   （开 Pages）
#
# 注意：classic token 勾 "repo" 即可；若仓库里含有 .github/workflows/ 下的文件，
#       还需要额外勾 "workflow" 权限，否则推送会被 GitHub 拒绝。本项目不含工作流，
#       Pages 走「分支部署」，因此 "repo" 一个勾就够。
#
# Token 只用于本次推送，脚本不会把它写进仓库或全局配置。

set -euo pipefail

REPO_NAME="cuoti-app"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="https://api.github.com"

GH_TOKEN="${GH_TOKEN:-}"
if [ -z "$GH_TOKEN" ]; then
  read -r -s -p "GitHub Token (输入时不显示): " GH_TOKEN
  echo
fi

AUTH=(-H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json")

echo "==> 1/5 校验 Token 并识别用户名"
GH_USER=$(curl -sS "${AUTH[@]}" "$API/user" | python3 -c "import sys,json;print(json.load(sys.stdin).get('login',''))")
if [ -z "$GH_USER" ]; then
  echo "Token 无效或网络不通"; exit 1
fi
echo "    用户名: $GH_USER"

echo "==> 2/5 创建仓库 $GH_USER/$REPO_NAME（已存在则跳过）"
CODE=$(curl -sS -o /tmp/gh_create_repo.json -w '%{http_code}' -X POST "$API/user/repos" "${AUTH[@]}" \
  -d "{\"name\":\"$REPO_NAME\",\"description\":\"错题管家 · 家庭错题管理系统（Web PWA + 微信小程序）\",\"private\":false,\"has_issues\":true,\"has_wiki\":false,\"has_projects\":false,\"auto_init\":false}")
if [ "$CODE" = "201" ]; then
  echo "    已创建"
elif [ "$CODE" = "422" ]; then
  echo "    仓库已存在，继续"
else
  echo "    创建失败 (HTTP $CODE)："
  cat /tmp/gh_create_repo.json
  echo
  echo "    -> 多半是 Token 少了 administration=write 权限，见脚本头部说明"
  exit 1
fi

echo "==> 3/5 推送代码"
cd "$PROJECT_DIR"
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GH_USER}:${GH_TOKEN}@github.com/${GH_USER}/${REPO_NAME}.git"
git push -u origin main

echo "==> 4/5 开启 GitHub Pages（从 main 分支发布）"
CODE=$(curl -sS -o /tmp/gh_pages.json -w '%{http_code}' -X POST "$API/repos/$GH_USER/$REPO_NAME/pages" "${AUTH[@]}" \
  -d '{"source":{"branch":"main","path":"/"}}')
if [ "$CODE" = "201" ] || [ "$CODE" = "409" ]; then
  echo "    OK"
else
  echo "    HTTP $CODE — 可稍后在仓库 Settings -> Pages 手动把 Source 选为 'Deploy from a branch: main / (root)'"
  cat /tmp/gh_pages.json 2>/dev/null | head -c 200; echo
fi
rm -f /tmp/gh_create_repo.json /tmp/gh_pages.json

echo "==> 5/5 清理 remote 中的凭据"
git remote set-url origin "https://github.com/${GH_USER}/${REPO_NAME}.git"
git remote -v

echo
echo "完成。等 1-2 分钟后访问：https://${GH_USER}.github.io/${REPO_NAME}/"
echo "Actions 构建进度：https://github.com/${GH_USER}/${REPO_NAME}/actions"
