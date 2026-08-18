begin;

alter table public.planilhas
  add column if not exists semestre smallint;

alter table public.resultados
  add column if not exists semestre smallint;

alter table public.planilhas alter column bimestre drop not null;
alter table public.resultados alter column bimestre drop not null;

alter table public.planilhas
  drop constraint if exists planilhas_semestre_check;
alter table public.planilhas
  add constraint planilhas_semestre_check
    check (semestre is null or semestre between 1 and 2);

alter table public.resultados
  drop constraint if exists resultados_semestre_check;
alter table public.resultados
  add constraint resultados_semestre_check
    check (semestre is null or semestre between 1 and 2);

create unique index if not exists planilhas_arquivo_ano_semestre_key
  on public.planilhas (nome_arquivo, ano_letivo, semestre);

create unique index if not exists resultados_aluno_ano_semestre_componente_key
  on public.resultados (aluno_ra, ano_letivo, semestre, componente);

create index if not exists resultados_ano_semestre_idx
  on public.resultados (ano_letivo, semestre);

-- Remove somente dados do formato bimestral antigo. Importacoes semestrais
-- existentes sao preservadas caso esta migracao seja executada novamente.
delete from public.resultados
where semestre is null;

delete from public.planilhas
where semestre is null;

commit;
