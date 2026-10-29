# Sítio – Gestão Financeira

Sistema web para a gestão financeira de um sítio de café, feito para uso da família (dois usuários, um login compartilhado). Roda localmente em um computador e guarda os dados na nuvem, com backup e restauração conferidos.

## Funcionalidades

- **Contas a pagar:** categorias e subcategorias com unidade de medida (preço por unidade), fornecedores, pagamentos parciais, juros, multa e ajustes, anexos e conferência de notas fiscais.
- **Contas a receber:** vendas e recebimentos parciais, com tipos de receita.
- **Funcionários (RH):** folha mensal de fixos (horas extras, descontos, adiantamentos) e temporários por diária ou por empreita (saca), com calendário de dias trabalhados.
- **Início:** alertas de contas atrasadas e a vencer e previsão das próximas 4 semanas.
- **Relatórios anuais:** fluxo de caixa, receitas e despesas lançadas, comparação entre anos, mês a mês, fornecedores e formas de pagamento, com opção de salvar em PDF.
- **Exportações:** planilhas Excel (.xlsx), ZIP de documentos por ano para o imposto de renda e backup completo.
- **Histórico:** registro automático de alterações.
- **PWA:** pode ser instalado como aplicativo no computador.

## Tecnologias

- React, TypeScript e Vite
- Supabase: PostgreSQL, Row Level Security e Storage privado
- ExcelJS (planilhas) e JSZip (ZIPs e backup)

## Decisões de projeto

- **Segurança:** acesso só para usuários cadastrados (cadastro público desativado), regras de acesso no banco (RLS) e anexos em bucket privado com links temporários.
- **Regras no banco:** status, totais e relatórios calculados em SQL (views e funções); gatilhos validam pagamentos, datas e limites; valores monetários em `numeric(12,2)`.
- **Nada é apagado:** contas são canceladas e cadastros desativados, para preservar o histórico.
- **Backup e restauração:** backup completo em ZIP e script de restauração (`restaurar.mjs`) que roda em uma transação e confere quantidades e valores no final.

## Como rodar

Pré-requisitos: Node.js e um projeto no [Supabase](https://supabase.com).

1. Instale as dependências:
   ```bash
   npm install
   ```
2. No SQL Editor do Supabase, execute o arquivo `estrutura-completa.sql` (cria tabelas, regras de acesso, bucket e dados iniciais).
3. Crie o usuário em **Authentication > Users** e desative o cadastro público (*Allow new users to sign up*).
4. Copie `.env.example` para `.env.local` e preencha com o endereço do projeto e a chave *publishable*.
5. Desenvolvimento:
   ```bash
   npm run dev
   ```
6. Uso diário (versão pronta):
   ```bash
   npm run build
   npm run preview -- --port 4173 --strictPort
   ```
   No Windows, o `abrir-sistema.bat` faz isso e abre o navegador.

## Backup e restauração

Veja o `MANUAL.md` para o passo a passo. Nunca coloque backups, senhas do banco ou a chave *secret* no repositório.

## Estrutura

```
src/
  componentes/   peças reutilizáveis (pagamentos, anexos, folha...)
  telas/         páginas do sistema
  lib/           Supabase, formatação e planilhas
  estilos/       CSS dividido por área
estrutura-completa.sql   banco completo para um projeto novo
restaurar.mjs            restauração de backup
```