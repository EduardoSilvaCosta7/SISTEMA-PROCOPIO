from io import BytesIO
import re
import unicodedata

import pandas as pd


ALLOWED_EXTENSIONS = {".xlsx", ".xlsm"}

REQUIRED_COLUMNS = {
    "nomealuno": "nome_aluno",
    "anoescola": "ano_escolar",
    "turma": "turma",
    "alunora": "ra",
    "componente": "componente",
    "proficiencia": "proficiencia",
    "nivel": "nivel",
}


class SpreadsheetReadError(Exception):
    pass


def normalize_column_name(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value).strip())
    without_accents = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    return "".join(char.lower() for char in without_accents if char.isalnum())


def normalize_ra(value: object) -> str:
    return re.sub(r"\.0+$", "", str(value or "").strip())


def get_bimester_from_filename(filename: str) -> str:
    match = re.search(r"([1-4])\s*_?\s*bimestre", filename, flags=re.IGNORECASE)
    return match.group(1) if match else "1"


def convert_spreadsheet(contents: bytes, filename: str) -> list[dict]:
    try:
        dataframe = pd.read_excel(
            BytesIO(contents),
            engine="openpyxl",
            keep_default_na=False,
        )
    except Exception as exc:
        raise SpreadsheetReadError("Nao foi possivel ler a planilha enviada.") from exc

    dataframe.columns = [str(column).strip() for column in dataframe.columns]
    columns_by_key = {
        normalize_column_name(column): column for column in dataframe.columns
    }
    missing = [key for key in REQUIRED_COLUMNS if key not in columns_by_key]
    if missing:
        raise SpreadsheetReadError(
            f"Colunas obrigatorias ausentes: {', '.join(missing)}."
        )

    selected = dataframe[
        [columns_by_key[key] for key in REQUIRED_COLUMNS]
    ].rename(
        columns={
            columns_by_key[key]: output_name
            for key, output_name in REQUIRED_COLUMNS.items()
        }
    )
    selected = selected.fillna("").astype(str)
    selected = selected.replace({"nan": "", "NaT": "", "<NA>": ""})
    selected["ra"] = selected["ra"].map(normalize_ra)
    selected["bimestre"] = get_bimester_from_filename(filename)
    return selected.to_dict(orient="records")
