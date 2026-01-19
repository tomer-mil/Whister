# Whist Backend API

FastAPI backend for the Whist score-keeping platform.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Running

```bash
uvicorn app.main:app --reload
```

## Testing

```bash
python -m pytest tests/ -v
```

## Type Checking

```bash
python -m mypy app/
```

## Linting

```bash
python -m ruff check app/
```

## Database Migrations

```bash
alembic upgrade head
```

See the main [README.md](../README.md) for full documentation.
