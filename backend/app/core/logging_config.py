"""Application logging configuration.

The app never configured logging at all. Uvicorn only configures its own
`uvicorn.*` loggers, so every `app.*` logger propagated to an unconfigured root
sitting at WARNING -- which meant every `logger.info(...)` in the codebase was
discarded, and WARNING/ERROR fell through to `logging.lastResort` with no
timestamp, no logger name, and crucially no `extra` fields. The request_id
returned to a player in an error body appeared in no log anywhere.

Call sites throughout the app already pass structured `extra=` dicts, so the
formatter below renders them rather than throwing them away.
"""
import logging
import logging.config
from typing import Any

# Attributes that exist on every LogRecord. Anything outside this set arrived
# via `extra=` and is worth printing.
_RESERVED: frozenset[str] = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"asctime", "message", "taskName"}


class ExtraFormatter(logging.Formatter):
    """Standard formatting, plus any `extra=` fields appended as key=value."""

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED
        }
        if extras:
            rendered = " ".join(f"{k}={v!r}" for k, v in sorted(extras.items()))
            base = f"{base} | {rendered}"
        return base


def build_logging_config(level: str) -> dict[str, Any]:
    """Build the dictConfig payload. Split out so tests can assert on it."""
    return {
        "version": 1,
        # Uvicorn configures its loggers before this runs; leave them alive.
        "disable_existing_loggers": False,
        "formatters": {
            "app": {
                "()": ExtraFormatter,
                "format": "%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S%z",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "app",
            },
        },
        "root": {"level": level, "handlers": ["console"]},
        "loggers": {
            # Own uvicorn's output too, so one format covers the whole log.
            "uvicorn": {"level": level, "handlers": ["console"], "propagate": False},
            "uvicorn.error": {"level": level, "handlers": ["console"], "propagate": False},
            "uvicorn.access": {"level": level, "handlers": ["console"], "propagate": False},
        },
    }


def configure_logging(level: str = "INFO") -> None:
    """Install the application logging configuration."""
    logging.config.dictConfig(build_logging_config(level))
