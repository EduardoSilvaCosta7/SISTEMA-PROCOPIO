begin;

create table if not exists public.planilhas (
  id bigint generated always as identity primary key,
  nome_arquivo text not null,
  ano_letivo smallint not null check (ano_letivo between 2000 and 2100),
  bimestre smallint not null check (bimestre between 1 and 4),
  importado_em timestamptz not null default now(),
  constraint planilhas_arquivo_ano_bimestre_key
    unique (nome_arquivo, ano_letivo, bimestre)
);

create table if not exists public.alunos (
  ra text primary key,
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.matriculas (
  id bigint generated always as identity primary key,
  aluno_ra text not null references public.alunos(ra)
    on update cascade on delete cascade,
  ano_letivo smallint not null check (ano_letivo between 2000 and 2100),
  ano_escolar text not null default '',
  turma text not null default '',
  constraint matriculas_aluno_ano_key unique (aluno_ra, ano_letivo)
);

create table if not exists public.resultados (
  id bigint generated always as identity primary key,
  planilha_id bigint not null references public.planilhas(id) on delete restrict,
  aluno_ra text not null references public.alunos(ra)
    on update cascade on delete cascade,
  ano_letivo smallint not null check (ano_letivo between 2000 and 2100),
  bimestre smallint not null check (bimestre between 1 and 4),
  componente text not null,
  proficiencia numeric(10, 2),
  nivel text not null default '',
  atualizado_em timestamptz not null default now(),
  constraint resultados_aluno_ano_bim_componente_key
    unique (aluno_ra, ano_letivo, bimestre, componente)
);

create index if not exists resultados_aluno_ra_idx
  on public.resultados(aluno_ra);
create index if not exists resultados_ano_bimestre_idx
  on public.resultados(ano_letivo, bimestre);
create index if not exists matriculas_turma_idx
  on public.matriculas(ano_letivo, turma);

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

commit;
