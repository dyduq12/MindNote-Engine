import os
import subprocess
import ctypes
from ctypes import wintypes as wt

NO_WINDOW = 0x08000000
NEW_GROUP = 0x00000200
ERROR_ALREADY_EXISTS = 183

_mutex_handle = None  # mantem o mutex vivo enquanto o processo existir


class _Basic(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", wt.DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", wt.DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", wt.DWORD),
        ("SchedulingClass", wt.DWORD),
    ]


class _Io(ctypes.Structure):
    _fields_ = [(n, ctypes.c_uint64) for n in "abcdef"]


class _Ext(ctypes.Structure):
    _fields_ = [
        ("Basic", _Basic),
        ("Io", _Io),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


def bind_children_to_self():
    """Coloca o processo atual num Job Object com KILL_ON_JOB_CLOSE.

    Todo filho criado depois herda o job. Se o painel morrer (crash, Gestor de
    Tarefas), o Windows fecha o handle e mata a arvore inteira.
    Levanta OSError se qualquer etapa falhar.
    """
    if os.name != "nt":
        return None

    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateJobObjectW.argtypes = [wt.LPVOID, wt.LPCWSTR]
    k.CreateJobObjectW.restype = wt.HANDLE
    k.GetCurrentProcess.restype = wt.HANDLE
    k.SetInformationJobObject.argtypes = [wt.HANDLE, ctypes.c_int, ctypes.c_void_p, wt.DWORD]
    k.SetInformationJobObject.restype = wt.BOOL
    k.AssignProcessToJobObject.argtypes = [wt.HANDLE, wt.HANDLE]
    k.AssignProcessToJobObject.restype = wt.BOOL
    k.CloseHandle.argtypes = [wt.HANDLE]

    job = k.CreateJobObjectW(None, None)
    if not job:
        raise ctypes.WinError(ctypes.get_last_error())

    info = _Ext()
    info.Basic.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not k.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):
        err = ctypes.get_last_error()
        k.CloseHandle(job)
        raise ctypes.WinError(err)

    if not k.AssignProcessToJobObject(job, k.GetCurrentProcess()):
        err = ctypes.get_last_error()
        k.CloseHandle(job)
        raise ctypes.WinError(err)

    return job  # NAO fechar: o handle vivo e o que mantem a protecao


def single_instance(nome="Local\\MindNoteEnginePainel"):
    """True se esta e a unica instancia do painel; False se ja existe outra aberta."""
    global _mutex_handle
    if os.name != "nt":
        return True
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateMutexW.argtypes = [wt.LPVOID, wt.BOOL, wt.LPCWSTR]
    k.CreateMutexW.restype = wt.HANDLE
    ctypes.set_last_error(0)
    _mutex_handle = k.CreateMutexW(None, False, nome)
    return ctypes.get_last_error() != ERROR_ALREADY_EXISTS


def aviso(mensagem, titulo="MindNote Engine"):
    """Caixa de mensagem nativa (funciona mesmo sem console, ex.: pythonw)."""
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(0, mensagem, titulo, 0x30)
    else:
        print(f"{titulo}: {mensagem}")


def kill_tree(proc):
    """Encerra a arvore de processos a partir do PID pai."""
    if proc is None or proc.poll() is not None:
        return
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True, creationflags=NO_WINDOW, timeout=10,
            )
        except (subprocess.TimeoutExpired, OSError):
            pass
    else:
        proc.kill()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()


def spawn(args, cwd):
    """Inicia um subprocesso com stdout+stderr combinados e UTF-8 forcado."""
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    creationflags = (NO_WINDOW | NEW_GROUP) if os.name == "nt" else 0
    return subprocess.Popen(
        args, cwd=cwd, env=env,
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
        creationflags=creationflags,
    )


def run_capture(args, cwd=None, env_extra=None, timeout=60):
    """Como subprocess.run(capture_output=True), mas no timeout mata a ARVORE.

    Evita o hang classico em que netos (ssh, git-remote-https) seguram o pipe
    aberto e o communicate() nunca retorna.
    """
    env = {**os.environ, **(env_extra or {})}
    p = subprocess.Popen(
        args, cwd=cwd, env=env,
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
        creationflags=NO_WINDOW if os.name == "nt" else 0,
    )
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_tree(p)
        try:
            p.communicate(timeout=5)
        except Exception:
            pass
        raise
    return subprocess.CompletedProcess(args, p.returncode, out, err)


# ------------------------------------------------------------ diagnostico de porta
def pid_na_porta(porta):
    """PID que esta em LISTEN na porta TCP (ou None). Independe do idioma do Windows:
    um socket em escuta tem endereco remoto terminado em ':0'."""
    if os.name != "nt":
        return None
    try:
        r = run_capture(["netstat", "-ano", "-p", "TCP"], timeout=10)
    except Exception:
        return None
    alvo = f":{porta}"
    for linha in r.stdout.splitlines():
        p = linha.split()
        if len(p) >= 5 and p[0].upper() == "TCP" and p[1].endswith(alvo) and p[2].endswith(":0"):
            try:
                return int(p[4])
            except ValueError:
                continue
    return None


def cmdline_do_pid(pid):
    """Linha de comando do processo (vazia se nao for possivel obter)."""
    if os.name != "nt":
        return ""
    try:
        r = run_capture(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             f"(Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}').CommandLine"],
            timeout=15,
        )
        return r.stdout.strip()
    except Exception:
        return ""


def nome_do_pid(pid):
    """Nome do executavel (ex.: python.exe) ou '?'."""
    if os.name != "nt":
        return "?"
    try:
        r = run_capture(["tasklist", "/FI", f"PID eq {int(pid)}", "/FO", "CSV", "/NH"], timeout=10)
        linha = r.stdout.strip().splitlines()[0] if r.stdout.strip() else ""
        return linha.split('","')[0].strip('"') or "?"
    except Exception:
        return "?"


def kill_pid(pid):
    """Mata um PID e sua arvore (taskkill /T /F)."""
    if os.name != "nt":
        return
    try:
        run_capture(["taskkill", "/PID", str(int(pid)), "/T", "/F"], timeout=10)
    except Exception:
        pass
