"""开发/演示用静态服务器（替代 python -m http.server）。

Python 3.13 之前的 mimetypes 不认识 .mjs/.wasm/.task：
.mjs 被服成 text/plain，浏览器对 ES 模块强制严格 MIME，
MediaPipe 的 vision_bundle.mjs 直接加载失败（ENGINE FAILED）。
run_web.bat 与无头截图统一走本脚本。

用法：python tools/serve.py [端口] [--bind IP]（默认 8000 / 127.0.0.1）
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

EXT_MIME = {
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
    '.task': 'application/octet-stream',
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        **EXT_MIME,
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    bind = '127.0.0.1'
    if '--bind' in sys.argv:
        bind = sys.argv[sys.argv.index('--bind') + 1]
    port = int(args[0]) if args else 8000
    handler = partial(Handler, directory='web')
    print(f'serving web/ on http://{bind}:{port}/ (Ctrl+C 退出)')
    ThreadingHTTPServer((bind, port), handler).serve_forever()


if __name__ == '__main__':
    main()
