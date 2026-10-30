-- =====================================================================
-- SISTEMA FINANCEIRO RURAL FAMILIAR (CAFÉ) - ESTRUTURA COMPLETA DO BANCO
-- Reúne, em um só arquivo, tudo o que foi criado aos poucos.
-- Use em um projeto Supabase NOVO e VAZIO: SQL Editor > New query > Run.
-- Não rode em um projeto que já tem as tabelas.
-- =====================================================================

create function public.fmt_brl(v numeric) returns text
language sql immutable as $$
  select translate(to_char(v, 'FM999,999,990.00'), ',.', '.,');
$$;

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

create table public.propriedade (
  id uuid primary key default gen_random_uuid(),
  nome text not null
);

create table public.membros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  criado_em timestamptz not null default now()
);

create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  saldo_inicial numeric(14,2),
  data_saldo_inicial date,
  ultimo_backup timestamptz,
  check ((saldo_inicial is null) = (data_saldo_inicial is null))
);

create table public.unidades_medida (
  codigo text primary key,
  nome text not null,
  simbolo text not null,
  ativa boolean not null default true
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativa boolean not null default true,
  eh_encargos boolean not null default false,
  unidade_codigo text references public.unidades_medida(codigo),
  criado_em timestamptz not null default now()
);
create unique index categorias_nome_unico on public.categorias (lower(trim(nome)));
create unique index categorias_um_encargos on public.categorias (eh_encargos) where eh_encargos;

create table public.subcategorias (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id),
  nome text not null,
  ativa boolean not null default true,
  unidade_codigo text references public.unidades_medida(codigo),
  criado_em timestamptz not null default now(),
  unique (id, categoria_id)
);
create unique index subcategorias_nome_unico on public.subcategorias (categoria_id, lower(trim(nome)));

create table public.tipos_receita (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index tipos_receita_nome_unico on public.tipos_receita (lower(trim(nome)));

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  documento text,
  telefone text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index fornecedores_nome_unico on public.fornecedores (lower(trim(nome)));

create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  descricao text not null check (length(trim(descricao)) > 0),
  categoria_id uuid not null references public.categorias(id),
  subcategoria_id uuid,
  valor_original numeric(12,2) not null check (valor_original > 0),
  data_lancamento date not null default ((now() at time zone 'America/Sao_Paulo')::date),
    data_emissao date,
  data_vencimento date not null,
  competencia date check (competencia is null or extract(day from competencia) = 1),
  forma_pagamento text,
  observacoes text,
  cancelada boolean not null default false,
  motivo_cancelamento text,
  cancelada_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  fornecedor_id uuid references public.fornecedores(id),
  unidade_codigo text references public.unidades_medida(codigo),
  quantidade numeric(14,3) check (quantidade is null or quantidade > 0),
  foreign key (subcategoria_id, categoria_id) references public.subcategorias(id, categoria_id),
  check (not cancelada or length(trim(coalesce(motivo_cancelamento, ''))) > 0),
  constraint quantidade_e_unidade check ((quantidade is null) = (unidade_codigo is null))
);
create index on public.contas_pagar (data_vencimento);
create index on public.contas_pagar (categoria_id);
create index on public.contas_pagar (fornecedor_id);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas_pagar(id),
  data_pagamento date not null,
  valor_principal numeric(12,2) not null check (valor_principal > 0),
  juros numeric(12,2) not null default 0 check (juros >= 0),
  multa numeric(12,2) not null default 0 check (multa >= 0),
  valor_calculado numeric(12,2) generated always as (valor_principal + juros + multa) stored,
  valor_pago numeric(12,2) not null check (valor_pago > 0),
  ajuste numeric(12,2) generated always as (valor_pago - (valor_principal + juros + multa)) stored,
  justificativa_ajuste text,
  forma_pagamento text,
  observacoes text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  check (
    valor_pago = valor_principal + juros + multa
    or length(trim(coalesce(justificativa_ajuste, ''))) > 0
  )
);
create index on public.pagamentos (conta_id);
create index on public.pagamentos (data_pagamento);

create table public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  descricao text not null check (length(trim(descricao)) > 0),
  tipo_id uuid not null references public.tipos_receita(id),
  valor_total numeric(12,2) not null check (valor_total > 0),
  data_lancamento date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  data_prevista date,
  competencia date check (competencia is null or extract(day from competencia) = 1),
  comprador text,
  observacoes text,
  cancelada boolean not null default false,
  motivo_cancelamento text,
  cancelada_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  check (not cancelada or length(trim(coalesce(motivo_cancelamento, ''))) > 0)
);
create index on public.contas_receber (data_prevista);

create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas_receber(id),
  data_recebimento date not null,
  valor numeric(12,2) not null check (valor > 0),
  observacoes text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz
);
create index on public.recebimentos (conta_id);
create index on public.recebimentos (data_recebimento);

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  conta_pagar_id uuid not null references public.contas_pagar(id),
  storage_path text not null unique,
  nome_original text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  tamanho_bytes bigint not null check (tamanho_bytes > 0 and tamanho_bytes <= 10485760),
  enviado_por uuid default auth.uid() references auth.users(id),
  enviado_em timestamptz not null default now(),
  tipo text not null default 'nota_fiscal'
    check (tipo in ('nota_fiscal', 'boleto', 'comprovante', 'outro')),
  conferido boolean not null default false,
  conferido_em timestamptz,
  conferido_por uuid references auth.users(id)
);
create index on public.documentos (conta_pagar_id);

create table public.historico_alteracoes (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  em timestamptz not null default now()
);
create index on public.historico_alteracoes (tabela, registro_id);

create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  funcao text,
  tipo text not null check (tipo in ('fixo', 'temporario')),
  salario_base numeric(12,2),
  dia_pagamento int,
  pagamento_mes_seguinte boolean,
  telefone text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (
    (tipo = 'fixo'
      and coalesce(salario_base, 0) > 0
      and coalesce(dia_pagamento, 0) between 1 and 31
      and pagamento_mes_seguinte is not null)
    or
    (tipo = 'temporario'
      and salario_base is null
      and dia_pagamento is null
      and pagamento_mes_seguinte is null)
  )
);

create table public.folhas (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id),
  competencia date not null check (extract(day from competencia) = 1),
  salario numeric(12,2) not null check (salario > 0),
  data_vencimento date not null,
  observacoes text,
  cancelada boolean not null default false,
  motivo_cancelamento text,
  cancelada_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  check (not cancelada or length(trim(coalesce(motivo_cancelamento, ''))) > 0)
);
create unique index folhas_uma_por_mes on public.folhas (funcionario_id, competencia)
  where not cancelada;
create index on public.folhas (data_vencimento);

