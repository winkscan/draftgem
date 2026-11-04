#!/usr/bin/env bash
# Builds the web version for play.draftgem.app into mobile/dist and (with "deploy") publishes it to the
# Cloudflare Pages project draftgem-play.
#   bash scripts/build-web.sh           # build only
#   bash scripts/build-web.sh deploy    # build and publish
# Cloudflare Pages never uploads folders named node_modules, and Expo puts the icon fonts (and a couple of
# images) under dist/assets/node_modules/...: without the rename below every icon shows as an empty box.
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null

cd "$(dirname "$0")/.."
unset EXPO_PUBLIC_WORKER_URL # the live site talks to the worker directly (the local proxy is for dev only)
rm -rf dist
npx expo export --platform web

mv dist/assets/node_modules dist/assets/vendor
for f in $(grep -rl "/assets/node_modules/" dist/_expo dist/index.html); do
  sed -i "s|/assets/node_modules/|/assets/vendor/|g" "$f"
  # A changed bundle needs a new name too: browsers keep the old one cached under its content-hash name.
  case "$f" in
    *.js)
      new="$(dirname "$f")/index-$(md5sum "$f" | cut -c1-32).js"
      mv "$f" "$new"
      sed -i "s|/_expo/static/js/web/$(basename "$f")|/_expo/static/js/web/$(basename "$new")|g" dist/index.html
      ;;
  esac
done
if grep -rq "assets/node_modules" dist; then
  echo "A reference to assets/node_modules is left in dist" >&2
  exit 1
fi
# Link previews (X, Telegram, Discord): Expo's index.html only has a bare title, so swap in scripts/web-meta.html.
node -e 'const fs=require("fs");const p="dist/index.html";const s=fs.readFileSync(p,"utf8");if(!s.includes("<title>DraftGem</title>"))throw new Error("title tag not found in dist/index.html");fs.writeFileSync(p,s.replace("<title>DraftGem</title>",fs.readFileSync("scripts/web-meta.html","utf8").trim()))'

# Security headers for every page (Cloudflare Pages reads dist/_headers): no framing by other sites (a framed
# wallet dApp can be click-jacked), no MIME sniffing, a tight referrer, HTTPS only.
cat > dist/_headers <<'HEADERS'
/*
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
HEADERS
echo "Built: $(find dist -type f | wc -l) files"

if [ "${1:-}" = "deploy" ]; then
  cd ../worker
  npx wrangler pages deploy ../mobile/dist --project-name draftgem-play --branch main --commit-dirty=true
fi
