import http.server
import socketserver
import os

PORT = 8080
DIRETORIO = os.path.dirname(os.path.abspath(__file__))


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRETORIO, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DevHandler) as httpd:
        print(f"Servidor ativo em: http://localhost:{PORT}")
        httpd.serve_forever()