create table public.folha_itens (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas(id),
  tipo text not null check (tipo in ('hora_extra', 'desconto', 'adiantamento')),
  data date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  descricao text,
  horas numeric(8,2),
  valor_hora numeric(12,2),
  valor numeric(12,2) not null check (valor > 0),
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  check (tipo = 'hora_extra' or length(trim(coalesce(descricao, ''))) > 0),
  check (
    (tipo = 'hora_extra' and coalesce(horas, 0) > 0 and coalesce(valor_hora, 0) > 0)
    or (tipo <> 'hora_extra' and horas is null and valor_hora is null)
  )
);
create index on public.folha_itens (folha_id);

create table public.servicos_temp (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id),
  modalidade text not null check (modalidade in ('diaria', 'empreita')),
  descricao text,
  valor_unitario numeric(12,2) not null check (valor_unitario > 0),
  data_vencimento date,
  observacoes text,
  cancelada boolean not null default false,
  motivo_cancelamento text,
  cancelada_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  check (not cancelada or length(trim(coalesce(motivo_cancelamento, ''))) > 0)
);
create index on public.servicos_temp (funcionario_id);

create table public.servico_dias (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos_temp(id),
  data date not null,
  quantidade numeric(10,3) not null default 1 check (quantidade > 0),
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (servico_id, data)
);

create table public.pagamentos_rh (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid references public.folhas(id),
  servico_id uuid references public.servicos_temp(id),
  data_pagamento date not null,
  valor numeric(12,2) not null check (valor > 0),
  forma_pagamento text,
  observacoes text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz,
  check ((folha_id is null) <> (servico_id is null))
);
create index on public.pagamentos_rh (folha_id);
create index on public.pagamentos_rh (servico_id);
create index on public.pagamentos_rh (data_pagamento);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES
-- ---------------------------------------------------------------------

create function public.is_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where user_id = auth.uid());
$$;

create function public.preencher_auditoria() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_em := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.alterado_por := auth.uid();
    new.alterado_em := now();
  end if;
  return new;
end $$;

create function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_acao text := tg_op;
  v_antes jsonb;
  v_depois jsonb;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_depois := to_jsonb(new);
    v_id := v_depois ->> 'id';
  elsif tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_depois := to_jsonb(new);
    v_id := v_depois ->> 'id';
    if (v_depois ->> 'cancelada') = 'true' and (v_antes ->> 'cancelada') = 'false' then
      v_acao := 'CANCELAMENTO';
    end if;
  else
    v_antes := to_jsonb(old);
    v_id := v_antes ->> 'id';
  end if;

  insert into public.historico_alteracoes (tabela, registro_id, acao, antes, depois, usuario_id)
  values (tg_table_name, v_id, v_acao, v_antes, v_depois, auth.uid());

  return null;
end $$;

create function public.controlar_conferencia() returns trigger
language plpgsql as $$
begin
  if new.conferido then
    if tg_op = 'UPDATE' then
      if old.conferido then
        new.conferido_em := old.conferido_em;
        new.conferido_por := old.conferido_por;
      else
        new.conferido_em := now();
        new.conferido_por := auth.uid();
      end if;
    else
      new.conferido_em := now();
      new.conferido_por := auth.uid();
    end if;
  else
    new.conferido_em := null;
    new.conferido_por := null;
  end if;
  return new;
end $$;

create function public.validar_pagamento() returns trigger
language plpgsql set search_path = public as $$
declare
  v_conta public.contas_pagar%rowtype;
  v_encargos boolean;
  v_outros numeric(12,2);
begin
  if tg_op = 'UPDATE' and new.conta_id <> old.conta_id then
    raise exception 'Não é possível mudar a conta de um pagamento já registrado.';
  end if;

  select * into v_conta from public.contas_pagar where id = new.conta_id for update;

  if v_conta.cancelada then
    raise exception 'Esta conta está cancelada e não aceita pagamentos.';
  end if;

  select eh_encargos into v_encargos from public.categorias where id = v_conta.categoria_id;
  if v_encargos and (new.juros > 0 or new.multa > 0) then
    raise exception 'Nesta categoria, o valor já é de juros e multas. Não preencha juros ou multa no pagamento.';
  end if;

  select coalesce(sum(valor_principal), 0) into v_outros
  from public.pagamentos where conta_id = new.conta_id and id <> new.id;

  if v_outros + new.valor_principal > v_conta.valor_original then
    raise exception 'O valor principal pago passa do valor da conta. Ainda falta pagar R$ %.',
      to_char(v_conta.valor_original - v_outros, 'FM999G999G990D00');
  end if;

  return new;
end $$;

create function public.validar_conta_pagar() returns trigger
language plpgsql set search_path = public as $$
declare
  v_pago numeric(12,2);
  v_tem_encargos boolean;
  v_cat_encargos boolean;
begin
  if tg_op = 'UPDATE' then
    select coalesce(sum(valor_principal), 0) into v_pago from public.pagamentos where conta_id = new.id;

    if new.cancelada and not old.cancelada then
      if exists (select 1 from public.pagamentos where conta_id = new.id) then
        raise exception 'Esta conta já tem pagamentos registrados e não pode ser cancelada.';
      end if;
      new.cancelada_em := now();
    end if;

    if new.valor_original < v_pago then
      raise exception 'O valor da conta não pode ser menor que o já pago (R$ %).',
        to_char(v_pago, 'FM999G999G990D00');
    end if;

    if new.categoria_id <> old.categoria_id then
      select eh_encargos into v_cat_encargos from public.categorias where id = new.categoria_id;
      select exists (select 1 from public.pagamentos where conta_id = new.id and (juros > 0 or multa > 0))
        into v_tem_encargos;
      if v_cat_encargos and v_tem_encargos then
        raise exception 'Esta conta tem juros/multa em pagamentos e não pode ir para a categoria de juros e multas.';
      end if;
    end if;
  end if;
  return new;
end $$;

create function public.validar_data_pagamento() returns trigger
language plpgsql as $$
begin
  if new.data_pagamento > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do pagamento não pode ser no futuro. Registre o pagamento no dia em que ele for feito.';
  end if;
  return new;
end $$;

create function public.validar_recebimento() returns trigger
language plpgsql set search_path = public as $$
declare
  v_conta public.contas_receber%rowtype;
  v_outros numeric(12,2);
begin
  if tg_op = 'UPDATE' and new.conta_id <> old.conta_id then
    raise exception 'Não é possível mudar a conta de um recebimento já registrado.';
  end if;

  select * into v_conta from public.contas_receber where id = new.conta_id for update;

  if v_conta.cancelada then
    raise exception 'Esta receita está cancelada e não aceita recebimentos.';
  end if;

  select coalesce(sum(valor), 0) into v_outros
  from public.recebimentos where conta_id = new.conta_id and id <> new.id;

  if v_outros + new.valor > v_conta.valor_total then
    raise exception 'O valor recebido passa do total da receita. Ainda falta receber R$ %.',
      to_char(v_conta.valor_total - v_outros, 'FM999G999G990D00');
  end if;

  return new;
