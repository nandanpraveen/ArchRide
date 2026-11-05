"""Serve the checked export under its production base path using Python's HTTP server.

Run after pnpm build:pages. No Next.js process or dynamic fallback is involved.
"""
from functools import partial
from argparse import ArgumentParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

export = Path(__file__).resolve().parents[1] / "out"
parser = ArgumentParser(description=__doc__)
parser.add_argument("--port", type=int, default=3300)
parser.add_argument("--base-path", default="/archride")
options = parser.parse_args()
base_path = options.base_path.rstrip("/")
if not (export / "index.html").is_file():
    raise SystemExit("Build the static export first: pnpm build:pages")


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass  # Browsers cancel speculative asset requests when navigating.

    def translate_path(self, path):
        parts = urlsplit(path)
        if parts.path == base_path or parts.path.startswith(base_path + "/"):
            path = parts.path[len(base_path):] or "/"
            if parts.query:
                path += "?" + parts.query
            return super().translate_path(path)
        return str(export / "__outside_base_path__")

    def send_error(self, code, message=None, explain=None):
        if code == 404 and (export / "404.html").is_file():
            body = (export / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def log_message(self, *_):
        pass


class Server(ThreadingHTTPServer):
    request_queue_size = 128


Server(("127.0.0.1", options.port), partial(Handler, directory=str(export))).serve_forever()
