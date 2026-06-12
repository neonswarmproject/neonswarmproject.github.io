#!/usr/bin/env python3
"""Dev preview server with caching disabled.

python http.server sends no Cache-Control, so browsers heuristically cache
js/css and serve STALE code after edits (the classic "verTag doesn't match"
trap). This wrapper adds Cache-Control: no-store to every response.

Usage: python3 tools/dev-server.py [port]   (default 8125)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # quiet


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8125
    ThreadingHTTPServer(('127.0.0.1', port), NoStoreHandler).serve_forever()