end $$;

create function public.validar_conta_receber() returns trigger
language plpgsql set search_path = public as $$
declare
  v_recebido numeric(12,2);
begin
  if tg_op = 'UPDATE' then
    select coalesce(sum(valor), 0) into v_recebido from public.recebimentos where conta_id = new.id;

    if new.cancelada and not old.cancelada then
      if v_recebido > 0 then
        raise exception 'Esta receita já tem recebimentos registrados e não pode ser cancelada.';
      end if;
      new.cancelada_em := now();
    end if;

    if new.valor_total < v_recebido then
      raise exception 'O valor total não pode ser menor que o já recebido (R$ %).',
        to_char(v_recebido, 'FM999G999G990D00');
    end if;
  end if;
  return new;
end $$;

create function public.validar_data_recebimento() returns trigger
language plpgsql as $$
begin
  if new.data_recebimento > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do recebimento não pode ser no futuro. Registre o recebimento no dia em que ele acontecer.';
  end if;
  return new;
end $$;

create function public.rh_liquido(p_folha uuid) returns numeric
language sql stable set search_path = public as $$
  select f.salario + coalesce(sum(case when i.tipo = 'hora_extra' then i.valor else -i.valor end), 0)
  from public.folhas f
  left join public.folha_itens i on i.folha_id = f.id
  where f.id = p_folha
  group by f.salario;
$$;

create function public.rh_total_servico(p_servico uuid) returns numeric
language sql stable set search_path = public as $$
  select round(
    coalesce((select sum(quantidade) from public.servico_dias where servico_id = p_servico), 0)
    * s.valor_unitario, 2)
  from public.servicos_temp s
  where s.id = p_servico;
$$;

create function public.validar_funcionario() returns trigger
language plpgsql as $$
begin
  if new.tipo <> old.tipo then
    raise exception 'O tipo do funcionário (fixo ou temporário) não pode ser alterado. Cadastre uma nova pessoa.';
  end if;
  return new;
end $$;

create function public.validar_folha() returns trigger
language plpgsql set search_path = public as $$
declare
  v_tipo text;
  v_pago numeric;
  v_adiant numeric;
  v_liq numeric;
begin
  if tg_op = 'INSERT' then
    select tipo into v_tipo from public.funcionarios where id = new.funcionario_id;
    if v_tipo is distinct from 'fixo' then
      raise exception 'A folha mensal só vale para funcionários fixos.';
    end if;
    return new;
  end if;

  if old.cancelada then
    raise exception 'Esta folha está cancelada e não pode mais ser alterada.';
  end if;

  if new.funcionario_id <> old.funcionario_id or new.competencia <> old.competencia then
    raise exception 'O funcionário e o mês de uma folha não podem ser alterados. Cancele esta folha e crie outra.';
  end if;

  select coalesce(sum(valor), 0) into v_pago from public.pagamentos_rh where folha_id = new.id;

  if new.cancelada then
    select coalesce(sum(valor), 0) into v_adiant
      from public.folha_itens where folha_id = new.id and tipo = 'adiantamento';
    if v_pago > 0 or v_adiant > 0 then
      raise exception 'Esta folha já tem pagamentos ou adiantamentos registrados e não pode ser cancelada. Exclua-os primeiro.';
    end if;
    new.cancelada_em := now();
  elsif new.salario <> old.salario then
    select new.salario + coalesce(sum(case when tipo = 'hora_extra' then valor else -valor end), 0)
      into v_liq from public.folha_itens where folha_id = new.id;
    if v_liq < v_pago then
      raise exception 'Com este salário, o valor líquido (R$ %) ficaria menor que o já pago (R$ %).',
        public.fmt_brl(v_liq), public.fmt_brl(v_pago);
    end if;
  end if;
  return new;
end $$;

create function public.validar_folha_item() returns trigger
language plpgsql set search_path = public as $$
declare
  v_folha public.folhas%rowtype;
  v_base numeric;
  v_apos numeric;
  v_pago numeric;
begin
  if tg_op = 'UPDATE' and new.folha_id <> old.folha_id then
    raise exception 'Não é possível mudar a folha de um lançamento já registrado.';
  end if;

  select * into v_folha from public.folhas where id = new.folha_id for update;
  if v_folha.cancelada then
    raise exception 'Esta folha está cancelada e não aceita lançamentos.';
  end if;

  if new.tipo = 'hora_extra' then
    new.valor := round(new.horas * new.valor_hora, 2);
  end if;
  if new.valor <= 0 then
    raise exception 'O valor do lançamento precisa ser maior que zero.';
  end if;

  if new.tipo = 'adiantamento' and new.data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do adiantamento não pode ser no futuro. Registre no dia em que o dinheiro for entregue.';
  end if;

  select v_folha.salario + coalesce(sum(case when tipo = 'hora_extra' then valor else -valor end), 0)
    into v_base
    from public.folha_itens where folha_id = new.folha_id and id <> new.id;

  v_apos := v_base + case when new.tipo = 'hora_extra' then new.valor else -new.valor end;

  select coalesce(sum(valor), 0) into v_pago from public.pagamentos_rh where folha_id = new.folha_id;

  if v_apos < v_pago then
    if v_pago = 0 then
      raise exception 'Este lançamento deixaria o valor líquido do mês negativo. Antes dele, o líquido é de R$ %.',
        public.fmt_brl(v_base);
    else
      raise exception 'Com este lançamento, o valor líquido (R$ %) ficaria menor que o já pago (R$ %).',
        public.fmt_brl(v_apos), public.fmt_brl(v_pago);
    end if;
  end if;
  return new;
end $$;

create function public.validar_folha_item_apagar() returns trigger
language plpgsql set search_path = public as $$
declare
  v_folha public.folhas%rowtype;
  v_liq numeric;
  v_pago numeric;
begin
  select * into v_folha from public.folhas where id = old.folha_id for update;
  if v_folha.cancelada then
    raise exception 'Esta folha está cancelada e não aceita alterações.';
  end if;

  if old.tipo = 'hora_extra' then
    select v_folha.salario + coalesce(sum(case when tipo = 'hora_extra' then valor else -valor end), 0)
      into v_liq from public.folha_itens where folha_id = old.folha_id and id <> old.id;
    select coalesce(sum(valor), 0) into v_pago from public.pagamentos_rh where folha_id = old.folha_id;
    if v_liq < v_pago then
      raise exception 'Excluir esta hora extra deixaria o valor líquido (R$ %) menor que o já pago (R$ %).',
        public.fmt_brl(v_liq), public.fmt_brl(v_pago);
    end if;
  end if;
  return old;
end $$;

create function public.validar_servico_temp() returns trigger
language plpgsql set search_path = public as $$
declare
  v_tipo text;
  v_pago numeric;
  v_qtd numeric;
