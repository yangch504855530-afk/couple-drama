#!/usr/bin/env bash
# 全自动发布流水线:轮询 zone 激活 → 部署(挂三域名)→ 实测 api.yangch.website → 输出结论
# 用法: bash auto-publish.sh  (后台运行,激活后自动完成全部)
set -u
TOKEN_FILE="C:\\Users\\50485\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml"
ZID="837079ee7ca13b7bbfff1663f0d94e74"

get_token() { grep -oP 'oauth_token = "\K[^"]+' "$(cygpath "$TOKEN_FILE" 2>/dev/null || echo "$TOKEN_FILE")" | head -1; }

echo "[pipeline] 开始轮询 zone 激活(最长 4 小时,每 2 分钟一次)..."
ACTIVE=0
for i in $(seq 1 120); do
  TOKEN=$(get_token)
  STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones/$ZID" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result.status)}catch(e){console.log('err')}}" 2>/dev/null)
  NS=$(nslookup -type=NS yangch.website 223.5.5.5 2>/dev/null | grep -c cloudflare)
  echo "[$(date +%m-%d\ %H:%M)] status=$STATUS ns_cloudflare_hits=$NS"
  if [ "$STATUS" = "active" ] || [ "$NS" -ge 2 ]; then ACTIVE=1; echo "[pipeline] 检测到激活!"; break; fi
  sleep 120
done

if [ "$ACTIVE" != "1" ]; then echo "[pipeline] 4 小时未激活,退出(可重跑)"; exit 2; fi

echo "[pipeline] 等待 90 秒让注册局 fully 传播..."
sleep 90

echo "[pipeline] 部署 Worker(挂 yangch.website / www / api.yangch.website)..."
cd "C:\\Users\\50485\\Documents\\Codex\\2026-09-30\\couple-drama\\cloud" || exit 1
wrangler deploy 2>&1 | tail -6

echo "[pipeline] 实测 api.yangch.website ..."
sleep 10
R1=$(curl -s --max-time 25 -X POST "https://api.yangch.website/room" -H "Content-Type: application/json" --data '{}' 2>/dev/null)
echo "create room: $R1"
R2=$(curl -s --max-time 25 "https://yangch.website/" 2>/dev/null | head -c 80)
echo "site head: $R2"
if echo "$R1" | grep -q '"code"'; then
  echo "[pipeline] ✅✅ 全部成功:api.yangch.website 可用,游戏本体已挂自有域名"
else
  echo "[pipeline] ⚠️ 域名已挂但 API 响应异常,需人工检查(可能 DNS 尚未全球传播,稍后再 curl)"
fi
