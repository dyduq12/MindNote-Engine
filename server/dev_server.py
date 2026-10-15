#!/usr/bin/env python3
import http.server
import socketserver
import os
import socket
import sys
import time
from urllib.parse import unquote

from config import PORTA, PROJECT_DIR

RAIZ = os.path.realpath(PROJECT_DIR)
BLOQUEADOS = {".git", ".env", "server", "__pycache__", "node_modules", "venv", "env"}


def _suspeita(p: str) -> bool:
    """Segmento de caminho que nunca deve ser servido (comparacao case-insensitive)."""
    return (
        p.startswith(".")            # dotfiles e '..'
        or ":" in p                  # streams NTFS (::$DATA, ::$INDEX_ALLOCATION) e drives
        or p != p.rstrip(" .")       # Win32 ignora ponto/espaco finais
        or p.casefold() in BLOQUEADOS
    )


class SecureDevHandler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 + keep-alive: reaproveita a conexao pelo tunel
    # (em HTTP/1.0 cada arquivo abria uma conexao nova atraves do localtunnel).
    protocol_version = "HTTP/1.1"
    timeout = 30

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def _permitido(self) -> bool:
        bruto = self.path.split("?", 1)[0].split("#", 1)[0]
        partes_url = [p for p in unquote(bruto).replace("\\", "/").split("/") if p]
        if any(_suspeita(p) for p in partes_url):
            return False

        # Valida o caminho REAL que sera aberto (resolve caixa, nomes 8.3, junctions, symlinks)
        real = os.path.realpath(self.translate_path(self.path))
        try:
            rel = os.path.relpath(real, RAIZ)
        except ValueError:  # outro drive
            return False
        if rel == ".":
            return True
        partes = rel.replace("\\", "/").split("/")
        if partes[0] == "..":
            return False
        return not any(_suspeita(p) for p in partes)

    def send_head(self):
        if not self._permitido():
            self.send_error(404, "Not Found")
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, "Not Found")
        return None

    def address_string(self):
        return self.client_address[0]

    def end_headers(self):
        # no-cache = revalida sempre (Last-Modified -> 304), sem rebaixar o arquivo inteiro
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


class ThreadedSecureHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"  # no Windows REUSEADDR permite bind duplicado

    def handle_error(self, request, client_address):
        # Cliente que fecha a conexao (tunel reiniciado, aba fechada) nao e erro do servidor
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionError, TimeoutError, socket.timeout)):
            return
        super().handle_error(request, client_address)

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def abrir_servidor(tentativas=4, pausa=1.0):
    """Tenta abrir a porta algumas vezes: cobre a janela em que o processo anterior
    acabou de morrer e o Windows ainda nao liberou o endereco."""
    ultimo = None
    for i in range(tentativas):
        try:
            return ThreadedSecureHTTPServer(("127.0.0.1", PORTA), SecureDevHandler)
        except OSError as e:
            ultimo = e
            if getattr(e, "winerror", None) != 10048 and e.errno not in (98, 48):
                raise
            if i < tentativas - 1:
                time.sleep(pausa)
    raise ultimo


if __name__ == "__main__":
    try:
        httpd = abrir_servidor()
    except OSError as e:
        print(f"[ERRO] Nao foi possivel abrir a porta {PORTA}: {e}", flush=True)
        sys.exit(1)

    with httpd:
        # O painel detecta esta linha para marcar o servidor como pronto.
        print(f"Servidor seguro ativo em: http://127.0.0.1:{PORTA}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("Servidor finalizado.", flush=True)
