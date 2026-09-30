import os
import sys
import time
import json
import queue
import urllib.request
import threading
import logging
import re
import shutil
import socket
import webbrowser
from datetime import datetime
from urllib.parse import urlparse
import customtkinter as ctk

from config import BASE_DIR, LOG_DIR, PORTA, SUBDOMINIO_PADRAO, TOPICO_NTFY
from win_proc import spawn, kill_tree, bind_children_to_self

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# Expressões regulares para validação
URL_RE = re.compile(r"your url is:\s*(https://[^\s]+)", re.IGNORECASE)
SUBDOMINIO_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$")

class PainelMindNote(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("MindNote Engine - Painel de Controlo Pro")
        self.geometry("450x620")
        self.resizable(False, False)

        # 1. Proteção de Ciclo de Vida Nativa (Kernel do Windows)
        self._job = bind_children_to_self()

        # 2. Comunicação Segura de Threads (Fila e Locks)
        self._q = queue.Queue()
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        
        self.is_running = False
        self.tunnel_process = None
        self.server_process = None
        self.current_url = ""
        self.server_ready = threading.Event()

        self.configurar_logging()
        self.construir_interface()

        self.protocol("WM_DELETE_WINDOW", self.encerrar_aplicacao)
        
        # Inicia o loop de consumo de eventos da UI
        self.after(100, self._drain_queue)

    def configurar_logging(self):
        LOG_DIR.mkdir(exist_ok=True)
        nome_ficheiro = datetime.now().strftime("sessao_%Y-%m-%d_%H-%M-%S.log")
        
        handler = logging.FileHandler(LOG_DIR / nome_ficheiro, encoding="utf-8", delay=True)
        handler.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", "%H:%M:%S"))
        
        self.logger = logging.getLogger("mindnote")
        self.logger.setLevel(logging.INFO)
        self.logger.addHandler(handler)

    def registrar_log(self, mensagem):
        self.logger.info(mensagem)
        print(mensagem, flush=True)

    # ─── GESTÃO DE EVENTOS (THREAD-SAFE) ─────────────────────────────────────
    def ui(self, func, *args, **kwargs):
        """Coloca uma função na fila para ser executada na thread principal do ecrã."""
        self._q.put((func, args, kwargs))

    def _drain_queue(self):
        """Consome a fila de eventos de forma segura. Roda sempre na main thread."""
        try:
            while True:
                func, args, kwargs = self._q.get_nowait()
                func(*args, **kwargs)
        except queue.Empty:
            pass
        self.after(100, self._drain_queue)

    def atualizar_status(self, mensagem):
        self.status_bar.configure(text=f"Estado: {mensagem}")

    # ─── INTERFACE (VISUAL) ──────────────────────────────────────────────────
    def construir_interface(self):
        frame_server = ctk.CTkFrame(self)
        frame_server.pack(pady=10, padx=15, fill="x")

        ctk.CTkLabel(frame_server, text="Controlo do Ambiente", font=("Segoe UI", 16, "bold")).pack(pady=(10, 5))

        sub_frame = ctk.CTkFrame(frame_server, fg_color="transparent")
        sub_frame.pack(fill="x", padx=10, pady=5)
        ctk.CTkLabel(sub_frame, text="Subdomínio:").pack(side="left")
        self.entry_subdomain = ctk.CTkEntry(sub_frame, width=200)
        self.entry_subdomain.insert(0, SUBDOMINIO_PADRAO)
        self.entry_subdomain.pack(side="right")

        self.lbl_status_local = ctk.CTkLabel(frame_server, text="Servidor Local: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_local.pack()
        self.lbl_status_tunnel = ctk.CTkLabel(frame_server, text="Túnel Público: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_tunnel.pack()

        self.btn_iniciar = ctk.CTkButton(frame_server, text="▶ Iniciar Ambiente", command=self.toggle_ambiente, height=40)
        self.btn_iniciar.pack(pady=10, padx=10, fill="x")

        self.btn_link = ctk.CTkButton(frame_server, text="🔗 Abrir Link no Navegador", command=self.abrir_link, state="disabled", fg_color="#374151")
        self.btn_link.pack(pady=(0, 10), padx=10, fill="x")

        frame_git = ctk.CTkFrame(self)
        frame_git.pack(pady=10, padx=15, fill="x")

        ctk.CTkLabel(frame_git, text="Versionamento (Git)", font=("Segoe UI", 14, "bold")).pack(pady=(10, 5))
        self.entry_commit = ctk.CTkEntry(frame_git, placeholder_text="Mensagem do commit (Ex: Ajuste no SVG)")
        self.entry_commit.pack(pady=5, padx=10, fill="x")
        self.btn_git = ctk.CTkButton(frame_git, text="💾 Commit & Push", command=self.iniciar_git, fg_color="#059669", hover_color="#047857")
        self.btn_git.pack(pady=(5, 10), padx=10, fill="x")

        frame_manage = ctk.CTkFrame(self)
        frame_manage.pack(pady=10, padx=15, fill="x")

        ctk.CTkButton(frame_manage, text="📂 Abrir Pasta de Registos (Logs)", command=self.abrir_logs, fg_color="transparent", border_width=1).pack(pady=5, padx=10, fill="x")
        self.btn_notificar = ctk.CTkButton(frame_manage, text="📱 Reenviar Notificação", command=self.solicitar_notificacao, state="disabled", fg_color="transparent", border_width=1)
        self.btn_notificar.pack(pady=(5, 10), padx=10, fill="x")

        self.status_bar = ctk.CTkLabel(self, text="Estado: Aguardar comando...", anchor="w", fg_color="#1f2937", padx=10)
        self.status_bar.pack(side="bottom", fill="x")

    # ─── CONTROLADORES ───────────────────────────────────────────────────────
    def toggle_ambiente(self):
        if not self.is_running:
            self.iniciar_ambiente()
        else:
            self.parar_ambiente(sincrono=False)

    def iniciar_ambiente(self):
        sub = self.entry_subdomain.get().strip().lower()
        if not SUBDOMINIO_RE.match(sub):
            self.atualizar_status("Subdomínio inválido (apenas a-z, 0-9, hífen; mín. 4).")
            return

        self.is_running = True
        self._stop_event = threading.Event()
        self.server_ready.clear()
        
        self.btn_iniciar.configure(text="⏹ Parar Servidor", fg_color="#ef4444", hover_color="#b91c1c")
        self.entry_subdomain.configure(state="disabled")
        
        threading.Thread(target=self.worker_servidor_local, args=(self._stop_event, PORTA), daemon=True).start()
        threading.Thread(target=self.worker_tunel, args=(self._stop_event, sub, PORTA), daemon=True).start()

    def parar_ambiente(self, sincrono=False):
        self._stop_event.set()
        self.is_running = False
        self.atualizar_status("A encerrar processos...")

        with self._lock:
            procs = [self.tunnel_process, self.server_process]

        if sincrono:
            for p in procs:
                kill_tree(p)
        else:
            for p in procs:
                threading.Thread(target=kill_tree, args=(p,), daemon=True).start()

        self.lbl_status_local.configure(text="Servidor Local: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_tunnel.configure(text="Túnel Público: 🔴 Offline", text_color="#ef4444")
        self.btn_iniciar.configure(text="▶ Iniciar Ambiente", fg_color=["#3a7ebf", "#1f538d"], hover_color=["#325882", "#14375e"])
        self.btn_link.configure(state="disabled")
        self.btn_notificar.configure(state="disabled")
        self.entry_subdomain.configure(state="normal")
        self.current_url = ""

    def encerrar_aplicacao(self):
        if self.is_running:
            self.parar_ambiente(sincrono=True)
        self.destroy()

    # ─── WORKERS (BACKGROUND) ────────────────────────────────────────────────
    def worker_servidor_local(self, stop_event, porta):
        try:
            script_path = str(BASE_DIR / "dev_server.py")
            proc = spawn([sys.executable, "-u", script_path], BASE_DIR)
        except OSError as e:
            self.registrar_log(f"[ERRO LOCAL] {e}")
            self.ui(self.parar_ambiente)
            return

        with self._lock:
            if stop_event.is_set():
                kill_tree(proc)
                return
            self.server_process = proc

        # Verificação proativa de disponibilidade da porta (Health Check)
        def esperar_porta():
            for _ in range(50):
                if stop_event.is_set() or proc.poll() is not None:
                    return
                with socket.socket() as s:
                    s.settimeout(0.2)
                    if s.connect_ex(("127.0.0.1", porta)) == 0:
                        self.server_ready.set()
                        self.ui(self.lbl_status_local.configure, text=f"Servidor Local: 🟢 Online (Porta {porta})", text_color="#10b981")
                        return
                time.sleep(0.2)
        
        threading.Thread(target=esperar_porta, daemon=True).start()

        for linha in proc.stdout:
            self.registrar_log(f"[LOCAL] {linha.strip()}")
            
        if not stop_event.is_set():
            self.registrar_log(f"[ERRO LOCAL] Servidor fechou de forma inesperada. Código: {proc.poll()}")
            self.ui(self.parar_ambiente)

    def worker_tunel(self, stop_event, subdominio, porta):
        url_esperada = f"https://{subdominio}.loca.lt"
        npx = shutil.which("npx")
        
        if not npx:
            self.registrar_log("[ERRO] npx/Node.js não encontrado no PATH.")
            self.ui(self.atualizar_status, "Erro: Instale o Node.js LTS.")
            self.ui(self.parar_ambiente)
            return

        if not self.server_ready.wait(timeout=15):
            self.registrar_log("[ERRO] Servidor local demorou a responder. Túnel cancelado.")
            return

        espera_backoff = 2
        tentativa = 0

        while not stop_event.is_set():
            tentativa += 1
            self.ui(self.atualizar_status, f"A negociar túnel... (Tentativa {tentativa})")
            
            try:
                proc = spawn([npx, "--yes", "localtunnel", "--port", str(porta), "--subdomain", subdominio], BASE_DIR)
            except OSError as e:
                self.registrar_log(f"[ERRO] Falha ao iniciar npx: {e}")
                break

            with self._lock:
                if stop_event.is_set():
                    kill_tree(proc)
                    return
                self.tunnel_process = proc

            inicio = time.monotonic()
            tunel_ok = False

            try:
                for linha in proc.stdout:
                    self.registrar_log(f"[TUNNEL] {linha.strip()}")
                    match = URL_RE.search(linha)
                    if not match:
                        continue
                        
                    url = match.group(1).rstrip("/")
                    
                    if url == url_esperada:
                        tunel_ok = True
                        self.current_url = url
                        self.ui(self.atualizar_status, "Ambiente 100% Online.")
                        self.ui(self.lbl_status_tunnel.configure, text=f"Túnel Público: 🟢 {url}", text_color="#10b981")
                        self.ui(self.btn_link.configure, state="normal")
                        self.ui(self.btn_notificar.configure, state="normal")
                        
                        threading.Thread(target=self.worker_notificacao, daemon=True).start()
                    else:
                        self.registrar_log(f"[GATEKEEPER] URL rejeitada: {url}")
                        break # Força a morte do processo para tentar novamente
            finally:
                kill_tree(proc) # Garante destruição total do nó (Node) órfão

            if stop_event.is_set():
                return

            if tunel_ok:
                self.ui(self.lbl_status_tunnel.configure, text="Túnel Público: 🔴 Offline", text_color="#ef4444")
                self.registrar_log("[TUNNEL] Conexão caiu. A tentar reconectar...")
                if time.monotonic() - inicio > 30:
                    espera_backoff = 2 # Se ficou estável por 30s, zera a penalização

            stop_event.wait(espera_backoff)
            espera_backoff = min(espera_backoff * 2, 60) # Atraso exponencial até 60s

    # ─── WORKERS (GIT & NOTIFICAÇÃO) ─────────────────────────────────────────
    def _git_run(self, *args, timeout_s=60):
        """Wrapper resiliente para o Git."""
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        return subprocess.run(
            ["git", *args], cwd=BASE_DIR, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout_s,
            stdin=subprocess.DEVNULL, creationflags=NO_WINDOW if os.name == 'nt' else 0,
            env=env
        )

    def iniciar_git(self):
        msg = self.entry_commit.get().strip()
        if not msg:
            self.atualizar_status("Erro: A mensagem de commit não pode estar vazia.")
            return
            
        self.btn_git.configure(state="disabled")
        threading.Thread(target=self.worker_git, args=(msg,), daemon=True).start()

    def worker_git(self, msg):
        try:
            if not shutil.which("git"):
                raise RuntimeError("Git não encontrado no PATH do Windows.")

            # Verifica se há ficheiros para submeter
            status_check = self._git_run("status", "--porcelain")
            if not status_check.stdout.strip():
                self.ui(self.atualizar_status, "Nada para submeter (commit).")
                return

            etapas = [("add", ("add", "-A")), ("commit", ("commit", "-m", msg)), ("push", ("push",))]
            
            for nome, args in etapas:
                self.ui(self.atualizar_status, f"Git {nome}...")
                res = self._git_run(*args, timeout_s=120 if nome == "push" else 60)
                self.registrar_log(f"[GIT {nome.upper()}] {res.stdout}{res.stderr}")
                
                if res.returncode != 0:
                    raise RuntimeError(f"Git {nome} falhou (código {res.returncode})")

            self.ui(self.atualizar_status, "Commit e Push concluídos com sucesso.")
            self.ui(self.entry_commit.delete, 0, "end")

        except (RuntimeError, subprocess.TimeoutExpired, OSError) as e:
            self.registrar_log(f"[ERRO GIT] {e}")
            self.ui(self.atualizar_status, f"Falha no Git: {str(e)[:40]}...")
        finally:
            self.ui(self.btn_git.configure, state="normal")

    def solicitar_notificacao(self):
        if not self.current_url:
            return
        threading.Thread(target=self.worker_notificacao, daemon=True).start()

    def worker_notificacao(self):
        if not TOPICO_NTFY:
            return
        
        self.ui(self.atualizar_status, "A enviar notificação para o tablet...")
        try:
            req_ip = urllib.request.Request('https://api.ipify.org', headers={'User-Agent': 'Mozilla/5.0'})
            ip_publico = urllib.request.urlopen(req_ip, timeout=5).read().decode('utf8').strip()
            
            dados = {
                "topic": TOPICO_NTFY,
                "title": "MindNote Online 🚀",
                "message": f"IP de Libertação: {ip_publico}",
                "tags": ["rocket", "link"],
                "priority": 4,
                "actions": [
                    {"action": "view", "label": "Abrir MindNote", "url": self.current_url, "clear": True},
                    {"action": "copy", "label": "Copiar IP", "content": ip_publico, "clear": True}
                ]
            }
            req_push = urllib.request.Request(f"https://ntfy.sh/{TOPICO_NTFY}", data=json.dumps(dados).encode("utf-8"), headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req_push, timeout=5)
            self.registrar_log("[NTFY] Notificação push enviada.")
            self.ui(self.atualizar_status, "Notificação enviada ao tablet!")
        except Exception as e:
            self.registrar_log(f"[ERRO NTFY] {e}")
            self.ui(self.atualizar_status, "Falha ao notificar o tablet.")

    # ─── AUXILIARES ──────────────────────────────────────────────────────────
    def abrir_link(self):
        if self.current_url:
            webbrowser.open(self.current_url)

    def abrir_logs(self):
        caminho = str(LOG_DIR.resolve())
        if os.name == 'nt':
            os.startfile(caminho)
        else:
            subprocess.run(["xdg-open", caminho])

if __name__ == "__main__":
    app = PainelMindNote()
    app.mainloop()