#!/usr/bin/env bash
# Calls the Rentalos WhatsApp dispatcher with the shared secret and reports the result.
#
# Safety rules:
#   * the bearer token is only ever sent to a host on ALLOWED_HOSTS, over https
#   * redirects are NEVER followed (a 3xx is reported, and the fix is to correct the URL)
#   * the secret is never printed; response bodies are sanitised, masked and truncated
# Inputs (env): SECRET, DISPATCH_URL, ALLOWED_HOSTS (space separated). Test-only: ALLOW_HTTP=1.
set -uo pipefail

URL="${DISPATCH_URL:-}"
ALLOWED_HOSTS="${ALLOWED_HOSTS:-www.rentalos.in rentalos.in}"
SECRET="${SECRET:-}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

err() { echo "::error::$*"; }
warn() { echo "::warning::$*"; }

if [ -z "$SECRET" ]; then
  err "GitHub secret WHATSAPP_DISPATCH_SECRET is not set (repo Settings > Secrets and variables > Actions)."
  exit 1
fi
if [ -z "$URL" ]; then
  err "DISPATCH_URL is empty."
  exit 1
fi

# ---- URL validation: https only, no credentials in the URL, host must be on the allow-list ----
re='^(https?)://([^/:@?#]+)(:[0-9]+)?(/[^?#]*)?$'
if ! [[ "$URL" =~ $re ]]; then
  err "Refusing to send the secret: DISPATCH_URL is not a plain http(s) URL."
  exit 1
fi
scheme="${BASH_REMATCH[1]}"
host="$(echo "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')"
if [ "$scheme" != "https" ] && [ "${ALLOW_HTTP:-0}" != "1" ]; then
  err "Refusing to send the secret over plain http."
  exit 1
fi
allowed=0
for h in $ALLOWED_HOSTS; do [ "$host" = "$h" ] && allowed=1; done
if [ "$allowed" != "1" ]; then
  err "Refusing to send the secret: host '$host' is not on the allow-list ($ALLOWED_HOSTS)."
  exit 1
fi

# Printable, secret-masked, length-limited text (never echo raw bodies).
clean() {
  local t
  t="$(tr -cd '[:print:]\n' | head -c "${2:-500}")"
  t="${t//"$SECRET"/***}"
  printf '%s' "$t"
}

echo "POST $scheme://$host${BASH_REMATCH[4]:-/}"
proto=(); [ "${ALLOW_HTTP:-0}" = "1" ] || proto=(--proto '=https' --proto-redir '=https')
code="$(curl -sS "${proto[@]}" --max-time 60 --retry 2 --retry-delay 5 \
  -o "$work/body" -D "$work/headers" -w '%{http_code}' \
  -X POST -H "Authorization: Bearer $SECRET" "$URL" 2>"$work/curl.err")" || code="000"
code="${code:-000}"
body_txt="$(clean "" 500 <"$work/body" 2>/dev/null || true)"

echo "HTTP $code"
[ -n "$body_txt" ] && { echo "Response body (sanitised, max 500 chars):"; echo "$body_txt"; }

summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >>"$GITHUB_STEP_SUMMARY"; return 0; }

case "$code" in
  200)
    # A 200 from some other handler (e.g. an HTML page) is not the dispatcher answering.
    if ! command -v jq >/dev/null 2>&1 || ! jq -e 'type=="object" and has("scanned") and has("sent") and has("mocked") and has("failed")' "$work/body" >/dev/null 2>&1; then
      err "HTTP 200 but the body is not the dispatcher's JSON summary, so the dispatcher did not run. Check the URL points at the deployed /api/whatsapp/dispatch."
      exit 1
    fi
    read -r scanned sent mocked skipped failed < <(jq -r '[.scanned,.sent,.mocked,(.skipped // 0),.failed]|@tsv' "$work/body")
    echo "Dispatcher ran: scanned=$scanned sent=$sent mocked=$mocked skipped=$skipped failed=$failed"
    summary "### WhatsApp dispatch"
    summary "| scanned | sent | mocked | skipped | failed |"
    summary "|---|---|---|---|---|"
    summary "| $scanned | $sent | $mocked | $skipped | $failed |"
    echo "::notice::HTTP 200 only means the dispatcher ran. Real delivery is only counted in 'sent'."
    if [ "$mocked" -gt 0 ]; then
      warn "$mocked message(s) were MOCKED: META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID are missing in the deployment, so nothing was actually sent."
    fi
    if [ "$failed" -gt 0 ]; then
      warn "$failed message(s) failed to send. See the Vercel function logs and the whatsapp_messages table (failure_reason)."
    fi
    if [ "$scanned" -gt 0 ] && [ "$sent" -eq 0 ] && [ "$mocked" -eq 0 ] && [ "$failed" -eq 0 ]; then
      echo "::notice::$scanned notification(s) scanned but none sent: they were skipped (no linked/verified/opted-in WhatsApp number, unmapped type, or already sent)."
    fi
    exit 0
    ;;
  301|302|303|307|308)
    loc="$(grep -i '^location:' "$work/headers" | tail -n1 | sed 's/^[Ll]ocation:[[:space:]]*//' | tr -d '\r' | clean "" 200)"
    err "HTTP $code redirect from $host. The request was NOT followed (the secret is never forwarded). Redirect target: ${loc:-unknown}."
    err "Fix: set the repository variable WHATSAPP_DISPATCH_URL (Settings > Secrets and variables > Actions > Variables) to the canonical URL, e.g. the redirect target host + /api/whatsapp/dispatch."
    exit 1
    ;;
  401)
    err "401 Unauthorized: the GitHub secret WHATSAPP_DISPATCH_SECRET differs from the WHATSAPP_DISPATCH_SECRET environment variable in Vercel."
    exit 1
    ;;
  403)
    err "403 Forbidden: blocked before reaching the app (Vercel deployment protection / firewall)."
    exit 1
    ;;
  404)
    err "404 Not Found: /api/whatsapp/dispatch is not served at this URL. Check the domain, and that the latest code is deployed."
    exit 1
    ;;
  405)
    err "405 Method Not Allowed: the endpoint only accepts POST, or this URL is not the dispatcher (static/other handler)."
    exit 1
    ;;
  500)
    reason="$(jq -r '.error // empty' "$work/body" 2>/dev/null | clean "" 200)"
    err "500 from the dispatcher${reason:+: $reason}. If it says 'not configured', add WHATSAPP_DISPATCH_SECRET to the Vercel environment variables and redeploy; otherwise check the Vercel function logs."
    exit 1
    ;;
  000)
    err "Could not reach $host (DNS / TLS / network / timeout): $(clean "" 200 <"$work/curl.err")"
    exit 1
    ;;
  *)
    err "Unexpected HTTP $code."
    exit 1
    ;;
esac
