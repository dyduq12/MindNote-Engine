import subprocess
import urllib.request
import re
import sys
import json

# ─── CONFIGURAÇÕES DO USUÁRIO ───────────────────────────────────────────────
# Escolha um subdomínio fixo (letras minúsculas e hífens).
# Se estiver disponível, o link do seu mapa será SEMPRE o mesmo.
SUBDOMINIO_FIXO = "mindnote-edu"

# Tópico configurado no aplicativo ntfy do tablet
TOPICO_NTFY = "mindnote-edu-sync"
# ────────────────────────────────────────────────────────────────────────────

def obter_ip_publico():
    try:
        req = urllib.request.Request(
            'https://api.ipify.org', 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        return urllib.request.urlopen(req, timeout=5).read().decode('utf8').strip()
    except Exception:
        return "Não identificado"

def iniciar_servidor():
    """Inicia o dev_server.py em segundo plano."""
    return subprocess.Popen([sys.executable, "dev_server.py"])

def enviar_notificacao_tablet(url, ip_publico):
    """Envia notificação push com ações clicáveis para o app ntfy no tablet."""
    if not TOPICO_NTFY:
        return

    try:
        dados_payload = {
            "topic": TOPICO_NTFY,
            "title": "MindNote Online 🚀",
            "message": f"IP de Liberação: {ip_publico}",
            "tags": ["rocket", "link"],
            "priority": 4,
            "actions": [
                {
                    "action": "view",
                    "label": "Abrir MindNote",
                    "url": url,
                    "clear": True
                },
                {
                    "action": "copy",
                    "label": "Copiar IP",
                    "content": ip_publico,
                    "clear": True
                }
            ]
        }
        
        req = urllib.request.Request(
            f"https://ntfy.sh/{TOPICO_NTFY}",
            data=json.dumps(dados_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=5)
        print("📲 Notificação enviada com sucesso para o tablet!")
    except Exception as e:
        print(f"⚠️ Não foi possível enviar notificação push: {e}")

def exibir_qrcode_terminal(url):
    """Renderiza um QR Code em texto puro dentro do console."""
    try:
        import qrcode
        qr = qrcode.QRCode()
        qr.add_data(url)
        print("\n📱 Escaneie o QR Code abaixo com o tablet:")
        qr.print_ascii(invert=True)
    except ImportError:
        pass

def iniciar_localtunnel():
    ip_publico = obter_ip_publico()
    
    # Monta comando com subdomínio pré-definido
    comando = ["npx", "localtunnel", "--port", "8080"]
    if SUBDOMINIO_FIXO:
        comando.extend(["--subdomain", SUBDOMINIO_FIXO])

    processo = subprocess.Popen(
        comando,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True
    )

    print("\n⏳ Inicializando túnel e registrando endpoint público...")

    for linha in processo.stdout:
        match = re.search(r'your url is:\s*(https://[^\s]+)', linha)
        if match:
            url = match.group(1).strip()
            
            print("\n" + "="*56)
            print("🚀 AMBIENTE PRONTO PARA ACESSO NO TABLET")
            print("="*56)
            print(f"🔗 Link de Acesso  : {url}")
            print(f"🔑 Senha / IP      : {ip_publico}")
            print("="*56)

            exibir_qrcode_terminal(url)
            enviar_notificacao_tablet(url, ip_publico)

            print("\nServidor em execução. Pressione Ctrl+C para encerrar.\n")
            break

if __name__ == "__main__":
    servidor = iniciar_servidor()
    try:
        iniciar_localtunnel()
        servidor.wait()
    except KeyboardInterrupt:
        print("\nEncerrando servidor e conexões ativas...")
        servidor.terminate()
        sys.exit(0)