begin
  if tg_op = 'INSERT' then
    select tipo into v_tipo from public.funcionarios where id = new.funcionario_id;
    if v_tipo is distinct from 'temporario' then
      raise exception 'Este lançamento só vale para funcionários temporários.';
    end if;
    return new;
  end if;

  if old.cancelada then
    raise exception 'Este lançamento está cancelado e não pode mais ser alterado.';
  end if;

  if new.funcionario_id <> old.funcionario_id or new.modalidade <> old.modalidade then
    raise exception 'A pessoa e a modalidade (diária ou empreita) não podem ser alteradas. Cancele e crie outro lançamento.';
  end if;

  select coalesce(sum(valor), 0) into v_pago from public.pagamentos_rh where servico_id = new.id;

  if new.cancelada then
    if v_pago > 0 then
      raise exception 'Este lançamento já tem pagamentos registrados e não pode ser cancelado. Exclua os pagamentos primeiro.';
    end if;
    new.cancelada_em := now();
  elsif new.valor_unitario <> old.valor_unitario then
    select coalesce(sum(quantidade), 0) into v_qtd from public.servico_dias where servico_id = new.id;
    if round(v_qtd * new.valor_unitario, 2) < v_pago then
      raise exception 'Com este valor, o total (R$ %) ficaria menor que o já pago (R$ %).',
        public.fmt_brl(round(v_qtd * new.valor_unitario, 2)), public.fmt_brl(v_pago);
    end if;
  end if;
  return new;
end $$;

create function public.validar_servico_dia() returns trigger
language plpgsql set search_path = public as $$
declare
  v_serv public.servicos_temp%rowtype;
  v_sid uuid;
  v_idatual uuid;
  v_outros numeric;
  v_novo numeric;
  v_pago numeric;
begin
  v_sid := case when tg_op = 'DELETE' then old.servico_id else new.servico_id end;
  v_idatual := case when tg_op = 'DELETE' then old.id else new.id end;

  if tg_op = 'UPDATE' and new.servico_id <> old.servico_id then
    raise exception 'Não é possível mudar o serviço de um dia já registrado.';
  end if;

  select * into v_serv from public.servicos_temp where id = v_sid for update;
  if v_serv.cancelada then
    raise exception 'Este lançamento está cancelado e não aceita alterações nos dias.';
  end if;

  if tg_op <> 'DELETE' and v_serv.modalidade = 'diaria' then
    new.quantidade := 1;
  end if;

  select coalesce(sum(quantidade), 0) into v_outros
    from public.servico_dias where servico_id = v_sid and id <> v_idatual;
  v_novo := v_outros + case when tg_op = 'DELETE' then 0 else new.quantidade end;

  select coalesce(sum(valor), 0) into v_pago from public.pagamentos_rh where servico_id = v_sid;

  if round(v_novo * v_serv.valor_unitario, 2) < v_pago then
    raise exception 'Com esta alteração, o total (R$ %) ficaria menor que o já pago (R$ %).',
      public.fmt_brl(round(v_novo * v_serv.valor_unitario, 2)), public.fmt_brl(v_pago);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create function public.validar_pagamento_rh() returns trigger
language plpgsql set search_path = public as $$
declare
  v_cancelada boolean;
  v_limite numeric;
  v_outros numeric;
begin
  if tg_op = 'UPDATE' and (new.folha_id is distinct from old.folha_id
                           or new.servico_id is distinct from old.servico_id) then
    raise exception 'Não é possível mudar a quem pertence um pagamento já registrado.';
  end if;

  if new.data_pagamento > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do pagamento não pode ser no futuro. Registre o pagamento no dia em que ele for feito.';
  end if;

  if new.folha_id is not null then
    select cancelada into v_cancelada from public.folhas where id = new.folha_id for update;
    if v_cancelada then
      raise exception 'Esta folha está cancelada e não aceita pagamentos.';
    end if;
    v_limite := public.rh_liquido(new.folha_id);
    select coalesce(sum(valor), 0) into v_outros
      from public.pagamentos_rh where folha_id = new.folha_id and id <> new.id;
  else
    select cancelada into v_cancelada from public.servicos_temp where id = new.servico_id for update;
    if v_cancelada then
      raise exception 'Este lançamento está cancelado e não aceita pagamentos.';
    end if;
    v_limite := public.rh_total_servico(new.servico_id);
    select coalesce(sum(valor), 0) into v_outros
      from public.pagamentos_rh where servico_id = new.servico_id and id <> new.id;
  end if;

  if v_outros + new.valor > v_limite then
    raise exception 'O valor passa do que falta pagar. Ainda falta pagar R$ %.',
      public.fmt_brl(v_limite - v_outros);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. GATILHOS
-- ---------------------------------------------------------------------

create trigger t_auditoria before insert or update on public.contas_pagar
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.pagamentos
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.contas_receber
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.recebimentos
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.folhas
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.folha_itens
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.servicos_temp
  for each row execute function public.preencher_auditoria();
create trigger t_auditoria before insert or update on public.pagamentos_rh
  for each row execute function public.preencher_auditoria();

create trigger t_validar before insert or update on public.contas_pagar
  for each row execute function public.validar_conta_pagar();
create trigger t_validar before insert or update on public.pagamentos
  for each row execute function public.validar_pagamento();
create trigger t_validar_data before insert or update on public.pagamentos
  for each row execute function public.validar_data_pagamento();
create trigger t_validar before insert or update on public.contas_receber
  for each row execute function public.validar_conta_receber();
create trigger t_validar before insert or update on public.recebimentos
  for each row execute function public.validar_recebimento();
create trigger t_validar_data before insert or update on public.recebimentos
  for each row execute function public.validar_data_recebimento();
create trigger t_validar before update on public.funcionarios
  for each row execute function public.validar_funcionario();
create trigger t_validar before insert or update on public.folhas
  for each row execute function public.validar_folha();
create trigger t_validar before insert or update on public.folha_itens
  for each row execute function public.validar_folha_item();
create trigger t_validar_apagar before delete on public.folha_itens
  for each row execute function public.validar_folha_item_apagar();
create trigger t_validar before insert or update on public.servicos_temp
  for each row execute function public.validar_servico_temp();
create trigger t_validar before insert or update or delete on public.servico_dias
  for each row execute function public.validar_servico_dia();
create trigger t_validar before insert or update on public.pagamentos_rh
  for each row execute function public.validar_pagamento_rh();
create trigger t_conferencia before insert or update on public.documentos
  for each row execute function public.controlar_conferencia();

