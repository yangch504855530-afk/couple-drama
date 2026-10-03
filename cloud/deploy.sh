#!/usr/bin/env bash
# 《双人戏精》中继一键部署 —— 用法: CLOUDFLARE_API_TOKEN=你的token bash deploy.sh [api子域]
# ZCode 执行用;用户无需手动跑
set -e
cd "$(dirname "$0")"
command -v wrangler >/dev/null || npm i -g wrangler
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "❌ 缺少 CLOUDFLARE_API_TOKEN 环境变量"; exit 1; }
export CLOUDFLARE_API_TOKEN
SUB="${1:-api.yangch.website}"

echo "== 1/4 创建(或查找) D1 数据库 drama-relay-db =="
DB_ID=$(wrangler d1 create drama-relay-db 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
if [ -z "$DB_ID" ]; then
  DB_ID=$(wrangler d1 list 2>/dev/null | grep drama-relay-db | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
fi
[ -n "$DB_ID" ] || { echo "❌ D1 创建失败"; exit 1; }
echo "  ✅ DB_ID=$DB_ID"

echo "== 2/4 回填 wrangler.toml =="
sed -i 's/TO_BE_FILLED_BY_WRANGLER_CREATE/'"$DB_ID"'/' wrangler.toml
grep -q "$DB_ID" wrangler.toml && echo "  ✅ database_id 已回填"

echo "== 3/4 配置自定义域名路由 $SUB =="
if grep -q '^routes' wrangler.toml; then
  echo "  (已存在,跳过)"
else
  printf '\nroutes = [ { pattern = "%s", custom_domain = true } ]\n' "$SUB" >> wrangler.toml
  echo "  ✅ 已写入"
fi

echo "== 4/4 部署 Worker =="
wrangler deploy
echo ""
echo "✅ 部署完成。验证: curl https://$SUB/room -X POST"
