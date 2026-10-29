# Manual do Sistema Financeiro do Sítio

## 1. Para abrir e usar no dia a dia
1. Dê dois cliques no atalho **Abrir sistema** (arquivo `abrir-sistema.bat`).
2. Uma janela escura fica minimizada na barra de tarefas: **não feche**, ela mantém o sistema funcionando.
3. O navegador abre em `http://localhost:4173`. Entre com o e-mail e a senha.
4. Para encerrar: saia do sistema (botão **Sair**) e feche a janela escura.

Se a página não abrir, espere uns 10 segundos e atualize (F5).

## 2. Como usar (resumo)
- **Início:** avisos de contas atrasadas e a vencer, totais pendentes e a previsão das próximas 4 semanas.
- **Contas a pagar:** cadastre a despesa, anexe a nota, registre pagamentos (inteiros ou parciais, com juros e multa).
- **Contas a receber:** cadastre a venda e registre cada recebimento.
- **Funcionários:** pessoas, folha mensal (horas extras, descontos, adiantamentos) e temporários (diária ou empreita, com o calendário de dias).
- **Relatórios anuais:** fluxo de caixa, receitas e despesas lançadas, comparação entre anos e mês a mês.
- **Cadastros:** categorias (com unidade de medida) e fornecedores.
- **Histórico e documentos:** conferir notas fiscais, exportar planilhas Excel, baixar os documentos do ano para o imposto de renda e fazer o backup.

Regras importantes:
- Nada que já foi usado é apagado: contas e receitas são **canceladas**, categorias e fornecedores são **desativados**.
- Só vale o que foi **pago/recebido de fato** no fluxo de caixa. Contas pendentes aparecem só nos avisos e nos lançamentos.

## 3. Backup (faça todo mês)
1. Abra **Histórico e documentos > Exportar e backup**.
2. Em **Backup completo**, deixe marcada a opção dos documentos e clique em **Fazer backup agora**.
3. Aguarde terminar. O arquivo `backup_...zip` vai para a pasta Downloads.
4. **Copie esse arquivo para um HD externo ou pen drive.** Um backup que fica só no computador se perde junto com ele.
5. O Início avisa quando o último backup passar de 30 dias.

O arquivo não tem senha: guarde em lugar privado.

## 4. Se algo der errado (recuperação)
Os dados ficam no Supabase (internet). O computador só abre o site.

**O site não abre / mostra erro:**
1. Feche a janela escura do sistema e abra de novo pelo atalho.
2. Se ainda falhar, abra um terminal na pasta do projeto e rode `npm install` e depois `npm run build`.

**Mensagem de que não foi possível carregar os dados:**
- Confira a internet.
- Se ficou mais de 7 dias sem abrir o sistema, o Supabase pausa o projeto grátis. Entre em `supabase.com`, abra o projeto e clique em **Restore project**. Os dados não se perdem.

**Perdeu dados ou precisa montar tudo de novo:**
1. Tenha em mãos o último backup (`backup_...zip`).
2. Se for um projeto Supabase novo: crie o projeto, abra o SQL Editor e rode o arquivo `estrutura-completa.sql`. Crie o usuário em **Authentication > Users** (marque *Auto Confirm User*).
3. No terminal, na pasta do projeto (use a string **Session pooler** em **Connect** do Supabase, trocando a senha do banco):
   ```
   $env:DATABASE_URL = "postgresql://...."
   node restaurar.mjs C:\caminho\backup_2026-10-28_10h30.zip
   ```
4. Digite `RESTAURAR` quando pedir. Ao final, o script confere quantidades e valores com o backup.
5. Para restaurar também os documentos, antes defina também:
   ```
   $env:SUPABASE_URL = "https://SEU-PROJETO.supabase.co"
   $env:SUPABASE_SERVICE_KEY = "chave secret do projeto"
   ```
   Essa chave dá acesso total: nunca a coloque em arquivos do site nem a envie a ninguém.
6. Se o projeto for novo, atualize o arquivo `.env.local` com o novo endereço e a nova chave publishable, e rode `npm run build`.

## 5. Senha e acesso
- **Esqueci a senha:** na tela de login, clique em *Esqueci minha senha*. O link chega por e-mail e abre `localhost:4173`, então o sistema precisa estar aberto.
- **Criar outro usuário:** Supabase > Authentication > Users > Add user (marque *Auto Confirm User*). Depois, no SQL Editor: `insert into public.membros (user_id, nome) select id, email from auth.users on conflict do nothing;`
- O cadastro público está desligado: ninguém consegue criar conta sozinho.

## 6. Cópia do código do sistema
O código fica só neste computador. Copie a pasta para um HD externo de tempos em tempos:
```
robocopy C:\Projetos\sitio-cafe D:\copia-sitio /E /XD node_modules dist
```
(troque `D:` pela letra do HD). O arquivo `.env.local` vai junto: ele tem o endereço e a chave pública do projeto. Para usar a cópia em outro computador: instale o Node.js, rode `npm install` e `npm run build` na pasta e abra pelo atalho.

## 7. Depois de qualquer mudança no código
Rode `npm run build` na pasta do projeto antes de abrir pelo atalho, senão a versão antiga continua sendo exibida.

## 8. Custos e limites
- O plano grátis do Supabase pausa o projeto após 7 dias sem uso e **não faz backup automático**. Por isso, o backup mensal acima é obrigatório.
- Arquivos anexados: PDF, JPG ou PNG, até 10 MB. O grátis tem 1 GB de armazenamento de arquivos.
- O plano Pro (US$ 25/mês) remove a pausa e inclui backup diário de 7 dias. Dá para migrar quando quiser.
