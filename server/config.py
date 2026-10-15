import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# BASE_DIR = pasta 'server/'  |  PROJECT_DIR = raiz do projeto (onde fica o .git)
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
LOG_DIR = BASE_DIR / "logs_servidor"

try:
    PORTA = int(os.getenv("MN_PORT", "8080"))
except ValueError:
    PORTA = 8080
if not (1 <= PORTA <= 65535):
    PORTA = 8080

SUBDOMINIO_PADRAO = os.getenv("MN_SUBDOMAIN", "mindnote-edu")

# Vazio por padrao: sem topico configurado, nenhuma notificacao (e nenhum IP) e enviada.
# Se configurar, use um valor longo e aleatorio (o ntfy.sh publico nao exige autenticacao).
TOPICO_NTFY = os.getenv("MN_NTFY_TOPIC", "").strip()
