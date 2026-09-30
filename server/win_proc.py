import os
import subprocess
import ctypes
from ctypes import wintypes as wt

NO_WINDOW = 0x08000000
NEW_GROUP = 0x00000200

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
        ("SchedulingClass", wt.DWORD)
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
        ("PeakJobMemoryUsed", ctypes.c_size_t)
    ]

def bind_children_to_self():
    """Amarra os processos filhos ao ciclo de vida do painel."""
    if os.name != 'nt':
        return None

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.restype = wt.HANDLE
    kernel32.GetCurrentProcess.restype = wt.HANDLE
    kernel32.AssignProcessToJobObject.argtypes = [wt.HANDLE, wt.HANDLE]
    kernel32.SetInformationJobObject.argtypes = [wt.HANDLE, ctypes.c_int, ctypes.c_void_p, wt.DWORD]
    
    job = kernel32.CreateJobObjectW(None, None)
    info = _Ext()
    info.Basic.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    
    kernel32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))
    kernel32.AssignProcessToJobObject(job, kernel32.GetCurrentProcess())
    
    return job

def kill_tree(proc):
    """Encerra a árvore de processos a partir do PID pai."""
    if proc is None or proc.poll() is not None:
        return

    if os.name == 'nt':
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            capture_output=True, 
            creationflags=NO_WINDOW
        )
    
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()

def spawn(args, cwd):
    """Inicia um subprocesso isolado com codificação UTF-8 forçada."""
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    
    creationflags = 0
    if os.name == 'nt':
        creationflags = NO_WINDOW | NEW_GROUP

    return subprocess.Popen(
        args, 
        cwd=cwd, 
        env=env,
        stdin=subprocess.DEVNULL, 
        stdout=subprocess.PIPE, 
        stderr=subprocess.STDOUT,
        text=True, 
        encoding="utf-8", 
        errors="replace",
        creationflags=creationflags
    )