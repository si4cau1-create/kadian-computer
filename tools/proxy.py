#!/usr/bin/env python3
"""CORS 转发器：解决手机浏览器直连大模型 API 被跨域策略拦截的问题。

用法：
    python tools/proxy.py                 # 默认监听 8899，转发到 DeepSeek
    python tools/proxy.py 8899 https://api.deepseek.com/v1

手机端设置里把 base_url 改成：  http://<电脑IP>:8899/v1
API Key 仍填在手机上，代理只做透传，不落盘、不记录。

也可以在请求头里带 X-Upstream-Base: https://xxx/v1 临时切换上游。
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', '8899'))
UPSTREAM = (sys.argv[2] if len(sys.argv) > 2 else
            os.environ.get('KADIAN_UPSTREAM', 'https://api.deepseek.com/v1')).rstrip('/')


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        sys.stdout.write('  %s\n' % (fmt % args))

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers',
                         'Authorization, Content-Type, X-Upstream-Base, X-Requested-With')
        self.send_header('Access-Control-Max-Age', '86400')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip('/') in ('', '/health'):
            body = json.dumps({'ok': True, 'upstream': UPSTREAM}).encode('utf-8')
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        payload = self.rfile.read(length) if length else b''

        upstream = self.headers.get('X-Upstream-Base', '').rstrip('/') or UPSTREAM
        path = self.path
        if not path.startswith('/v1/'):
            path = '/v1' + path if not path.startswith('/') else '/v1' + path
        url = upstream + path

        headers = {
            'Content-Type': self.headers.get('Content-Type', 'application/json'),
        }
        auth = self.headers.get('Authorization')
        if auth:
            headers['Authorization'] = auth

        req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self._cors()
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            body = json.dumps({'error': {'message': '代理转发失败：%s' % e}}).encode('utf-8')
            self.send_response(502)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)


if __name__ == '__main__':
    print('=' * 56)
    print('  卡点 · CORS 转发器已启动')
    print('  监听：      0.0.0.0:%d' % PORT)
    print('  默认上游：  %s' % UPSTREAM)
    print('  手机 base_url 填：  http://<电脑IP>:%d/v1' % PORT)
    print('  （API Key 仍填在手机上，这里只透传不落盘）')
    print('  Ctrl+C 停止')
    print('=' * 56)
    try:
        ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
