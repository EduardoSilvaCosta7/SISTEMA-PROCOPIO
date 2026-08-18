from pathlib import Path
import os
import re

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from app.services.supabase_results import (
    DatabaseConfigurationError,
    DatabaseUnavailableError,
    SupabaseResultsClient,
)
from app.services.spreadsheet import (
    ALLOWED_EXTENSIONS,
    SpreadsheetReadError,
    read_spreadsheet,
)


APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
MAX_UPLOAD_SIZE = 4 * 1024 * 1024

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
        messages = {
            "credentials": "As credenciais do Supabase foram recusadas.",
            "schema": "As tabelas necessárias não foram encontradas no Supabase.",
        }
        raise HTTPException(
            status_code=503,
            detail=messages.get(
                exc.reason,
                "Não foi possível consultar o banco de dados.",
            ),
        ) from exc

    return {"count": len(records), "records": records}


@app.post("/api/import")
async def import_spreadsheet(
    file: UploadFile = File(...),
) -> dict:
    filename = Path(file.filename or "").name
    if Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Envie uma planilha .xlsx ou .xlsm.",
        )

    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Na Vercel, a planilha deve ter no máximo 4 MB.",
        )
    if not contents.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="O arquivo Excel é inválido.")

    try:
        records = read_spreadsheet(contents)
        school_year = int(os.getenv("SCHOOL_YEAR", "2026"))
        result = await SupabaseResultsClient.from_environment().import_records(
            filename=filename,
            school_year=school_year,
            records=records,
        )
    except SpreadsheetReadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DatabaseConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail="Banco de dados ainda não configurado no servidor.",
        ) from exc
    except DatabaseUnavailableError as exc:
        messages = {
            "credentials": "As credenciais do Supabase foram recusadas.",
            "schema": "As tabelas necessárias não foram encontradas no Supabase.",
        }
        raise HTTPException(
            status_code=503,
            detail=messages.get(exc.reason, "Não foi possível gravar no banco de dados."),
        ) from exc

    return result


app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")
