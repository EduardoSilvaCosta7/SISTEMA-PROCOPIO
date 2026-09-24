begin;

-- não manter historico de planilhas
alter table public.resultados drop column if exists planilha_id;
drop table if exists public.planilhas;

-- exclusão se atributos da tabela alunos 
alter table public.alunos drop column if exists criado_em;
alter table public.alunos drop column if exists atualizado_em;
alter table public.matriculas drop column if exists ano_escolar;
alter table public.resultados drop column if exists atualizado_em;

-- As chaves naturais já identificam cada matrícula e resultado; os IDs numéricos são redundantes.
alter table public.matriculas drop constraint if exists matriculas_pkey;
alter table public.matriculas drop constraint if exists matriculas_aluno_ano_key;
alter table public.matriculas drop column if exists id;
alter table public.matriculas
  add constraint matriculas_pkey primary key (aluno_ra, ano_letivo);

alter table public.resultados drop constraint if exists resultados_pkey;
alter table public.resultados
  drop constraint if exists resultados_aluno_ano_bim_componente_key;
alter table public.resultados drop column if exists id;
alter table public.resultados
  add constraint resultados_pkey
  primary key (aluno_ra, ano_letivo, bimestre, componente);

commit;

notify pgrst, 'reload schema';
