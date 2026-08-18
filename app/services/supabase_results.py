import os
import logging
from datetime import UTC, datetime

import httpx


logger = logging.getLogger(__name__)


class DatabaseConfigurationError(Exception):
    pass


class DatabaseUnavailableError(Exception):
    def __init__(self, reason: str = "unavailable") -> None:
        self.reason = reason
        super().__init__(reason)


class SupabaseResultsClient:
    def __init__(
        self,
        url: str,
        secret_key: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = f"{url.rstrip('/')}/rest/v1"
        self.secret_key = secret_key
        self.transport = transport

    @classmethod
    def from_environment(cls) -> "SupabaseResultsClient":
        url = (
            os.getenv("SUPABASE_URL", "").strip()
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
        )
        secret_key = (
            os.getenv("SUPABASE_SECRET_KEY", "").strip()
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            or os.getenv("sbkv", "").strip()
        )
        if not url or not secret_key:
            raise DatabaseConfigurationError("Supabase environment is incomplete")
        return cls(url, secret_key)

    def _headers(self) -> dict[str, str]:
        headers = {"apikey": self.secret_key, "Accept": "application/json"}
        if not self.secret_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.secret_key}"
        return headers

    async def _select(self, table: str, params: dict[str, str]) -> list[dict]:
        try:
            async with httpx.AsyncClient(
                headers=self._headers(),
                timeout=10.0,
                transport=self.transport,
            ) as client:
                response = await client.get(f"{self.base_url}/{table}", params=params)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            error_code = ""
            try:
                error_code = str(exc.response.json().get("code", ""))
            except (ValueError, AttributeError):
                pass
            logger.error(
                "Supabase query failed table=%s status=%s code=%s",
                table,
                status_code,
                error_code,
            )
            if status_code in {401, 403}:
                raise DatabaseUnavailableError("credentials") from exc
            if status_code == 404 or error_code in {"PGRST204", "PGRST205"}:
                raise DatabaseUnavailableError("schema") from exc
            raise DatabaseUnavailableError() from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.error("Supabase connection failed table=%s", table)
            raise DatabaseUnavailableError() from exc

        if not isinstance(data, list):
            raise DatabaseUnavailableError("Unexpected Supabase response")
        return data

    async def _upsert(
        self,
        table: str,
        rows: list[dict],
        conflict_columns: str,
        return_rows: bool = False,
    ) -> list[dict]:
        if not rows:
            return []

        headers = self._headers()
        return_mode = "representation" if return_rows else "minimal"
        headers["Prefer"] = f"resolution=merge-duplicates,return={return_mode}"
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=30.0,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    f"{self.base_url}/{table}",
                    params={"on_conflict": conflict_columns},
                    json=rows,
                )
                response.raise_for_status()
                if not return_rows:
                    return []
                data = response.json()
        except httpx.HTTPStatusError as exc:
            self._raise_database_error(table, exc)
        except (httpx.RequestError, ValueError) as exc:
            logger.error("Supabase connection failed table=%s", table)
            raise DatabaseUnavailableError() from exc

        if not isinstance(data, list):
            raise DatabaseUnavailableError("Unexpected Supabase response")
        return data

    async def _delete(self, table: str, params: dict[str, str]) -> None:
        headers = self._headers()
        headers["Prefer"] = "return=minimal"
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=30.0,
                transport=self.transport,
            ) as client:
                response = await client.delete(
                    f"{self.base_url}/{table}",
                    params=params,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._raise_database_error(table, exc)
        except httpx.RequestError as exc:
            logger.error("Supabase connection failed table=%s", table)
            raise DatabaseUnavailableError() from exc

    def _raise_database_error(
        self,
        table: str,
        exc: httpx.HTTPStatusError,
    ) -> None:
        status_code = exc.response.status_code
        error_code = ""
        try:
            error_code = str(exc.response.json().get("code", ""))
        except (ValueError, AttributeError):
            pass
        logger.error(
            "Supabase query failed table=%s status=%s code=%s",
            table,
            status_code,
            error_code,
        )
        if status_code in {401, 403}:
            raise DatabaseUnavailableError("credentials") from exc
        if status_code == 404 or error_code in {"PGRST204", "PGRST205"}:
            raise DatabaseUnavailableError("schema") from exc
        raise DatabaseUnavailableError() from exc

    async def import_records(
        self,
        filename: str,
        school_year: int,
        records: list[dict],
    ) -> dict:
        imported_at = datetime.now(UTC).isoformat()
        students = {
            record["ra"]: {"ra": record["ra"], "nome": record["nome_aluno"]}
            for record in records
        }
        enrollments = {
            record["ra"]: {
                "aluno_ra": record["ra"],
                "ano_letivo": school_year,
                "ano_escolar": record["ano_escolar"],
                "turma": record["turma"],
            }
            for record in records
        }
        await self._upsert("alunos", list(students.values()), "ra")
        await self._upsert(
            "matriculas",
            list(enrollments.values()),
            "aluno_ra,ano_letivo",
        )
        semesters = sorted({record["semestre"] for record in records})
        for semester in semesters:
            spreadsheet_rows = await self._upsert(
                "planilhas",
                [
                    {
                        "nome_arquivo": filename,
                        "ano_letivo": school_year,
                        "semestre": semester,
                        "bimestre": None,
                        "importado_em": imported_at,
                    }
                ],
                "nome_arquivo,ano_letivo,semestre",
                return_rows=True,
            )
            if not spreadsheet_rows:
                raise DatabaseUnavailableError()

            spreadsheet_id = spreadsheet_rows[0]["id"]
            semester_records = [
                record for record in records if record["semestre"] == semester
            ]
            results = [
                {
                    "planilha_id": spreadsheet_id,
                    "aluno_ra": record["ra"],
                    "ano_letivo": school_year,
                    "semestre": semester,
                    "bimestre": None,
                    "componente": record["componente"],
                    "proficiencia": record["proficiencia"],
                    "nivel": record["nivel"],
                    "atualizado_em": imported_at,
                }
                for record in semester_records
            ]

            await self._delete(
                "resultados",
                {
                    "ano_letivo": f"eq.{school_year}",
                    "semestre": f"eq.{semester}",
                },
            )
            for start in range(0, len(results), 500):
                await self._upsert(
                    "resultados",
                    results[start : start + 500],
                    "aluno_ra,ano_letivo,semestre,componente",
                )

        return {
            "count": len(records),
            "students": len(students),
            "semesters": semesters,
        }

    async def search_by_ra(self, ra: str) -> list[dict]:
        students = await self._select(
            "alunos",
            {"select": "ra,nome", "ra": f"eq.{ra}", "limit": "1"},
        )
        if not students:
            return []

        enrollments = await self._select(
            "matriculas",
            {
                "select": "ano_letivo,ano_escolar,turma",
                "aluno_ra": f"eq.{ra}",
                "order": "ano_letivo.desc",
                "limit": "1",
            },
        )
        if not enrollments:
            return []

        enrollment = enrollments[0]
        results = await self._select(
            "resultados",
            {
                "select": "ano_letivo,semestre,componente,proficiencia,nivel",
                "aluno_ra": f"eq.{ra}",
                "ano_letivo": f"eq.{enrollment['ano_letivo']}",
                "semestre": "not.is.null",
                "order": "semestre.asc,componente.asc",
            },
        )

        return [
            {
                "nome_aluno": students[0].get("nome", ""),
                "ano_escolar": enrollment.get("ano_escolar", ""),
                "turma": enrollment.get("turma", ""),
                "ra": ra,
                "componente": result.get("componente", ""),
                "proficiencia": result.get("proficiencia", ""),
                "nivel": result.get("nivel", ""),
                "semestre": result.get("semestre", ""),
            }
            for result in results
        ]