do $$
declare t text;
begin
  foreach t in array array[
    'categorias', 'subcategorias', 'tipos_receita', 'configuracoes', 'fornecedores',
    'contas_pagar', 'pagamentos', 'contas_receber', 'recebimentos', 'documentos',
    'funcionarios', 'folhas', 'folha_itens', 'servicos_temp', 'servico_dias', 'pagamentos_rh'
  ] loop
    execute format(
      'create trigger t_historico after insert or update or delete on public.%I
       for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. VISÕES (situação calculada)
-- ---------------------------------------------------------------------

create view public.v_contas_pagar with (security_invoker = true) as
with base as (
  select
    c.*,
    coalesce(p.principal_pago, 0)::numeric(12,2) as principal_pago,
    coalesce(p.juros_pagos, 0)::numeric(12,2)    as juros_pagos,
    coalesce(p.multas_pagas, 0)::numeric(12,2)   as multas_pagas,
    coalesce(p.total_pago, 0)::numeric(12,2)     as total_pago,
    coalesce(p.ajustes, 0)::numeric(12,2)        as ajustes,
    p.ultimo_pagamento
  from public.contas_pagar c
  left join (
    select conta_id,
           sum(valor_principal) as principal_pago,
           sum(juros) as juros_pagos,
           sum(multa) as multas_pagas,
           sum(valor_pago) as total_pago,
           sum(ajuste) as ajustes,
           max(data_pagamento) as ultimo_pagamento
    from public.pagamentos group by conta_id
  ) p on p.conta_id = c.id
)
select
  base.*,
  (base.valor_original - base.principal_pago)::numeric(12,2) as saldo_principal,
  case
    when base.quantidade is not null and base.quantidade > 0
    then round(base.valor_original / base.quantidade, 4)
  end as preco_unitario,

    case
    when base.cancelada then 'Cancelada'
    when base.principal_pago >= base.valor_original then 'Paga'
    when base.data_vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'Atrasada'
    when base.principal_pago > 0 then 'Parcialmente paga'
    else 'Pendente'
  end as status,
  coalesce(not base.cancelada
           and base.principal_pago >= base.valor_original
           and base.ultimo_pagamento > base.data_vencimento, false) as paga_com_atraso,
  case
    when not base.cancelada
         and base.principal_pago >= base.valor_original
         and base.ultimo_pagamento > base.data_vencimento
    then base.ultimo_pagamento - base.data_vencimento
  end as dias_atraso_pagamento
from base;

create view public.v_contas_receber with (security_invoker = true) as
with base as (
  select
    r.*,
    coalesce(x.recebido, 0)::numeric(12,2) as valor_recebido,
    x.ultimo_recebimento
  from public.contas_receber r
  left join (
    select conta_id, sum(valor) as recebido, max(data_recebimento) as ultimo_recebimento
    from public.recebimentos group by conta_id
  ) x on x.conta_id = r.id
)
select
  base.*,
  (base.valor_total - base.valor_recebido)::numeric(12,2) as saldo_a_receber,
  case
    when base.cancelada then 'Cancelado'
    when base.valor_recebido >= base.valor_total then 'Recebido'
    when base.valor_recebido > 0 then 'Parcialmente recebido'
    else 'Pendente'
  end as status
from base;

create view public.v_folhas with (security_invoker = true) as
with base as (
  select
    f.*,
    fu.nome as funcionario_nome,
    fu.funcao as funcionario_funcao,
    coalesce((select sum(i.valor) from public.folha_itens i
              where i.folha_id = f.id and i.tipo = 'hora_extra'), 0)::numeric(12,2) as horas_extras_valor,
    coalesce((select sum(i.valor) from public.folha_itens i
              where i.folha_id = f.id and i.tipo = 'desconto'), 0)::numeric(12,2) as descontos_valor,
    coalesce((select sum(i.valor) from public.folha_itens i
              where i.folha_id = f.id and i.tipo = 'adiantamento'), 0)::numeric(12,2) as adiantamentos_valor,
    coalesce((select sum(p.valor) from public.pagamentos_rh p
              where p.folha_id = f.id), 0)::numeric(12,2) as total_pago
  from public.folhas f
  join public.funcionarios fu on fu.id = f.funcionario_id
),
calc as (
  select
    base.*,
    (base.salario + base.horas_extras_valor - base.descontos_valor - base.adiantamentos_valor)::numeric(12,2)
      as valor_liquido
  from base
)
select
  calc.*,
  (calc.valor_liquido - calc.total_pago)::numeric(12,2) as saldo_a_pagar,
  case
    when calc.cancelada then 'Cancelada'
    when calc.valor_liquido - calc.total_pago <= 0 then 'Paga'
    when calc.data_vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'Atrasada'
    when calc.total_pago > 0 then 'Parcialmente paga'
    else 'Pendente'
  end as status
from calc;

create view public.v_servicos_temp with (security_invoker = true) as
with base as (
  select
    s.*,
    fu.nome as funcionario_nome,
    (select count(*) from public.servico_dias d where d.servico_id = s.id) as qtd_dias,
    coalesce((select sum(d.quantidade) from public.servico_dias d
              where d.servico_id = s.id), 0)::numeric(14,3) as quantidade_total,
    coalesce((select sum(p.valor) from public.pagamentos_rh p
              where p.servico_id = s.id), 0)::numeric(12,2) as total_pago
  from public.servicos_temp s
  join public.funcionarios fu on fu.id = s.funcionario_id
),
calc as (
  select
    base.*,
    round(base.quantidade_total * base.valor_unitario, 2)::numeric(12,2) as total_a_pagar
  from base
)
select
  calc.*,
  (calc.total_a_pagar - calc.total_pago)::numeric(12,2) as saldo_a_pagar,
  case
    when calc.cancelada then 'Cancelada'
    when calc.total_a_pagar > 0 and calc.total_a_pagar - calc.total_pago <= 0 then 'Paga'
    when calc.total_a_pagar - calc.total_pago > 0
         and calc.data_vencimento is not null
         and calc.data_vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'Atrasada'
    when calc.total_pago > 0 then 'Parcialmente paga'
    else 'Pendente'
  end as status
from calc;

create view public.v_vencimentos with (security_invoker = true) as
select 'conta'::text as origem, id, descricao, data_vencimento,
       saldo_principal as saldo, status
from public.v_contas_pagar
where status in ('Pendente', 'Atrasada', 'Parcialmente paga') and saldo_principal > 0
union all
select 'folha', id,
       funcionario_nome || ' · folha ' || to_char(competencia, 'MM/YYYY'),
       data_vencimento, saldo_a_pagar, status
from public.v_folhas
where status in ('Pendente', 'Atrasada', 'Parcialmente paga') and saldo_a_pagar > 0
union all
select 'temporario', id,
       funcionario_nome || ' · ' || coalesce(nullif(descricao, ''), 'temporário'),
       data_vencimento, saldo_a_pagar, status
from public.v_servicos_temp
where status in ('Pendente', 'Atrasada', 'Parcialmente paga') and saldo_a_pagar > 0;

create view public.v_movimentos with (security_invoker = true) as
select r.data_recebimento as data, 'recebimento'::text as tipo, r.valor::numeric as valor
from public.recebimentos r
union all
select p.data_pagamento, 'pagamento_conta', p.valor_pago
from public.pagamentos p
union all
select p.data_pagamento,
       case when p.folha_id is not null then 'pagamento_folha' else 'pagamento_temp' end,
       p.valor
from public.pagamentos_rh p
union all
select i.data, 'adiantamento', i.valor
from public.folha_itens i
join public.folhas f on f.id = i.folha_id
where i.tipo = 'adiantamento' and not f.cancelada;

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES DO PAINEL E DOS RELATÓRIOS
-- ---------------------------------------------------------------------

create function public.painel_inicio() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return jsonb_build_object(
    'atrasadas_qtd', (select count(*) from public.v_vencimentos where status = 'Atrasada'),
    'atrasadas_total', (select coalesce(sum(saldo), 0) from public.v_vencimentos where status = 'Atrasada'),
    'prox7_qtd', (select count(*) from public.v_vencimentos
                   where data_vencimento between hoje and hoje + 6),
    'prox7_total', (select coalesce(sum(saldo), 0) from public.v_vencimentos
                     where data_vencimento between hoje and hoje + 6),
    'pagar_qtd', (select count(*) from public.v_vencimentos),
    'pagar_total', (select coalesce(sum(saldo), 0) from public.v_vencimentos),
    'pagar_sem_data_total', (select coalesce(sum(saldo), 0) from public.v_vencimentos
                              where data_vencimento is null),
    'receber_qtd', (select count(*) from public.v_contas_receber
                     where status in ('Pendente', 'Parcialmente recebido') and saldo_a_receber > 0),
    'receber_total', (select coalesce(sum(saldo_a_receber), 0) from public.v_contas_receber
                       where status in ('Pendente', 'Parcialmente recebido') and saldo_a_receber > 0),
    'receber7_qtd', (select count(*) from public.v_contas_receber
                      where status in ('Pendente', 'Parcialmente recebido') and saldo_a_receber > 0
                        and data_prevista between hoje and hoje + 6),
    'receber7_total', (select coalesce(sum(saldo_a_receber), 0) from public.v_contas_receber
                        where status in ('Pendente', 'Parcialmente recebido') and saldo_a_receber > 0
                          and data_prevista between hoje and hoje + 6),
    'receber_passadas_total', (select coalesce(sum(saldo_a_receber), 0) from public.v_contas_receber
                                where status in ('Pendente', 'Parcialmente recebido')
                                  and saldo_a_receber > 0 and data_prevista < hoje),
    'receber_sem_data_total', (select coalesce(sum(saldo_a_receber), 0) from public.v_contas_receber
                                where status in ('Pendente', 'Parcialmente recebido')
                                  and saldo_a_receber > 0 and data_prevista is null),
    'semanas', (
      select jsonb_agg(jsonb_build_object(
        'n', s,
        'inicio', hoje + s * 7,
        'fim', hoje + s * 7 + 6,
        'pagar', (select coalesce(sum(v.saldo), 0) from public.v_vencimentos v
                   where v.data_vencimento between hoje + s * 7 and hoje + s * 7 + 6),
        'receber', (select coalesce(sum(r.saldo_a_receber), 0) from public.v_contas_receber r
                     where r.status in ('Pendente', 'Parcialmente recebido')
                       and r.saldo_a_receber > 0
                       and r.data_prevista between hoje + s * 7 and hoje + s * 7 + 6)
      ) order by s)
      from generate_series(0, 3) as s
    )
  );
end $$;

create function public.relatorio_fluxo(p_ano int) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_ini date := make_date(p_ano, 1, 1);
  v_fim date := make_date(p_ano, 12, 31);
  v_saldo numeric;
  v_data_saldo date;
  v_saldo_ini numeric;
  v_saldo_fim numeric;
  v_rec numeric;
  v_pago numeric;
begin
  select saldo_inicial, data_saldo_inicial into v_saldo, v_data_saldo
    from public.configuracoes where id = 1;

  select coalesce(sum(valor) filter (where tipo = 'recebimento'), 0),
         coalesce(sum(valor) filter (where tipo <> 'recebimento'), 0)
    into v_rec, v_pago
    from public.v_movimentos where data between v_ini and v_fim;

  if v_saldo is not null and v_data_saldo <= v_fim then
    if v_data_saldo >= v_ini then
      v_saldo_ini := v_saldo;
    else
      select v_saldo + coalesce(sum(case when tipo = 'recebimento' then valor else -valor end), 0)
        into v_saldo_ini from public.v_movimentos
       where data >= v_data_saldo and data < v_ini;
    end if;
    select v_saldo + coalesce(sum(case when tipo = 'recebimento' then valor else -valor end), 0)
      into v_saldo_fim from public.v_movimentos
     where data >= v_data_saldo and data <= v_fim;
  end if;

  return jsonb_build_object(
    'ano', p_ano,
    'recebido_total', v_rec,
    'pago_total', v_pago,
    'diferenca', v_rec - v_pago,
    'pago_contas', (select coalesce(sum(valor), 0) from public.v_movimentos
                     where tipo = 'pagamento_conta' and data between v_ini and v_fim),
    'pago_folha', (select coalesce(sum(valor), 0) from public.v_movimentos
                    where tipo = 'pagamento_folha' and data between v_ini and v_fim),
    'adiantamentos', (select coalesce(sum(valor), 0) from public.v_movimentos
                       where tipo = 'adiantamento' and data between v_ini and v_fim),
    'pago_temporarios', (select coalesce(sum(valor), 0) from public.v_movimentos
                          where tipo = 'pagamento_temp' and data between v_ini and v_fim),
    'juros_pagos', (select coalesce(sum(juros), 0) from public.pagamentos
                     where data_pagamento between v_ini and v_fim),
    'multas_pagas', (select coalesce(sum(multa), 0) from public.pagamentos
                      where data_pagamento between v_ini and v_fim),
    'ajustes', (select coalesce(sum(ajuste), 0) from public.pagamentos
                 where data_pagamento between v_ini and v_fim),
    'encargos_avulsos', (select coalesce(sum(p.valor_pago), 0)
                           from public.pagamentos p
                           join public.contas_pagar c on c.id = p.conta_id
                           join public.categorias k on k.id = c.categoria_id
                          where k.eh_encargos and p.data_pagamento between v_ini and v_fim),
    'recebido_por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.nome, 'valor', x.v) order by x.v desc)
        from (select t.nome, sum(r.valor) as v
                from public.recebimentos r
                join public.contas_receber c on c.id = r.conta_id
                join public.tipos_receita t on t.id = c.tipo_id
               where r.data_recebimento between v_ini and v_fim
               group by t.id, t.nome) x), '[]'::jsonb),
    'pago_por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.nome, 'total', x.total,
                                          'juros_multas', x.jm, 'encargos', x.enc)
                       order by x.total desc)
        from (select k.nome, k.eh_encargos as enc,
                     sum(p.valor_pago) as total, sum(p.juros + p.multa) as jm
                from public.pagamentos p
                join public.contas_pagar c on c.id = p.conta_id
                join public.categorias k on k.id = c.categoria_id
               where p.data_pagamento between v_ini and v_fim
               group by k.id, k.nome, k.eh_encargos) x), '[]'::jsonb),
    'saldo_inicial_informado', v_saldo,
    'data_saldo_inicial', v_data_saldo,
    'saldo_inicial_ano', v_saldo_ini,
    'saldo_final', v_saldo_fim
  );
