import os

import httpx


class DatabaseConfigurationError(Exception):
    pass


class DatabaseUnavailableError(Exception):
    pass


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
        url = os.getenv("SUPABASE_URL", "").strip()
        secret_key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
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
        except (httpx.HTTPError, ValueError) as exc:
            raise DatabaseUnavailableError("Supabase request failed") from exc

        if not isinstance(data, list):
            raise DatabaseUnavailableError("Unexpected Supabase response")
        return data

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
                "select": "ano_letivo,bimestre,componente,proficiencia,nivel",
                "aluno_ra": f"eq.{ra}",
                "ano_letivo": f"eq.{enrollment['ano_letivo']}",
                "order": "bimestre.asc,componente.asc",
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
                "bimestre": result.get("bimestre", ""),
            }
            for result in results
        ]
