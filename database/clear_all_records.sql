begin;

-- A ordem importa: resultados e matriculas dependem dos alunos.
delete from public.resultados;
delete from public.matriculas;
delete from public.alunos;

commit;