end $$;

create function public.relatorio_lancamentos(p_ano int) returns jsonb
language sql stable set search_path = public as $$
  with
  contas as (
    select * from public.v_contas_pagar
     where extract(year from coalesce(competencia, data_vencimento)) = p_ano
  ),
  receitas as (
    select * from public.v_contas_receber
     where extract(year from coalesce(competencia, data_prevista, data_lancamento)) = p_ano
  ),
  folhas as (
    select * from public.v_folhas where extract(year from competencia) = p_ano
  ),
  temps as (
    select s.* from public.v_servicos_temp s
     where (select extract(year from max(d.data)) from public.servico_dias d
             where d.servico_id = s.id) = p_ano
  ),
  r as (
    select coalesce(sum(valor_total) filter (where not cancelada), 0) as reg,
           coalesce(sum(valor_recebido) filter (where not cancelada), 0) as rec,
           coalesce(sum(saldo_a_receber) filter (where not cancelada), 0) as pen,
           coalesce(sum(valor_total) filter (where cancelada), 0) as can_v,
           count(*) filter (where cancelada) as can_q
      from receitas
  ),
  c as (
    select coalesce(sum(valor_original) filter (where not cancelada), 0) as reg,
           coalesce(sum(principal_pago) filter (where not cancelada), 0) as pag,
           coalesce(sum(saldo_principal) filter (where not cancelada), 0) as pen,
           coalesce(sum(juros_pagos) filter (where not cancelada), 0) as juros,
           coalesce(sum(multas_pagas) filter (where not cancelada), 0) as multas,
           coalesce(sum(ajustes) filter (where not cancelada), 0) as ajustes,
           coalesce(sum(valor_original) filter (where cancelada), 0) as can_v,
           count(*) filter (where cancelada) as can_q
      from contas
  ),
  f as (
    select coalesce(sum(valor_liquido + adiantamentos_valor) filter (where not cancelada), 0) as custo,
           coalesce(sum(total_pago + adiantamentos_valor) filter (where not cancelada), 0) as pag,
           coalesce(sum(saldo_a_pagar) filter (where not cancelada), 0) as pen,
           coalesce(sum(valor_liquido) filter (where cancelada), 0) as can_v,
           count(*) filter (where cancelada) as can_q
      from folhas
  ),
  t as (
    select coalesce(sum(total_a_pagar) filter (where not cancelada), 0) as tot,
           coalesce(sum(total_pago) filter (where not cancelada), 0) as pag,
           coalesce(sum(saldo_a_pagar) filter (where not cancelada), 0) as pen,
           coalesce(sum(total_a_pagar) filter (where cancelada), 0) as can_v,
           count(*) filter (where cancelada) as can_q
      from temps
  )
  select jsonb_build_object(
    'ano', p_ano,
    'receitas', jsonb_build_object(
      'registradas', r.reg, 'recebidas', r.rec, 'pendentes', r.pen,
      'canceladas_valor', r.can_v, 'canceladas_qtd', r.can_q),
    'contas', jsonb_build_object(
      'registradas', c.reg, 'pagas_principal', c.pag, 'pendentes', c.pen,
      'juros', c.juros, 'multas', c.multas, 'ajustes', c.ajustes,
      'canceladas_valor', c.can_v, 'canceladas_qtd', c.can_q),
    'folha', jsonb_build_object(
      'custo', f.custo, 'pago', f.pag, 'pendente', f.pen,
      'canceladas_valor', f.can_v, 'canceladas_qtd', f.can_q),
    'temporarios', jsonb_build_object(
      'total', t.tot, 'pago', t.pag, 'pendente', t.pen,
      'canceladas_valor', t.can_v, 'canceladas_qtd', t.can_q),
    'despesas_registradas', c.reg + c.juros + c.multas + c.ajustes + f.custo + t.tot,
    'despesas_pagas', c.pag + c.juros + c.multas + c.ajustes + f.pag + t.pag,
    'despesas_pendentes', c.pen + f.pen + t.pen,
    'resultado', r.reg - (c.reg + c.juros + c.multas + c.ajustes + f.custo + t.tot)
  )
  from r, c, f, t;
