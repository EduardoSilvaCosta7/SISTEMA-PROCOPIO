from pathlib import Path
import re

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from app.services.supabase_results import (
    DatabaseConfigurationError,
    DatabaseUnavailableError,
    SupabaseResultsClient,
)


APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"

app = FastAPI(
    title="Sistema de Resultados",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class StudentSearch(BaseModel):
    ra: str

    @field_validator("ra")
    @classmethod
    def validate_ra(cls, value: str) -> str:
        normalized = re.sub(r"[\s.\-]", "", value.strip())
        if not normalized.isdigit() or not 4 <= len(normalized) <= 20:
            raise ValueError("RA invalido")
        return normalized


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.post("/api/search")
async def search_student(search: StudentSearch) -> dict:
    try:
        records = await SupabaseResultsClient.from_environment().search_by_ra(search.ra)
    except DatabaseConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail="Banco de dados ainda não configurado no servidor.",
        ) from exc
    except DatabaseUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível consultar o banco de dados.",
        ) from exc

    return {"count": len(records), "records": records}


app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")
