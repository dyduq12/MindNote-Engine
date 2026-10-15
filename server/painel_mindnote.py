import os
import sys
import time
import json
import queue
import logging
import re
import shutil
import subprocess
import threading
import webbrowser
import urllib.request
from datetime import datetime

import customtkinter as ctk

from config import BASE_DIR, PROJECT_DIR, LOG_DIR, PORTA, SUBDOMINIO_PADRAO, TOPICO_NTFY
from win_proc import (
    spawn, kill_tree, bind_children_to_self, run_capture,
    single_instance, aviso, pid_na_porta, cmdline_do_pid, nome_do_pid, kill_pid,
)

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

URL_RE = re.compile(r"your url is:\s*(https://\S+)", re.I)
SUB_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$")

WATCHDOG_TUNEL_S = 90            # tempo maximo para o localtunnel devolver uma URL
INTERVALO_NOTIF_S = 300          # anti-spam de notificacoes em reconexoes
INTERVALO_REJEICAO_S = 2         # espera entre tentativas quando o subdominio esta ocupado
LT_PACOTE = "localtunnel@2.0.2"  # versao fixa: o npx nao consulta o registry a cada tentativa

GITIGNORE_ITENS = [
    "server/logs_servidor/",
    "**/__pycache__/",
    ".env",
    "server/.env",
    "node_modules/",
]
GIT_UNTRACK = [
    "server/logs_servidor", "server/__pycache__", "__pycache__",
    "server/.env", ".env",
]


