#!/usr/bin/env python3
"""Serve the app and expose .env keys to the browser as /env.js (never as .env)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import posixpath
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8080"))
BLOCKED = {".env", ".env.example", ".env.local", ".gitignore"}


def load_dotenv():
    env = {}
    path = os.path.join(ROOT, ".env")
    if not os.path.isfile(path):
        return env
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            if key.lower().startswith("export "):
                key = key[7:].strip()
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            env[key] = val
    return env


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        name = posixpath.basename(parsed.path).lower()
        if name in BLOCKED or name.endswith(".env"):
            self.send_error(403, "Forbidden")
            return
        if parsed.path.rstrip("/") == "/env.js":
            env = load_dotenv()
            payload = {
                "GEMINI_API_KEY": env.get("GEMINI_API_KEY")
                or env.get("GOOGLE_API_KEY")
                or env.get("GOOGLE_GEMINI_API_KEY")
                or "",
            }
            data = ("window.__ENV = " + json.dumps(payload) + ";\n").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"CGPA Calc running at http://127.0.0.1:{PORT}/")
    print("Paste GEMINI_API_KEY in .env, then refresh the page.")
    httpd.serve_forever()
