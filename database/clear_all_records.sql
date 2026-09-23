begin;

-- A ordem importa: resultados depende das planilhas e dos alunos.
delete from public.resultados;
delete from public.planilhas;
delete from public.matriculas;
delete from public.alunos;

commit;
