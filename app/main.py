from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.services.spreadsheet import (
    ALLOWED_EXTENSIONS,
    SpreadsheetReadError,
    convert_spreadsheet,
)


APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
MAX_UPLOAD_SIZE = 20 * 1024 * 1024

app = FastAPI(
    title="Sistema de Resultados",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.post("/api/convert")
async def convert_uploaded_spreadsheet(file: UploadFile = File(...)) -> dict:
    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Envie uma planilha nos formatos .xlsx ou .xlsm.",
        )

    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="A planilha deve ter no maximo 20 MB.",
        )
    if not contents.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="O arquivo Excel e invalido.")

    try:
        records = convert_spreadsheet(contents, filename)
    except SpreadsheetReadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"count": len(records), "records": records}


app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")
