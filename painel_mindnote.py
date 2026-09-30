import os
import sys
import time
import json
import urllib.request
import subprocess
import threading
from datetime import datetime
import webbrowser
import customtkinter as ctk

# ─── CONFIGURAÇÕES GERAIS ────────────────────────────────────────────────────
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

PASTA_LOGS = "logs_servidor"
TOPICO_NTFY = "mindnote-edu-sync"
# ─────────────────────────────────────────────────────────────────────────────

class PainelMindNote(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("MindNote Engine - Painel de Controle Pro")
        self.geometry("450x620")
        self.resizable(False, False)

        # Variáveis de Estado
        self.is_running = False
        self.server_process = None
        self.tunnel_process = None
        self.log_file = None
        self.current_url = ""

        self.preparar_pasta_logs()
        self.construir_interface()

        # Garante encerramento limpo ao fechar a janela no 'X'
        self.protocol("WM_DELETE_WINDOW", self.encerrar_aplicacao)

    def preparar_pasta_logs(self):
        if not os.path.exists(PASTA_LOGS):
            os.makedirs(PASTA_LOGS)
        
        data_atual = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.arquivo_log_path = os.path.join(PASTA_LOGS, f"sessao_{data_atual}.log")
        self.registrar_log(f"--- Iniciando Sessão MindNote: {data_atual} ---")

    def registrar_log(self, mensagem):
        timestamp = datetime.now().strftime("%H:%M:%S")
        linha = f"[{timestamp}] {mensagem}"
        print(linha)
        try:
            with open(self.arquivo_log_path, "a", encoding="utf-8") as f:
                f.write(linha + "\n")
        except Exception:
            pass

    def atualizar_status(self, mensagem):
        self.after(0, lambda: self.status_bar.configure(text=f"Status: {mensagem}"))

    def construir_interface(self):
        # ─── Bloco 1: Controle do Servidor ───
        frame_server = ctk.CTkFrame(self)
        frame_server.pack(pady=10, padx=15, fill="x")

        ctk.CTkLabel(frame_server, text="Controle do Ambiente", font=("Segoe UI", 16, "bold")).pack(pady=(10, 5))

        # Subdomínio
        sub_frame = ctk.CTkFrame(frame_server, fg_color="transparent")
        sub_frame.pack(fill="x", padx=10, pady=5)
        ctk.CTkLabel(sub_frame, text="Subdomínio:").pack(side="left")
        self.entry_subdomain = ctk.CTkEntry(sub_frame, width=200)
        self.entry_subdomain.insert(0, "mindnote-edu")
        self.entry_subdomain.pack(side="right")

        # Status LEDs
        self.lbl_status_local = ctk.CTkLabel(frame_server, text="Servidor Local: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_local.pack()
        
        self.lbl_status_tunnel = ctk.CTkLabel(frame_server, text="Túnel Público: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_tunnel.pack()

        # Botões Core
        self.btn_iniciar = ctk.CTkButton(frame_server, text="▶ Iniciar Ambiente", command=self.toggle_ambiente, height=40)
        self.btn_iniciar.pack(pady=10, padx=10, fill="x")

        self.btn_link = ctk.CTkButton(frame_server, text="🔗 Abrir Link no Navegador", command=self.abrir_link, state="disabled", fg_color="#374151")
        self.btn_link.pack(pady=(0, 10), padx=10, fill="x")

        # ─── Bloco 2: Versionamento (Git) ───
        frame_git = ctk.CTkFrame(self)
        frame_git.pack(pady=10, padx=15, fill="x")

        ctk.CTkLabel(frame_git, text="Versionamento (Git)", font=("Segoe UI", 14, "bold")).pack(pady=(10, 5))
        
        self.entry_commit = ctk.CTkEntry(frame_git, placeholder_text="Mensagem do commit (Ex: Ajuste no SVG)")
        self.entry_commit.pack(pady=5, padx=10, fill="x")

        self.btn_git = ctk.CTkButton(frame_git, text="💾 Commit & Push", command=self.executar_git, fg_color="#059669", hover_color="#047857")
        self.btn_git.pack(pady=(5, 10), padx=10, fill="x")

        # ─── Bloco 3: Gestão ───
        frame_manage = ctk.CTkFrame(self)
        frame_manage.pack(pady=10, padx=15, fill="x")

        ctk.CTkButton(frame_manage, text="📂 Abrir Pasta de Logs", command=self.abrir_logs, fg_color="transparent", border_width=1).pack(pady=5, padx=10, fill="x")
        self.btn_notificar = ctk.CTkButton(frame_manage, text="📱 Reenviar Notificação", command=self.enviar_notificacao_tablet, state="disabled", fg_color="transparent", border_width=1)
        self.btn_notificar.pack(pady=(5, 10), padx=10, fill="x")

        # ─── Rodapé (Status Bar) ───
        self.status_bar = ctk.CTkLabel(self, text="Status: Aguardando comando...", anchor="w", fg_color="#1f2937", padx=10)
        self.status_bar.pack(side="bottom", fill="x")

    # ─── LÓGICA DE CONTROLE ──────────────────────────────────────────────────
    def toggle_ambiente(self):
        if not self.is_running:
            self.iniciar_ambiente()
        else:
            self.parar_ambiente()

    def iniciar_ambiente(self):
        self.is_running = True
        self.btn_iniciar.configure(text="⏹ Parar Servidor", fg_color="#ef4444", hover_color="#b91c1c")
        self.entry_subdomain.configure(state="disabled")
        
        # Inicia Threads
        threading.Thread(target=self.rotina_servidor_local, daemon=True).start()
        threading.Thread(target=self.rotina_tunel, daemon=True).start()

    def parar_ambiente(self):
        self.is_running = False
        self.atualizar_status("Encerrando processos...")
        self.registrar_log("Solicitação de encerramento enviada.")

        # Graceful Shutdown
        if self.tunnel_process:
            self.tunnel_process.kill()
        if self.server_process:
            self.server_process.kill()

        self.lbl_status_local.configure(text="Servidor Local: 🔴 Offline", text_color="#ef4444")
        self.lbl_status_tunnel.configure(text="Túnel Público: 🔴 Offline", text_color="#ef4444")
        
        self.btn_iniciar.configure(text="▶ Iniciar Ambiente", fg_color=["#3a7ebf", "#1f538d"], hover_color=["#325882", "#14375e"])
        self.btn_link.configure(state="disabled")
        self.btn_notificar.configure(state="disabled")
        self.entry_subdomain.configure(state="normal")
        self.atualizar_status("Ambiente offline.")

    def encerrar_aplicacao(self):
        if self.is_running:
            self.parar_ambiente()
        self.destroy()

    # ─── THREADS DE EXECUÇÃO ─────────────────────────────────────────────────
    def rotina_servidor_local(self):
        self.registrar_log("Iniciando dev_server.py...")
        try:
            self.server_process = subprocess.Popen(
                [sys.executable, "dev_server.py"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )
            self.after(0, lambda: self.lbl_status_local.configure(text="Servidor Local: 🟢 Online (Porta 8080)", text_color="#10b981"))
            
            for linha in self.server_process.stdout:
                self.registrar_log(f"[LOCAL] {linha.strip()}")
                
        except Exception as e:
            self.registrar_log(f"[ERRO LOCAL] {str(e)}")

    def rotina_tunel(self):
        subdominio_alvo = self.entry_subdomain.get().strip()
        url_esperada = f"https://{subdominio_alvo}.loca.lt"
        tentativa = 1

        while self.is_running:
            self.atualizar_status(f"Negociando túnel... (Tentativa {tentativa})")
            self.registrar_log(f"Solicitando subdomínio: {subdominio_alvo}")
            
            comando = f"npx localtunnel --port 8080 --subdomain {subdominio_alvo}"
            self.tunnel_process = subprocess.Popen(
                comando,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                shell=True
            )

            sucesso_url = False

            for linha in self.tunnel_process.stdout:
                texto = linha.strip()
                self.registrar_log(f"[TUNNEL] {texto}")

                # Validação Estrita (O Gatekeeper)
                if "your url is:" in texto:
                    url_recebida = texto.split("is:")[1].strip()
                    
                    if url_recebida == url_esperada:
                        sucesso_url = True
                        self.current_url = url_recebida
                        self.registrar_log("Túnel fixado com sucesso.")
                        
                        # Atualiza UI
                        self.after(0, lambda: self.lbl_status_tunnel.configure(text=f"Túnel Público: 🟢 {url_recebida}", text_color="#10b981"))
                        self.after(0, lambda: self.btn_link.configure(state="normal"))
                        self.after(0, lambda: self.btn_notificar.configure(state="normal"))
                        self.atualizar_status("Ambiente 100% Online.")
                        
                        self.enviar_notificacao_tablet()
                    else:
                        self.registrar_log(f"[GATEKEEPER] URL incorreta rejeitada: {url_recebida}")
                        self.tunnel_process.kill() # Mata o zumbi
                        break # Sai do laco for para tentar novamente

            # Se o processo morreu ou foi morto e o ambiente ainda deve rodar, tenta de novo
            if self.is_running and not sucesso_url:
                self.registrar_log("Aguardando 2s antes de tentar novamente para liberação no servidor remoto...")
                time.sleep(2)
                tentativa += 1
            else:
                break # Sai do while se o usuário mandou parar ou se estabilizou e a leitura bloqueou (normal)

    # ─── FUNÇÕES AUXILIARES ──────────────────────────────────────────────────
    def abrir_link(self):
        if self.current_url:
            webbrowser.open(self.current_url)

    def abrir_logs(self):
        caminho_absoluto = os.path.abspath(PASTA_LOGS)
        os.startfile(caminho_absoluto)

    def obter_ip_publico(self):
        try:
            req = urllib.request.Request('https://api.ipify.org', headers={'User-Agent': 'Mozilla/5.0'})
            return urllib.request.urlopen(req, timeout=5).read().decode('utf8').strip()
        except Exception:
            return "IP Indisponível"

    def enviar_notificacao_tablet(self):
        if not self.current_url:
            return
            
        ip_publico = self.obter_ip_publico()
        self.atualizar_status("Enviando notificação para o tablet...")
        
        try:
            dados = {
                "topic": TOPICO_NTFY,
                "title": "MindNote Online 🚀",
                "message": f"IP de Liberação: {ip_publico}",
                "tags": ["rocket", "link"],
                "priority": 4,
                "actions": [
                    {"action": "view", "label": "Abrir MindNote", "url": self.current_url, "clear": True},
                    {"action": "copy", "label": "Copiar IP", "content": ip_publico, "clear": True}
                ]
            }
            req = urllib.request.Request(f"https://ntfy.sh/{TOPICO_NTFY}", data=json.dumps(dados).encode("utf-8"), headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5)
            self.registrar_log("Notificação push enviada ao tablet.")
            self.atualizar_status("Notificação enviada!")
        except Exception as e:
            self.registrar_log(f"Falha ao enviar push: {e}")
            self.atualizar_status("Falha ao notificar tablet.")

    # ─── GIT ─────────────────────────────────────────────────────────────────
    def executar_git(self):
        msg = self.entry_commit.get().strip()
        if not msg:
            self.atualizar_status("Erro: A mensagem de commit não pode estar vazia.")
            return

        self.btn_git.configure(state="disabled")
        threading.Thread(target=self.rotina_git, args=(msg,), daemon=True).start()

    def rotina_git(self, msg):
        self.atualizar_status("Executando Git Add e Commit...")
        self.registrar_log(f"Iniciando Git Commit: '{msg}'")

        try:
            # Git Add
            subprocess.run(["git", "add", "."], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            
            # Git Commit
            result_commit = subprocess.run(["git", "commit", "-m", msg], capture_output=True, text=True)
            self.registrar_log(result_commit.stdout)

            # Git Push
            self.atualizar_status("Executando Git Push...")
            result_push = subprocess.run(["git", "push"], capture_output=True, text=True)
            self.registrar_log(result_push.stdout)
            if result_push.stderr:
                self.registrar_log(result_push.stderr)

            self.atualizar_status("Commit e Push concluídos com sucesso!")
            self.after(0, lambda: self.entry_commit.delete(0, 'end'))
        except subprocess.CalledProcessError as e:
            self.registrar_log(f"Erro no Git: {e.output if hasattr(e, 'output') else str(e)}")
            self.atualizar_status("Falha na operação Git. Verifique os logs.")
        finally:
            self.after(0, lambda: self.btn_git.configure(state="normal"))

if __name__ == "__main__":
    app = PainelMindNote()
    app.mainloop()
