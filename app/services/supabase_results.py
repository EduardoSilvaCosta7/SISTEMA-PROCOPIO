import os
import logging
import re

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
    ) -> None:
        if not rows:
            return

        headers = self._headers()
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
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
        except httpx.HTTPStatusError as exc:
            self._raise_database_error(table, exc)
        except (httpx.RequestError, ValueError) as exc:
            logger.error("Supabase connection failed table=%s", table)
            raise DatabaseUnavailableError() from exc

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
        school_year: int,
        records: list[dict],
    ) -> dict:
        students = {
            record["ra"]: {"ra": record["ra"], "nome": record["nome_aluno"]}
            for record in records
        }
        enrollments = {
            record["ra"]: {
                "aluno_ra": record["ra"],
                "ano_letivo": school_year,
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
        bimesters = sorted({record["bimestre"] for record in records})
        for bimester in bimesters:
            bimester_records = [
                record for record in records if record["bimestre"] == bimester
            ]
            results = [
                {
                    "aluno_ra": record["ra"],
                    "ano_letivo": school_year,
                    "bimestre": bimester,
                    "componente": record["componente"],
                    "proficiencia": record["proficiencia"],
                    "nivel": record["nivel"],
                }
                for record in bimester_records
            ]

            await self._delete(
                "resultados",
                {
                    "ano_letivo": f"eq.{school_year}",
                    "bimestre": f"eq.{bimester}",
                },
            )
            for start in range(0, len(results), 500):
                await self._upsert(
                    "resultados",
                    results[start : start + 500],
                    "aluno_ra,ano_letivo,bimestre,componente",
                )

        return {
            "count": len(records),
            "students": len(students),
            "bimesters": bimesters,
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
                "select": "ano_letivo,turma",
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
                "select": "ano_letivo,bimestre,componente,proficiencia,nivel",
                "aluno_ra": f"eq.{ra}",
                "ano_letivo": f"eq.{enrollment['ano_letivo']}",
                "order": "bimestre.asc,componente.asc",
            },
        )

        return [
            {
                "nome_aluno": students[0].get("nome", ""),
                "turma": enrollment.get("turma", ""),
                "ra": ra,
                "componente": result.get("componente", ""),
                "proficiencia": result.get("proficiencia", ""),
                "nivel": result.get("nivel", ""),
                "bimestre": result.get("bimestre", ""),
            }
            for result in results
        ]

    async def search_by_class(self, school_class: str, school_year: int) -> list[dict]:
        enrollments = await self._select(
            "matriculas",
            {
                "select": "aluno_ra,turma",
                "ano_letivo": f"eq.{school_year}",
                "turma": f"ilike.{school_class}",
                "order": "aluno_ra.asc",
            },
        )
        if not enrollments:
            return []

        enrollment_by_ra = {
            str(enrollment.get("aluno_ra", "")): enrollment
            for enrollment in enrollments
            if enrollment.get("aluno_ra")
        }
        ra_filter = ",".join(enrollment_by_ra)
        students = await self._select(
            "alunos",
            {
                "select": "ra,nome",
                "ra": f"in.({ra_filter})",
                "order": "nome.asc",
            },
        )

        return [
            {
                "nome_aluno": student.get("nome", ""),
                "turma": enrollment_by_ra[str(student.get("ra", ""))].get(
                    "turma", ""
                ),
                "ra": str(student.get("ra", "")),
            }
            for student in students
            if str(student.get("ra", "")) in enrollment_by_ra
        ]

    async def list_classes(self, school_year: int) -> list[str]:
        enrollments = await self._select(
            "matriculas",
            {
                "select": "turma",
                "ano_letivo": f"eq.{school_year}",
                "order": "turma.asc",
            },
        )
        classes = {
            str(enrollment.get("turma", "")).strip()
            for enrollment in enrollments
            if str(enrollment.get("turma", "")).strip()
        }

        def natural_key(value: str) -> list[object]:
            return [
                int(part) if part.isdigit() else part.casefold()
                for part in re.split(r"(\d+)", value)
            ]

        return sorted(classes, key=natural_key)

    async def reports_by_class(
        self,
        school_class: str,
        school_year: int,
    ) -> list[dict]:
        students = await self.search_by_class(school_class, school_year)
        if not students:
            return []

        student_by_ra = {student["ra"]: student for student in students}
        ra_filter = ",".join(student_by_ra)
        results = await self._select(
            "resultados",
            {
                "select": "aluno_ra,ano_letivo,bimestre,componente,proficiencia,nivel",
                "aluno_ra": f"in.({ra_filter})",
                "ano_letivo": f"eq.{school_year}",
                "order": "aluno_ra.asc,bimestre.asc,componente.asc",
            },
        )

        records_by_ra: dict[str, list[dict]] = {
            ra: [] for ra in student_by_ra
        }
        for result in results:
            ra = str(result.get("aluno_ra", ""))
            student = student_by_ra.get(ra)
            if not student:
                continue
            records_by_ra[ra].append(
                {
                    **student,
                    "componente": result.get("componente", ""),
                    "proficiencia": result.get("proficiencia", ""),
                    "nivel": result.get("nivel", ""),
                    "bimestre": result.get("bimestre", ""),
                }
            )

        return [
            {**student, "records": records_by_ra[student["ra"]]}
            for student in students
        ]
