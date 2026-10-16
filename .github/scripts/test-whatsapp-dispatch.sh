#!/usr/bin/env bash
# Local test for whatsapp-dispatch.sh against a mock HTTP server (no network, no real secret).
# Run:  bash .github/scripts/test-whatsapp-dispatch.sh
set -u
cd "$(dirname "$0")" || exit 1
SECRET_VALUE="s3cr3t-DO-NOT-LEAK-0123456789"
PORT=$((20000 + RANDOM % 20000))
LOG="$(mktemp)"; OUT="$(mktemp)"
python3 - "$PORT" "$LOG" "$SECRET_VALUE" <<'PY' &
import sys, json
from http.server import BaseHTTPRequestHandler, HTTPServer
port, log, secret = int(sys.argv[1]), sys.argv[2], sys.argv[3]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        open(log, "a").write(f"{self.command} {self.path} auth={'yes' if self.headers.get('Authorization') else 'no'}\n")
        def send(code, body, ctype="application/json", extra=None):
            b = body.encode(); self.send_response(code)
            self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(b)))
            for k, v in (extra or {}).items(): self.send_header(k, v)
            self.end_headers(); self.wfile.write(b)
        p = self.path
        if p == "/ok": send(200, json.dumps({"scanned": 5, "sent": 3, "mocked": 0, "skipped": 2, "failed": 0}))
        elif p == "/mock": send(200, json.dumps({"scanned": 4, "sent": 0, "mocked": 4, "skipped": 0, "failed": 0}))
        elif p == "/failed": send(200, json.dumps({"scanned": 4, "sent": 1, "mocked": 0, "skipped": 0, "failed": 3}))
        elif p == "/html200": send(200, "<html><body>Hello SPA</body></html>", "text/html")
        elif p == "/redir": send(308, "Redirecting...", "text/plain", {"Location": f"http://127.0.0.1:{port}/final"})
        elif p == "/final": send(200, json.dumps({"scanned": 0, "sent": 0, "mocked": 0, "skipped": 0, "failed": 0}))
        elif p == "/401": send(401, "Unauthorized", "text/plain")
        elif p == "/404": send(404, "nf", "text/plain")
        elif p == "/405": send(405, "Method not allowed", "text/plain")
        elif p == "/500": send(500, json.dumps({"error": "Dispatch not configured token=" + secret}))
        elif p == "/418": send(418, "teapot", "text/plain")
        else: send(404, "?", "text/plain")
HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$LOG" "$OUT"' EXIT
for _ in $(seq 1 50); do (echo > /dev/tcp/127.0.0.1/$PORT) 2>/dev/null && break; sleep 0.1; done

fail=0
run() { # name, expected-exit, expected-substring, [env...]
  local name="$1" want="$2" needle="$3"; shift 3
  : >"$LOG"
  env "$@" bash ./whatsapp-dispatch.sh >"$OUT" 2>&1; local rc=$?
  if [ "$rc" != "$want" ] || ! grep -qF -- "$needle" "$OUT"; then
    echo "FAIL  $name (exit $rc, wanted $want, needle: $needle)"; sed 's/^/      | /' "$OUT"; fail=1
  elif grep -qF "$SECRET_VALUE" "$OUT"; then
    echo "FAIL  $name leaked the secret"; fail=1
  else echo "ok    $name"; fi
}
base=(SECRET="$SECRET_VALUE" ALLOWED_HOSTS=127.0.0.1 ALLOW_HTTP=1)
U() { echo "DISPATCH_URL=http://127.0.0.1:$PORT$1"; }

run "200 real send"            0 "sent=3 mocked=0"            "${base[@]}" "$(U /ok)"
run "200 mock mode warns"      0 "were MOCKED"                "${base[@]}" "$(U /mock)"
run "200 failed sends warn"    0 "failed to send"             "${base[@]}" "$(U /failed)"
run "200 non-JSON is an error" 1 "not the dispatcher's JSON"  "${base[@]}" "$(U /html200)"
run "308 not followed"         1 "redirect"                   "${base[@]}" "$(U /redir)"
run "401"                      1 "401 Unauthorized"           "${base[@]}" "$(U /401)"
run "404"                      1 "404 Not Found"              "${base[@]}" "$(U /404)"
run "405"                      1 "405 Method Not Allowed"     "${base[@]}" "$(U /405)"
run "500 masks echoed secret"  1 "500 from the dispatcher"    "${base[@]}" "$(U /500)"
run "unexpected status"        1 "Unexpected HTTP 418"        "${base[@]}" "$(U /418)"
run "missing secret"           1 "WHATSAPP_DISPATCH_SECRET is not set" SECRET= ALLOWED_HOSTS=127.0.0.1 ALLOW_HTTP=1 "$(U /ok)"
run "host not allow-listed"    1 "not on the allow-list"      SECRET="$SECRET_VALUE" "DISPATCH_URL=https://evil.example.com/api/whatsapp/dispatch"
run "http refused in prod"     1 "plain http"                 SECRET="$SECRET_VALUE" ALLOWED_HOSTS=127.0.0.1 "$(U /ok)"
run "credentials in URL"       1 "not a plain http(s) URL"    SECRET="$SECRET_VALUE" ALLOWED_HOSTS=evil.com "DISPATCH_URL=https://a:b@evil.com/x"
run "unreachable host"         1 "Could not reach"            "${base[@]}" "DISPATCH_URL=http://127.0.0.1:1/ok"

# The 308 target must never receive a request (token not forwarded) and nothing hit an evil host.
: >"$LOG"; env "${base[@]}" "$(U /redir)" bash ./whatsapp-dispatch.sh >/dev/null 2>&1
if grep -q "/final" "$LOG"; then echo "FAIL  redirect target was contacted"; fail=1; else echo "ok    redirect target never contacted"; fi
if [ "$fail" = 0 ]; then echo "ALL PASSED"; else echo "SOME FAILED"; exit 1; fi
