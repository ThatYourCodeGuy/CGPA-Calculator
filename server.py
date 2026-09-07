#!/usr/bin/env python3
"""Serve the app and proxy Gemini so the API key stays on the server."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import posixpath
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8080"))
BLOCKED = {".env", ".env.example", ".env.local", ".gitignore"}
GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"]


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


def gemini_key():
    file_env = load_dotenv()
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GOOGLE_GEMINI_API_KEY")
        or file_env.get("GEMINI_API_KEY")
        or file_env.get("GOOGLE_API_KEY")
        or file_env.get("GOOGLE_GEMINI_API_KEY")
        or ""
    ).strip()


def send_json(handler, status, payload):
    data = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def send_js(handler, source):
    data = source.encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/javascript; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def call_gemini(parts):
    key = gemini_key()
    if not key:
        return None, "GEMINI_API_KEY is not set. Add it in .env, then restart the server."
    payload = {
        "systemInstruction": {
            "parts": [{"text": "You are an exam-prep tutor. Produce original assessment items and valid JSON only."}]
        },
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }
    body = json.dumps(payload).encode("utf-8")
    last_err = "Gemini request failed"
    for model in GEMINI_MODELS:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            + urllib.parse.quote(model, safe="")
            + ":generateContent?key="
            + urllib.parse.quote(key, safe="")
        )
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                status = resp.status
        except urllib.error.HTTPError as e:
            status = e.code
            try:
                data = json.loads(e.read().decode("utf-8"))
            except Exception:
                last_err = str(e)
                continue
        except Exception as e:
            last_err = str(e)
            continue
        if data.get("error"):
            last_err = data["error"].get("message") or "Gemini request failed"
            low = last_err.lower()
            if "api key" in low or "permission denied" in low or status in (401, 403):
                return None, last_err
            continue
        cand = (data.get("candidates") or [None])[0] or {}
        text = "".join(p.get("text") or "" for p in ((cand.get("content") or {}).get("parts") or []))
        if not text:
            block = (data.get("promptFeedback") or {}).get("blockReason") or cand.get("finishReason")
            last_err = (
                "Gemini blocked or stopped the response (" + str(block) + "). Try different material or a shorter topic."
                if block
                else "Empty response from Gemini."
            )
            continue
        return text, None
    return None, last_err


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        name = posixpath.basename(parsed.path).lower()
        if name in BLOCKED or name.endswith(".env"):
            self.send_error(403, "Forbidden")
            return
        path = parsed.path.rstrip("/")
        if path == "/env.js":
            payload = {"GEMINI_CONFIGURED": bool(gemini_key())}
            send_js(self, "window.__ENV = " + json.dumps(payload) + ";\n")
            return
        if path == "/api/gemini":
            send_json(self, 200, {"configured": bool(gemini_key())})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.rstrip("/") != "/api/gemini":
            self.send_error(404, "Not Found")
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            send_json(self, 400, {"error": "Invalid JSON body."})
            return
        parts = body.get("parts")
        if not isinstance(parts, list) or not parts:
            send_json(self, 400, {"error": "Missing request parts."})
            return
        text, err = call_gemini(parts)
        if err:
            send_json(self, 502, {"error": err})
            return
        send_json(self, 200, {"text": text})


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"CGPA Calc running at http://127.0.0.1:{PORT}/")
    print("Set GEMINI_API_KEY in .env, then refresh the page.")
    httpd.serve_forever()
