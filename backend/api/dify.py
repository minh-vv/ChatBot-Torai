"""
Django imports `api.dify` from here.

- Docker: docker-compose mounts the repository root `dify.py` over this file.
- Local (no mount): load the same module from the project root so one file stays canonical.
"""
import importlib.util
from pathlib import Path

_ROOT_DIFY = Path(__file__).resolve().parent.parent.parent / "dify.py"
_spec = importlib.util.spec_from_file_location("dify_project_root", _ROOT_DIFY)
if _spec is None or _spec.loader is None:
    raise ImportError(f"Cannot load root dify module from {_ROOT_DIFY}")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

for _name in dir(_mod):
    if _name.startswith("_"):
        continue
    globals()[_name] = getattr(_mod, _name)

del _name, _mod, _spec, _ROOT_DIFY, importlib, Path
