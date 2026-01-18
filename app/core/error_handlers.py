"""FastAPI exception handlers for consistent error responses."""
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.exceptions import AppException
from app.schemas.errors import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)


async def app_exception_handler(
    request: Request,
    exc: AppException,
) -> JSONResponse:
    """Handle application-specific exceptions.

    Args:
        request: HTTP request
        exc: Application exception

    Returns:
        JSON error response with consistent format
    """
    request_id = str(uuid.uuid4())

    # Log the exception
    logger.warning(
        "Application exception occurred",
        extra={
            "request_id": request_id,
            "error_code": exc.error_code.value,
            "message": exc.message,
            "status_code": exc.status_code,
            "path": request.url.path,
            "method": request.method,
        },
    )

    # Build error details
    details = None
    if exc.details:
        details = [
            ErrorDetail(
                message=detail.get("message", ""),
                field=detail.get("field"),
                code=detail.get("code"),
            )
            for detail in exc.details
        ]

    # Build response
    error_response = ErrorResponse(
        error=exc.error_code.value,
        message=exc.message,
        details=details,
        request_id=request_id,
    )

    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump(exclude_none=True),
    )


async def validation_exception_handler(
    request: Request,
    exc: ValidationError,
) -> JSONResponse:
    """Handle Pydantic validation errors.

    Args:
        request: HTTP request
        exc: Validation error

    Returns:
        JSON error response
    """
    request_id = str(uuid.uuid4())

    logger.warning(
        "Validation error occurred",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "errors": exc.errors(),
        },
    )

    # Convert pydantic errors to our format
    details = [
        ErrorDetail(
            field=error.get("loc", (None,))[-1] if error.get("loc") else None,
            message=error.get("msg", "Invalid input"),
            code="VAL_3001",
        )
        for error in exc.errors()
    ]

    error_response = ErrorResponse(
        error="VAL_3001",
        message="Validation failed",
        details=details,
        request_id=request_id,
    )

    return JSONResponse(
        status_code=422,
        content=error_response.model_dump(exclude_none=True),
    )


async def generic_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Handle unexpected exceptions.

    Args:
        request: HTTP request
        exc: Exception

    Returns:
        JSON error response
    """
    request_id = str(uuid.uuid4())

    logger.error(
        "Unexpected exception occurred",
        exc_info=exc,
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "exception_type": type(exc).__name__,
        },
    )

    error_response = ErrorResponse(
        error="SRV_9001",
        message="An unexpected error occurred. Please try again later.",
        request_id=request_id,
    )

    return JSONResponse(
        status_code=500,
        content=error_response.model_dump(exclude_none=True),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with FastAPI app.

    Args:
        app: FastAPI application instance
    """
    app.add_exception_handler(
        AppException,  # type: ignore[arg-type]
        app_exception_handler,  # type: ignore[arg-type]
    )
    app.add_exception_handler(
        ValidationError,  # type: ignore[arg-type]
        validation_exception_handler,  # type: ignore[arg-type]
    )
    app.add_exception_handler(
        Exception,  # type: ignore[arg-type]
        generic_exception_handler,  # type: ignore[arg-type]
    )