$$;

create function public.relatorio_formas(p_ano int) returns jsonb
language sql stable set search_path = public as $$
  with mov as (
    select coalesce(nullif(trim(forma_pagamento), ''), 'Não informada') as forma,
           valor_pago as valor, data_pagamento as data
      from public.pagamentos
    union all
    select coalesce(nullif(trim(forma_pagamento), ''), 'Não informada'),
           valor, data_pagamento
      from public.pagamentos_rh
    union all
    select 'Adiantamentos a funcionários', i.valor, i.data
      from public.folha_itens i
      join public.folhas f on f.id = i.folha_id
     where i.tipo = 'adiantamento' and not f.cancelada
  )
  select coalesce(jsonb_agg(jsonb_build_object('forma', forma, 'total', total, 'qtd', qtd)
                            order by total desc), '[]'::jsonb)
    from (select forma, sum(valor) as total, count(*) as qtd
            from mov
           where data between make_date(p_ano, 1, 1) and make_date(p_ano, 12, 31)
           group by forma) x;
$$;

create function public.relatorio_mensal(p_ano int) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_agg(jsonb_build_object('mes', mes, 'recebido', rec, 'pago', pag) order by mes)
  from (
    select g.mes,
           coalesce(sum(m.valor) filter (where m.tipo = 'recebimento'), 0) as rec,
           coalesce(sum(m.valor) filter (where m.tipo <> 'recebimento'), 0) as pag
      from generate_series(1, 12) as g(mes)
      left join public.v_movimentos m
        on extract(year from m.data) = p_ano and extract(month from m.data) = g.mes
     group by g.mes
  ) x;
$$;

create function public.relatorio_fornecedores(p_ano int) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'total', total, 'qtd', qtd)
                            order by total desc), '[]'::jsonb)
  from (
    select coalesce(f.nome, 'Sem fornecedor') as nome,
           sum(p.valor_pago) as total,
           count(*) as qtd
      from public.pagamentos p
      join public.contas_pagar c on c.id = p.conta_id
      left join public.fornecedores f on f.id = c.fornecedor_id
     where p.data_pagamento between make_date(p_ano, 1, 1) and make_date(p_ano, 12, 31)
     group by f.id, f.nome
  ) x;