class PainelMindNote(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("MindNote Engine - Painel de Controlo Pro")
        self.geometry("450x620")
        self.resizable(False, False)

        self.configurar_logging()
        try:
            self._job = bind_children_to_self()
        except OSError as e:
            self._job = None
            self.registrar_log(f"[AVISO] Job Object indisponivel: {e}. O node.exe pode ficar orfao num crash.")

        self._q = queue.Queue()
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._closing = False
        self._kill_threads = []

        self.is_running = False
        self.tunnel_process = None
        self.server_process = None
        self.current_url = ""
        self.server_ready = threading.Event()
        self._ultima_notif = 0.0

        self.construir_interface()
        self.protocol("WM_DELETE_WINDOW", self.encerrar_aplicacao)
        self.after(100, self._drain_queue)

    # ---------------------------------------------------------------- logging
    def configurar_logging(self):
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        nome = datetime.now().strftime("sessao_%Y-%m-%d_%H-%M-%S.log")
        h = logging.FileHandler(LOG_DIR / nome, encoding="utf-8", delay=True)
        h.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", "%H:%M:%S"))
        self.logger = logging.getLogger("mindnote")
        self.logger.setLevel(logging.INFO)
        self.logger.addHandler(h)

    def registrar_log(self, msg):
        self.logger.info(msg)
        print(msg, flush=True)

    # ----------------------------------------------- fila producer-consumer
    def ui(self, func, *args, _tok=None, **kwargs):
        """Enfileira func para a main thread. _tok = stop_event da sessao:
        mensagens de sessoes ja encerradas sao descartadas."""
        self._q.put((_tok, func, args, kwargs))

    def _drain_queue(self):
        if self._closing:
            return
        try:
            limite = time.monotonic() + 0.03
            while time.monotonic() < limite:
                try:
                    tok, func, args, kwargs = self._q.get_nowait()
                except queue.Empty:
                    break
                if tok is not None and tok.is_set():
                    continue
                try:
                    func(*args, **kwargs)
                except Exception:
                    self.logger.exception("[UI] Callback da fila falhou")
        finally:
            if not self._closing:
                try:
                    self.after(100 if self._q.empty() else 10, self._drain_queue)
                except Exception:
                    pass

    def atualizar_status(self, msg):
        self.status_bar.configure(text=f"Estado: {msg}")

    # -------------------------------------------------------------- interface
    def construir_interface(self):
        frame_server = ctk.CTkFrame(self)
        frame_server.pack(pady=10, padx=15, fill="x")

        ctk.CTkLabel(frame_server, text="Controlo do Ambiente", font=("Segoe UI", 16, "bold")).pack(pady=(10, 5))

        sub_frame = ctk.CTkFrame(frame_server, fg_color="transparent")
        sub_frame.pack(fill="x", padx=10, pady=5)
        ctk.CTkLabel(sub_frame, text="Subdominio:").pack(side="left")
        self.entry_subdomain = ctk.CTkEntry(sub_frame, width=200)
        self.entry_subdomain.insert(0, SUBDOMINIO_PADRAO)
        self.entry_subdomain.pack(side="right")

        self.lbl_status_local = ctk.CTkLabel(frame_server, text="Servidor Local: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_local.pack()
        self.lbl_status_tunnel = ctk.CTkLabel(frame_server, text="Túnel Público: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_tunnel.pack()

        self.btn_iniciar = ctk.CTkButton(frame_server, text="▶ Iniciar Ambiente", command=self.toggle_ambiente, height=40)
        self.btn_iniciar.pack(pady=10, padx=10, fill="x")

        self.btn_link = ctk.CTkButton(frame_server, text="🔗 Abrir Link no Navegador", command=self.abrir_link,
                                      state="disabled", fg_color="#374151")
        self.btn_link.pack(pady=(0, 10), padx=10, fill="x")

        frame_git = ctk.CTkFrame(self)
        frame_git.pack(pady=10, padx=15, fill="x")
        ctk.CTkLabel(frame_git, text="Versionamento (Git)", font=("Segoe UI", 14, "bold")).pack(pady=(10, 5))
        self.entry_commit = ctk.CTkEntry(frame_git, placeholder_text="Mensagem do commit (Ex: Ajuste no SVG)")
        self.entry_commit.pack(pady=5, padx=10, fill="x")
        self.btn_git = ctk.CTkButton(frame_git, text="💾 Commit & Push", command=self.iniciar_git,
                                     fg_color="#059669", hover_color="#047857")
        self.btn_git.pack(pady=(5, 10), padx=10, fill="x")

        frame_manage = ctk.CTkFrame(self)
        frame_manage.pack(pady=10, padx=15, fill="x")
        ctk.CTkButton(frame_manage, text="📂 Abrir Pasta de Registos (Logs)", command=self.abrir_logs,
                      fg_color="transparent", border_width=1).pack(pady=5, padx=10, fill="x")
        self.btn_notificar = ctk.CTkButton(frame_manage, text="📱 Reenviar Notificação", command=self.solicitar_notificacao,
                                           state="disabled", fg_color="transparent", border_width=1)
        self.btn_notificar.pack(pady=(5, 10), padx=10, fill="x")

        self.status_bar = ctk.CTkLabel(self, text="Estado: Aguardar comando...", anchor="w", fg_color="#1f2937", padx=10)
        self.status_bar.pack(side="bottom", fill="x")

    # ---------------------------------------------------------- controladores
    def toggle_ambiente(self):
        if not self.is_running:
            self.iniciar_ambiente()
        else:
            self.parar_ambiente(sincrono=False)

    def iniciar_ambiente(self):
        sub = self.entry_subdomain.get().strip().lower()
        if not SUB_RE.match(sub):
            self.atualizar_status("Subdominio invalido (a-z, 0-9, hifen; min. 4 caracteres).")
            return

        self._stop_event = stop = threading.Event()
        self.is_running = True
        self.server_ready.clear()

        self.btn_iniciar.configure(text="⏹ Parar Servidor", fg_color="#ef4444", hover_color="#b91c1c")
        self.entry_subdomain.configure(state="disabled")
        self.atualizar_status("A iniciar ambiente...")

        threading.Thread(target=self.rotina_servidor_local, args=(stop, PORTA), daemon=True).start()
        threading.Thread(target=self.rotina_tunel, args=(stop, sub, PORTA), daemon=True).start()

    def parar_ambiente(self, sincrono=False, motivo=None):
        if not self.is_running:
            return
        self._stop_event.set()
        self.is_running = False
        self.current_url = ""
        self.atualizar_status(motivo or "A encerrar processos...")

        with self._lock:
            procs = [self.tunnel_process, self.server_process]
            self.tunnel_process = self.server_process = None

        def matar():
            ts = [threading.Thread(target=kill_tree, args=(p,)) for p in procs]
            for t in ts:
                t.start()
            for t in ts:
                t.join()

        self.lbl_status_local.configure(text="Servidor Local: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_tunnel.configure(text="Túnel Público: 🔴 Offline", text_color="#ef4444")
        self.btn_iniciar.configure(text="▶ Iniciar Ambiente", fg_color=["#3a7ebf", "#1f538d"],
                                   hover_color=["#325882", "#14375e"])
        self.btn_link.configure(state="disabled")
        self.btn_notificar.configure(state="disabled")
        self.entry_subdomain.configure(state="normal")

        if sincrono:
            matar()
            return

        # Bloqueia o restart ate a porta ser libertada (evita corrida no bind da 8080)
        self.btn_iniciar.configure(state="disabled")

        def _bg():
            matar()
            self.ui(self.btn_iniciar.configure, state="normal")
            self.ui(self.atualizar_status, motivo or "Ambiente parado.")

        t = threading.Thread(target=_bg, daemon=True)
        self._kill_threads = [x for x in self._kill_threads if x.is_alive()] + [t]
        t.start()

    def encerrar_aplicacao(self):
        self._closing = True
        if self.is_running:
            self.parar_ambiente(sincrono=True)
        for t in list(self._kill_threads):
            t.join(timeout=8)
        self.destroy()

    # ------------------------------------------------------------ workers
    def _liberar_porta(self, porta, stop):
        """Garante a porta livre antes de subir o dev_server.
        Retorna None se ok, ou a mensagem de erro (porta ocupada por outro programa)."""
        dono = pid_na_porta(porta)
        if not dono:
            return None
        if dono == os.getpid():
            return None

        cmd = cmdline_do_pid(dono)
        nome = nome_do_pid(dono)
        if "dev_server.py" in cmd:
            # Sobra de uma sessao anterior (painel antigo, crash): e nosso, pode encerrar.
            self.registrar_log(f"[PORTA] dev_server orfao (PID {dono}) na porta {porta}. A encerrar...")
            kill_pid(dono)
            for _ in range(10):
                if stop.is_set():
                    return None
                if not pid_na_porta(porta):
                    return None
                time.sleep(0.3)
            return f"Porta {porta} continua ocupada (PID {dono}) apos encerrar o dev_server orfao."

        self.registrar_log(f"[PORTA] Porta {porta} ocupada por {nome} (PID {dono}). Cmd: {cmd[:200]}")
        return f"Porta {porta} ocupada por {nome} (PID {dono}). Feche esse programa ou mude MN_PORT."

    def rotina_servidor_local(self, stop, porta):
        erro_porta = self._liberar_porta(porta, stop)
        if stop.is_set():
            return
        if erro_porta:
            self.registrar_log(f"[ERRO LOCAL] {erro_porta}")
            self.ui(self.parar_ambiente, _tok=stop, motivo=erro_porta)
            return

        script = BASE_DIR / "dev_server.py"
        try:
            proc = spawn([sys.executable, "-u", str(script)], BASE_DIR)
        except OSError as e:
            self.registrar_log(f"[ERRO LOCAL] {e}")
            self.ui(self.parar_ambiente, _tok=stop, motivo=f"Falha ao iniciar dev_server: {e}")
            return

        with self._lock:
            if stop.is_set():
                kill_tree(proc)
                return
            self.server_process = proc

        porta_falhou = False
        try:
            for linha in proc.stdout:
                texto = linha.strip()
                self.registrar_log(f"[LOCAL] {texto}")
                if "Nao foi possivel abrir a porta" in texto:
                    porta_falhou = True
                if "ativo em" in texto and "http://127.0.0.1:" in texto:
                    self.server_ready.set()
                    self.ui(self.lbl_status_local.configure, _tok=stop,
                            text=f"Servidor Local: 🟢 Online (Porta {porta})", text_color="#10b981")
        except Exception as e:
            self.registrar_log(f"[ERRO LOCAL] leitura do stdout: {e!r}")
        finally:
            try:
                if proc.stdout:
                    proc.stdout.close()
            except Exception:
                pass

        if not stop.is_set():
            try:
                codigo = proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                codigo = proc.poll()
            self.registrar_log(f"[ERRO LOCAL] dev_server fechou (codigo {codigo})")
            if porta_falhou:
                dono = pid_na_porta(porta)
                extra = f" por {nome_do_pid(dono)} (PID {dono})" if dono else ""
                motivo = f"Porta {porta} ocupada{extra}."
            else:
                motivo = f"dev_server fechou (codigo {codigo}). Veja o log."
            self.ui(self.parar_ambiente, _tok=stop, motivo=motivo)

    def rotina_tunel(self, stop, subdominio, porta):
        def ui(f, *a, **k):
            self.ui(f, *a, _tok=stop, **k)

        def abortar(msg):
            self.registrar_log(f"[ERRO] {msg}")
            self.ui(self.parar_ambiente, _tok=stop, motivo=msg)

        url_esperada = f"https://{subdominio}.loca.lt"

        # Prefere o 'lt' global (npm i -g localtunnel): inicia mais rapido que o npx.
        lt = shutil.which("lt")
        npx = shutil.which("npx")
        if lt:
            base_cmd = [lt]
        elif npx:
            base_cmd = [npx, "--yes", LT_PACOTE]
        else:
            return abortar("Node.js/npx nao encontrado no PATH.")
        cmd = base_cmd + ["--port", str(porta), "--subdomain", subdominio]

        limite = time.monotonic() + 30
        while not self.server_ready.wait(0.25):
            if stop.is_set():
                return
            if time.monotonic() > limite:
                return abortar("Servidor local nao respondeu a tempo.")
        if stop.is_set():
            return

        espera, tentativa, rejeicoes = 2, 0, 0
        while not stop.is_set():
            tentativa += 1
            if rejeicoes == 0:
                ui(self.atualizar_status, f"A negociar tunel... (tentativa {tentativa})")

            try:
                proc = spawn(cmd, BASE_DIR)
            except OSError as e:
                return abortar(f"Falha ao iniciar o tunel: {e}")

            with self._lock:
                if stop.is_set():
                    kill_tree(proc)
                    return
                self.tunnel_process = proc

            ok_desde = None
            rejeitada = False
            watchdog = threading.Timer(WATCHDOG_TUNEL_S, kill_tree, args=(proc,))
            watchdog.daemon = True
            watchdog.start()

            try:
                for linha in proc.stdout:
                    self.registrar_log(f"[TUNNEL] {linha.strip()}")
                    m = URL_RE.search(linha)
                    if not m:
                        continue
                    url = m.group(1).rstrip("/")

                    if url != url_esperada:
                        self.registrar_log(f"[GATEKEEPER] URL rejeitada: {url}")
                        rejeitada = True
                        break

                    if ok_desde is None:
                        ok_desde = time.monotonic()
                        watchdog.cancel()
                        self.current_url = url
                        rejeicoes = 0
                        ui(self.atualizar_status, "Ambiente 100% online.")
                        ui(self.lbl_status_tunnel.configure, text=f"Túnel Público: 🟢 {url}", text_color="#10b981")
                        ui(self.btn_link.configure, state="normal")
                        if TOPICO_NTFY:
                            ui(self.btn_notificar.configure, state="normal")
                            agora = time.monotonic()
                            if agora - self._ultima_notif > INTERVALO_NOTIF_S:
                                self._ultima_notif = agora
                                threading.Thread(target=self.worker_notificacao, args=(url, stop), daemon=True).start()
            except Exception as e:
                self.registrar_log(f"[ERRO TUNEL] {e!r}")
            finally:
                watchdog.cancel()
                kill_tree(proc)
                try:
                    if proc.stdout:
                        proc.stdout.close()
                except Exception:
                    pass

            if stop.is_set():
                return

            if ok_desde is not None:
                self.current_url = ""
                ui(self.lbl_status_tunnel.configure, text="Túnel Público: 🔴 Offline", text_color="#ef4444")
                ui(self.btn_link.configure, state="disabled")
                ui(self.btn_notificar.configure, state="disabled")
                self.registrar_log("[TUNNEL] Conexao caiu. A reconectar...")
                if time.monotonic() - ok_desde > 30:
                    espera = 2

            if rejeitada:
                # O subdominio ainda esta preso no servidor do localtunnel (sessao anterior).
                # Nao e falha de rede: tenta de novo rapido, sem backoff exponencial.
                rejeicoes += 1
                ui(self.atualizar_status,
                   f"Subdominio '{subdominio}' ocupado no servidor. A aguardar libertacao... ({rejeicoes})")
                stop.wait(INTERVALO_REJEICAO_S)
                continue

            rejeicoes = 0
            stop.wait(espera)
            espera = min(espera * 2, 60)

    # ---------------------------------------------------------------- git
    def _git_run(self, *args, timeout_s=60):
        return run_capture(
            ["git", *args], PROJECT_DIR,
            {"GIT_TERMINAL_PROMPT": "0", "GIT_CEILING_DIRECTORIES": str(PROJECT_DIR.parent)},
            timeout_s,
        )

    def _preparar_gitignore(self):
        """Garante que logs/.env/__pycache__ do novo layout server/ nao entram no add -A."""
        gi = PROJECT_DIR / ".gitignore"
        atual = gi.read_text(encoding="utf-8", errors="replace") if gi.exists() else ""
        existentes = {l.strip() for l in atual.splitlines()}
        faltam = [i for i in GITIGNORE_ITENS if i not in existentes]
        if faltam:
            prefixo = "" if (not atual or atual.endswith("\n")) else "\n"
            with open(gi, "a", encoding="utf-8", newline="\n") as f:
                f.write(prefixo + "\n".join(faltam) + "\n")
            self.registrar_log(f"[GIT] .gitignore atualizado com: {', '.join(faltam)}")
        # Remove do indice o que ja estiver rastreado por engano (nao apaga do disco)
        self._git_run("rm", "-r", "--cached", "--ignore-unmatch", "-q", "--", *GIT_UNTRACK)

    def iniciar_git(self):
        msg = self.entry_commit.get().strip()
        if not msg:
            self.atualizar_status("A mensagem de commit nao pode estar vazia.")
            return
        self.btn_git.configure(state="disabled")
        threading.Thread(target=self.worker_git, args=(msg,), daemon=True).start()

    def worker_git(self, msg):
        try:
            if not shutil.which("git"):
                raise RuntimeError("Git nao encontrado no PATH.")
            if not (PROJECT_DIR / ".git").exists():
                raise RuntimeError(f"Sem pasta .git em {PROJECT_DIR}")

            self._preparar_gitignore()

            tem_mudancas = bool(self._git_run("status", "--porcelain").stdout.strip())
            ahead = self._git_run("rev-list", "--count", "@{u}..HEAD")
            sem_upstream = ahead.returncode != 0
            a_enviar = sem_upstream or ahead.stdout.strip() not in ("", "0")

            if not tem_mudancas and not a_enviar:
                self.ui(self.atualizar_status, "Nada para submeter.")
                return

            etapas = []
            if tem_mudancas:
                etapas += [("add", ("add", "-A")), ("commit", ("commit", "-m", msg))]
            if sem_upstream:
                etapas.append(("push", ("push", "--set-upstream", "origin", "HEAD")))
            else:
                etapas.append(("push", ("push",)))

            for nome, args in etapas:
                self.ui(self.atualizar_status, f"Git {nome}...")
                res = self._git_run(*args, timeout_s=120 if nome == "push" else 60)
                self.registrar_log(f"[GIT {nome.upper()}] {res.stdout}{res.stderr}")
                if res.returncode != 0:
                    ultima = (res.stderr.strip().splitlines() or ["?"])[-1]
                    raise RuntimeError(f"git {nome}: {ultima}")

            self.ui(self.atualizar_status, "Commit e push concluidos.")
            self.ui(self.entry_commit.delete, 0, "end")
        except (RuntimeError, subprocess.TimeoutExpired, OSError) as e:
            self.registrar_log(f"[ERRO GIT] {e}")
            self.ui(self.atualizar_status, f"Falha no Git: {str(e)[:80]}")
        except Exception as e:
            self.registrar_log(f"[ERRO GIT INESPERADO] {e!r}")
            self.ui(self.atualizar_status, f"Erro inesperado no Git: {str(e)[:60]}")
        finally:
            self.ui(self.btn_git.configure, state="normal")

    # ------------------------------------------------------- notificacao
    def solicitar_notificacao(self):
        if not self.current_url or not TOPICO_NTFY:
            return
        threading.Thread(target=self.worker_notificacao, args=(self.current_url, None), daemon=True).start()

    def worker_notificacao(self, url, stop=None):
        if not TOPICO_NTFY:
            return
        self.ui(self.atualizar_status, "A enviar notificacao...", _tok=stop)
        try:
            req_ip = urllib.request.Request("https://api.ipify.org", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req_ip, timeout=5) as r:
                ip_publico = r.read().decode("utf-8").strip()

            dados = {
                "topic": TOPICO_NTFY,
                "title": "MindNote Online 🚀",
                "message": f"IP de liberacao: {ip_publico}",
                "tags": ["rocket", "link"],
                "priority": 4,
                "actions": [
                    {"action": "view", "label": "Abrir MindNote", "url": url, "clear": True},
                    {"action": "copy", "label": "Copiar IP", "value": ip_publico, "clear": True},
                ],
            }
            # Publicacao em JSON: POST na URL RAIZ, com o topico dentro do corpo
            req_push = urllib.request.Request(
                "https://ntfy.sh/", data=json.dumps(dados).encode("utf-8"),
                headers={"Content-Type": "application/json"}, method="POST",
            )
            with urllib.request.urlopen(req_push, timeout=5):
                pass
            self.registrar_log("[NTFY] Notificacao push enviada.")
            self.ui(self.atualizar_status, "Notificacao enviada!", _tok=stop)
        except Exception as e:
            self.registrar_log(f"[ERRO NTFY] {e!r}")
            self.ui(self.atualizar_status, "Falha ao enviar notificacao.", _tok=stop)

    # ---------------------------------------------------------- auxiliares
    def abrir_link(self):
        if self.current_url:
            webbrowser.open(self.current_url)

    def abrir_logs(self):
        caminho = str(LOG_DIR.resolve())
        if os.name == "nt":
            os.startfile(caminho)
        else:
            subprocess.Popen(["xdg-open", caminho])


if __name__ == "__main__":
    if not single_instance():
        aviso("O painel do MindNote ja esta aberto. Feche a outra janela antes de abrir uma nova.")
        sys.exit(0)
    app = PainelMindNote()
    app.mainloop()
