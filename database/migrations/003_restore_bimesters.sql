begin;

-- Prefere os dados importados no formato mais recente quando houver conflito.
delete from public.resultados antigos
using public.resultados atuais
where antigos.semestre is null
  and atuais.semestre between 1 and 4
  and antigos.aluno_ra = atuais.aluno_ra
  and antigos.ano_letivo = atuais.ano_letivo
  and antigos.bimestre = atuais.semestre
  and antigos.componente = atuais.componente;

update public.resultados
set bimestre = semestre
where bimestre is null
  and semestre between 1 and 4;

update public.planilhas
set bimestre = semestre
where bimestre is null
  and semestre between 1 and 4;

alter table public.resultados
  alter column bimestre set not null;
alter table public.planilhas
  alter column bimestre set not null;

drop index if exists public.resultados_aluno_ano_semestre_componente_key;
drop index if exists public.resultados_ano_semestre_idx;
drop index if exists public.planilhas_arquivo_ano_semestre_key;

alter table public.resultados
  drop constraint if exists resultados_semestre_check;
alter table public.planilhas
  drop constraint if exists planilhas_semestre_check;

alter table public.resultados drop column if exists semestre;
alter table public.planilhas drop column if exists semestre;

commit;

notify pgrst, 'reload schema';