$$;

create function public.relatorio_subcategorias(
  p_ano int,
  p_categoria uuid default null,
  p_subcategoria uuid default null
) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'categoria', categoria, 'subcategoria', subcategoria,
           'total', total, 'qtd', qtd)
           order by categoria, total desc), '[]'::jsonb)
  from (
    select cat.nome as categoria,
           coalesce(sub.nome, 'Sem subcategoria') as subcategoria,
           sum(p.valor_pago) as total,
           count(*) as qtd
      from public.pagamentos p
      join public.contas_pagar c on c.id = p.conta_id
      join public.categorias cat on cat.id = c.categoria_id
      left join public.subcategorias sub on sub.id = c.subcategoria_id
     where p.data_pagamento between make_date(p_ano, 1, 1) and make_date(p_ano, 12, 31)
       and (p_categoria is null or c.categoria_id = p_categoria)
       and (p_subcategoria is null or c.subcategoria_id = p_subcategoria)
     group by cat.id, cat.nome, sub.id, sub.nome
  ) x;
$$;
-- ---------------------------------------------------------------------
-- 6. SEGURANÇA (RLS e permissões)
-- ---------------------------------------------------------------------

alter table public.propriedade          enable row level security;
alter table public.membros              enable row level security;
alter table public.configuracoes        enable row level security;
alter table public.unidades_medida      enable row level security;
alter table public.categorias           enable row level security;
alter table public.subcategorias        enable row level security;
alter table public.tipos_receita        enable row level security;
alter table public.fornecedores         enable row level security;
alter table public.contas_pagar         enable row level security;
alter table public.pagamentos           enable row level security;
alter table public.contas_receber       enable row level security;
alter table public.recebimentos         enable row level security;
alter table public.documentos           enable row level security;
alter table public.historico_alteracoes enable row level security;
alter table public.funcionarios         enable row level security;
alter table public.folhas               enable row level security;
alter table public.folha_itens          enable row level security;
alter table public.servicos_temp        enable row level security;
alter table public.servico_dias         enable row level security;
alter table public.pagamentos_rh        enable row level security;

create policy "ver proprio cadastro" on public.membros
  for select to authenticated using (user_id = auth.uid());
create policy "membros veem historico" on public.historico_alteracoes
  for select to authenticated using (public.is_membro());
create policy "membros leem" on public.unidades_medida
  for select to authenticated using (public.is_membro());

do $$
declare t text;
begin
  foreach t in array array[
    'propriedade', 'configuracoes', 'categorias', 'subcategorias', 'tipos_receita', 'fornecedores',
    'contas_pagar', 'pagamentos', 'contas_receber', 'recebimentos', 'documentos',
    'funcionarios', 'folhas', 'folha_itens', 'servicos_temp', 'servico_dias', 'pagamentos_rh'
  ] loop
    execute format('create policy "membros leem" on public.%I for select to authenticated using (public.is_membro())', t);
    execute format('create policy "membros inserem" on public.%I for insert to authenticated with check (public.is_membro())', t);
    execute format('create policy "membros alteram" on public.%I for update to authenticated using (public.is_membro()) with check (public.is_membro())', t);
  end loop;

  foreach t in array array[
    'subcategorias', 'documentos', 'pagamentos', 'recebimentos', 'fornecedores',
    'funcionarios', 'folhas', 'folha_itens', 'servicos_temp', 'servico_dias', 'pagamentos_rh'
  ] loop
    execute format('create policy "membros apagam" on public.%I for delete to authenticated using (public.is_membro())', t);
  end loop;
end $$;

create policy "membros apagam categorias" on public.categorias
  for delete to authenticated using (public.is_membro() and not eh_encargos);

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete on public.historico_alteracoes, public.unidades_medida from authenticated;
revoke delete on public.contas_pagar, public.contas_receber, public.configuracoes,
  public.propriedade, public.membros from authenticated;

grant select on public.v_contas_pagar, public.v_contas_receber, public.v_folhas,
  public.v_servicos_temp, public.v_vencimentos, public.v_movimentos to authenticated;
revoke all on public.v_contas_pagar, public.v_contas_receber, public.v_folhas,
  public.v_servicos_temp, public.v_vencimentos, public.v_movimentos from anon;

revoke all on function public.painel_inicio(), public.relatorio_fluxo(int),
  public.relatorio_lancamentos(int), public.relatorio_formas(int),
  public.relatorio_mensal(int), public.relatorio_fornecedores(int) from public, anon;
grant execute on function public.painel_inicio(), public.relatorio_fluxo(int),
  public.relatorio_lancamentos(int), public.relatorio_formas(int),
  public.relatorio_mensal(int), public.relatorio_fornecedores(int) to authenticated;
  
revoke all on function public.relatorio_subcategorias(int, uuid, uuid) from public, anon;
grant execute on function public.relatorio_subcategorias(int, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. ARMAZENAMENTO PRIVADO DE DOCUMENTOS
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

create policy "membros leem arquivos" on storage.objects
  for select to authenticated using (bucket_id = 'documentos' and public.is_membro());
create policy "membros enviam arquivos" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos' and public.is_membro());
create policy "membros removem arquivos" on storage.objects
  for delete to authenticated using (bucket_id = 'documentos' and public.is_membro());

-- ---------------------------------------------------------------------
-- 8. DADOS INICIAIS
-- ---------------------------------------------------------------------

insert into public.unidades_medida (codigo, nome, simbolo) values
  ('litro', 'Litro', 'L'),
  ('kg', 'Quilo', 'kg'),
  ('tonelada', 'Tonelada', 't'),
  ('saco', 'Saco', 'saco'),
  ('unidade', 'Unidade', 'un'),
  ('hora', 'Hora', 'h'),
  ('dia', 'Dia', 'dia'),
  ('metro', 'Metro', 'm');

insert into public.categorias (nome, eh_encargos) values
  ('Manutenção', false),
  ('Mão de obra', false),
  ('Veneno e defensivos agrícolas', false),
  ('Fertilizantes', false),
  ('Energia', false),
  ('Folha de funcionários', false),
  ('Funcionário temporário', false),
  ('Combustível', false),
  ('Terceirização de serviços', false),
  ('Diversos', false),
  ('Maquinário', false),
  ('Juros e multas de boletos', true);

insert into public.tipos_receita (nome) values
  ('Venda de café'), ('Outros serviços'), ('Outras receitas');

insert into public.propriedade (nome) values ('Sítio');
insert into public.configuracoes (id) values (1);

-- ---------------------------------------------------------------------
-- DEPOIS: crie o usuário em Authentication > Users e rode:
--   insert into public.membros (user_id, nome) select id, email from auth.users;
-- (se for restaurar um backup com o script restaurar.mjs, ele faz isso sozinho)
-- ---------------------------------------------------------------------
