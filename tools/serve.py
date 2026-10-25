#!/usr/bin/env python3
"""局域网启动器：电脑起一个静态服务器，手机同 WiFi 打开即可安装到主屏。

用法：
    python tools/serve.py            # 默认 8765 端口
    python tools/serve.py 9000       # 指定端口
"""
import http.server
import os
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', '8765'))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def guess_type(self, path):
        if str(path).endswith('.webmanifest'):
            return 'application/manifest+json'
        if str(path).endswith('.js'):
            return 'text/javascript'
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        sys.stdout.write('  %s\n' % (fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    ip = lan_ip()
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        print('=' * 56)
        print('  卡点 · 本地服务已启动')
        print('')
        print('  本机打开：  http://127.0.0.1:%d/' % PORT)
        print('  手机打开：  http://%s:%d/' % (ip, PORT))
        print('')
        print('  手机浏览器打开上面的地址 → 分享/添加到主屏幕')
        print('  （需与电脑连同一个 WiFi；连不上多半是访客网络隔离）')
        print('')
        print('  Ctrl+C 停止')
        print('=' * 56)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止')
