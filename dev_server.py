#!/usr/bin/env python3
"""Servidor local multi-thread sem lookup reverso de DNS e sem cache."""

import http.server
import os
import socketserver

PORT = 8080
DIRETORIO = os.path.dirname(os.path.abspath(__file__))


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRETORIO, **kwargs)

    def address_string(self):
        return self.client_address[0]

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    with ThreadedHTTPServer(('', PORT), DevHandler) as httpd:
        print(f'Servidor ativo em: http://localhost:{PORT}')
        print('Modo multi-thread; lookup reverso de DNS desativado; cache desativado.')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('Servidor finalizado.')
