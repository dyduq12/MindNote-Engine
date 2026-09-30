import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass 

# Caminhos baseados na localização do arquivo (dentro de /server)
SERVER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SERVER_DIR.parent
LOG_DIR = SERVER_DIR / "logs_servidor"

PORTA = int(os.getenv("MN_PORT", "8080"))
SUBDOMINIO_PADRAO = os.getenv("MN_SUBDOMAIN", "mindnote-edu")
TOPICO_NTFY = os.getenv("MN_NTFY_TOPIC", "mindnote-edu-sync")