#!/usr/bin/env python3
import http.server
import socketserver
import os
import socket
from urllib.parse import unquote, urlsplit

PORT = 8080
DIRETORIO = os.path.dirname(os.path.abspath(__file__))

# Arquivos e pastas que nunca devem vazar pelo Localtunnel
BLOQUEADOS = {".git", ".env", "logs_servidor", "__pycache__", "dev_server.py", "painel_mindnote.py", "win_proc.py", "config.py"}

class SecureDevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRETORIO, **kwargs)

    def send_head(self):
        # Validação de segurança de rotas
        caminho_requisitado = unquote(urlsplit(self.path).path)
        partes = [p for p in caminho_requisitado.split("/") if p]
        
        if any(p.startswith(".") or p in BLOQUEADOS for p in partes):
            self.send_error(404, "Not Found (Restricted)")
            return None
            
        return super().send_head()

    def address_string(self):
        return self.client_address[0]

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

class ThreadedSecureHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"  # No Windows, REUSEADDR permite bind duplicado.

    def server_bind(self):
        if os.name == "nt":
            # Trava estrita de porta no Windows
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

if __name__ == '__main__':
    with ThreadedSecureHTTPServer(('127.0.0.1', PORT), SecureDevHandler) as httpd:
        print(f'Servidor seguro ativo em: http://127.0.0.1:{PORT}')
        print('Modo multi-thread; SO_EXCLUSIVEADDRUSE ativado; Bloqueio de rotas sensíveis.')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('Servidor finalizado.')