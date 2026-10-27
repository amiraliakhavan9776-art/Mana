"""Read-only local training preflight; no installation or inference calls."""
import json
import os
import platform
import shutil
import subprocess

gpu = None
if shutil.which('nvidia-smi'):
    try:
        result = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'], capture_output=True, text=True, timeout=5)
        gpu = result.stdout.strip() if result.returncode == 0 else 'query_failed'
    except (OSError, subprocess.TimeoutExpired):
        gpu = 'query_failed'
memory = None
try:
    memory = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
except (ValueError, OSError):
    pass
print(json.dumps({'python': platform.python_version(), 'architecture': platform.machine(), 'cpu_logical': os.cpu_count(), 'ram_bytes': memory, 'nvidia_gpu': gpu, 'numpy_installed': __import__('importlib.util', fromlist=['find_spec']).find_spec('numpy') is not None}, indent=2))
