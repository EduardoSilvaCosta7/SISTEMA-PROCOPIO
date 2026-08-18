# Sistema de Resultados - EMEF Procopio Ferreira

Aplicacao FastAPI para consultar resultados por RA e importar planilhas Excel diretamente no Supabase.

## Executar localmente

1. Crie e ative um ambiente virtual.
2. Instale as dependencias:

```powershell
pip install -r requirements.txt
```

3. Copie `.env.example` para `.env` e preencha as variaveis.
4. Inicie o servidor:

```powershell
uvicorn app.main:app --reload
```

5. Acesse `http://127.0.0.1:8000`.

## Variaveis da Vercel

Configure em **Project Settings > Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase criada pela integracao.
- `SUPABASE_SECRET_KEY`: chave secreta do Supabase criada pela integracao.
- `SCHOOL_YEAR`: ano letivo dos dados, por exemplo `2026`.

Depois de criar ou alterar variaveis, faca um novo deploy na Vercel.

## Importar planilha

A tela aceita arquivos `.xlsx` e `.xlsm`. A planilha deve possuir a coluna `SEMESTRE`, preenchida com `1º semestre` ou `2º semestre`. Selecione a planilha e clique em **Importar planilha**.

A API extrai somente os campos necessarios e grava os alunos, matriculas e resultados diretamente no Supabase. Uma nova importacao substitui os resultados existentes do mesmo semestre. A chave secreta do banco permanece apenas no backend e nunca deve ser colocada no codigo JavaScript.

Antes do primeiro envio no novo formato, execute `database/migrations/002_semester_results.sql` no SQL Editor do Supabase. Essa migracao adiciona o semestre e remove os resultados bimestrais antigos.
