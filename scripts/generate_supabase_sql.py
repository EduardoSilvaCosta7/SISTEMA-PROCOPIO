import argparse
from pathlib import Path
import re
import unicodedata

import pandas as pd


REQUIRED_COLUMNS = {
    "nomealuno": "nome_aluno",
    "anoescola": "ano_escolar",
    "turma": "turma",
    "alunora": "ra",
    "componente": "componente",
    "proficiencia": "proficiencia",
    "nivel": "nivel",
}


def normalize_column_name(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value).strip())
    without_accents = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    return "".join(char.lower() for char in without_accents if char.isalnum())


def sql_text(value: object) -> str:
    text = str(value or "").strip().replace("'", "''")
    return f"'{text}'"


def normalize_ra(value: object) -> str:
    text = str(value or "").strip()
    return re.sub(r"\.0+$", "", text)


def sql_decimal(value: object) -> str:
    text = str(value or "").strip().replace(",", ".")
    if not text:
        return "null"
    try:
        return f"{float(text):.2f}"
    except ValueError:
        return "null"


def get_bimester(filename: str) -> int:
    match = re.search(r"([1-4])\s*_?\s*bimestre", filename, flags=re.IGNORECASE)
    return int(match.group(1)) if match else 1


def read_records(source: Path) -> pd.DataFrame:
    dataframe = pd.read_excel(source, engine="openpyxl", keep_default_na=False)
    columns_by_key = {
        normalize_column_name(column): column for column in dataframe.columns
    }
    missing = [key for key in REQUIRED_COLUMNS if key not in columns_by_key]
    if missing:
        raise ValueError(f"Colunas obrigatorias ausentes: {', '.join(missing)}")

    selected = dataframe[
        [columns_by_key[key] for key in REQUIRED_COLUMNS]
    ].rename(
        columns={
            columns_by_key[key]: output_name
            for key, output_name in REQUIRED_COLUMNS.items()
        }
    )
    selected = selected.fillna("").astype(str)
    selected["ra"] = selected["ra"].map(normalize_ra)
    return selected[selected["ra"] != ""].copy()


def values_block(rows: list[str]) -> str:
    return ",\n".join(f"  ({row})" for row in rows)


