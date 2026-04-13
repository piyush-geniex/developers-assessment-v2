# WorkLog settlement API

FastAPI service for the backend assessment. Run via `docker compose up` from the repository root.

## Local tests

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest tests/ -q
```

Use **one Python binary** for creating the venv and running `pytest`. If you see `pydantic_core` failing to load with **incompatible architecture (have 'arm64', need 'x86_64')** (or the reverse), your interpreter architecture does not match the compiled wheels in `.venv`. Fix: `rm -rf .venv`, then recreate the venv with the Python you actually use (on Apple Silicon, prefer a native **arm64** Python from Homebrew, e.g. `/opt/homebrew/bin/python3.12`, not an x86_64/Rosetta `python3`).