def build_sql(source: Path, year: int) -> str:
    records = read_records(source)
    bimester = get_bimester(source.name)

    students = (
        records[["ra", "nome_aluno"]]
        .drop_duplicates(subset=["ra"], keep="last")
        .sort_values("ra")
    )
    enrollments = (
        records[["ra", "ano_escolar", "turma"]]
        .drop_duplicates(subset=["ra"], keep="last")
        .sort_values("ra")
    )

    student_rows = [
        f"{sql_text(row.ra)}, {sql_text(row.nome_aluno)}"
        for row in students.itertuples(index=False)
    ]
    enrollment_rows = [
        f"{sql_text(row.ra)}, {year}, {sql_text(row.ano_escolar)}, {sql_text(row.turma)}"
        for row in enrollments.itertuples(index=False)
    ]
    result_rows = [
        ", ".join(
            [
                sql_text(row.ra),
                str(year),
                str(bimester),
                sql_text(row.componente),
                sql_decimal(row.proficiencia),
                sql_text(row.nivel),
            ]
        )
        for row in records.itertuples(index=False)
    ]

    filename = sql_text(source.name)
    return f"""-- Banco de dados de resultados escolares para Supabase/PostgreSQL.
-- Fonte: {source.name}
-- Alunos: {len(students)} | Resultados: {len(records)}

begin;

create table if not exists public.planilhas (
  id bigint generated always as identity primary key,
  nome_arquivo text not null,
  ano_letivo smallint not null check (ano_letivo between 2000 and 2100),
  bimestre smallint not null check (bimestre between 1 and 4),
  importado_em timestamptz not null default now(),
  constraint planilhas_arquivo_ano_bimestre_key unique (nome_arquivo, ano_letivo, bimestre)
);

create table if not exists public.alunos (
  ra text primary key,
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.matriculas (
  id bigint generated always as identity primary key,
  aluno_ra text not null references public.alunos(ra) on update cascade on delete cascade,
  ano_letivo smallint not null check (ano_letivo between 2000 and 2100),
  ano_escolar text not null default '',
  turma text not null default '',
  constraint matriculas_aluno_ano_key unique (aluno_ra, ano_letivo)
);

create table if not exists public.resultados (
  id bigint generated always as identity primary key,
  planilha_id bigint not null references public.planilhas(id) on delete restrict,
  aluno_ra text not null references public.alunos(ra) on update cascade on delete cascade,
  ano_letivo smallint not null check (ano_letivo between 2000 and 2100),
  bimestre smallint not null check (bimestre between 1 and 4),
  componente text not null,
  proficiencia numeric(10, 2),
  nivel text not null default '',
  atualizado_em timestamptz not null default now(),
  constraint resultados_aluno_ano_bim_componente_key
    unique (aluno_ra, ano_letivo, bimestre, componente)
);

create index if not exists resultados_aluno_ra_idx on public.resultados(aluno_ra);
create index if not exists resultados_ano_bimestre_idx on public.resultados(ano_letivo, bimestre);
create index if not exists matriculas_turma_idx on public.matriculas(ano_letivo, turma);

alter table public.planilhas enable row level security;
alter table public.alunos enable row level security;
alter table public.matriculas enable row level security;
alter table public.resultados enable row level security;

revoke all on table public.planilhas from anon, authenticated;
revoke all on table public.alunos from anon, authenticated;
revoke all on table public.matriculas from anon, authenticated;
revoke all on table public.resultados from anon, authenticated;

grant select, insert, update, delete on table public.planilhas to service_role;
grant select, insert, update, delete on table public.alunos to service_role;
grant select, insert, update, delete on table public.matriculas to service_role;
grant select, insert, update, delete on table public.resultados to service_role;
grant usage, select on all sequences in schema public to service_role;

insert into public.planilhas (nome_arquivo, ano_letivo, bimestre)
values ({filename}, {year}, {bimester})
on conflict (nome_arquivo, ano_letivo, bimestre)
do update set importado_em = now();

insert into public.alunos (ra, nome)
values
{values_block(student_rows)}
on conflict (ra) do update
set nome = excluded.nome,
    atualizado_em = now();

insert into public.matriculas (aluno_ra, ano_letivo, ano_escolar, turma)
values
{values_block(enrollment_rows)}
on conflict (aluno_ra, ano_letivo) do update
set ano_escolar = excluded.ano_escolar,
    turma = excluded.turma;

insert into public.resultados
  (planilha_id, aluno_ra, ano_letivo, bimestre, componente, proficiencia, nivel)
select
  p.id,
  dados.aluno_ra,
  dados.ano_letivo,
  dados.bimestre,
  dados.componente,
  dados.proficiencia,
  dados.nivel
from (
  values
{values_block(result_rows)}
) as dados(aluno_ra, ano_letivo, bimestre, componente, proficiencia, nivel)
join public.planilhas p
  on p.nome_arquivo = {filename}
 and p.ano_letivo = {year}
 and p.bimestre = {bimester}
on conflict (aluno_ra, ano_letivo, bimestre, componente) do update
set planilha_id = excluded.planilha_id,
    proficiencia = excluded.proficiencia,
    nivel = excluded.nivel,
    atualizado_em = now();

commit;

-- Conferencia esperada para esta importacao:
-- select count(*) from public.alunos;      -- {len(students)} ou mais
-- select count(*) from public.resultados;  -- {len(records)} ou mais
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gera um SQL do Supabase a partir da planilha de resultados."
    )
    parser.add_argument("planilha", type=Path)
    parser.add_argument("saida", type=Path)
    parser.add_argument("--ano-letivo", type=int, default=2026)
    args = parser.parse_args()

    sql = build_sql(args.planilha, args.ano_letivo)
    args.saida.write_text(sql, encoding="utf-8")
    print(f"SQL gerado: {args.saida}")


if __name__ == "__main__":
    main()
