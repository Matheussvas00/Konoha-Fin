// Supabase Edge Function — Assistente financeiro MULTIAGENTE (Groq, grátis).
//
//   ROTEADOR  -> classifica a mensagem em "analise" ou "acao".
//   ANALISTA  -> somente leitura: relatórios/análises do mês.
//   OPERADOR  -> escreve dados via function calling (lançamento, categoria,
//                carteira, meta, orçamento, aporte).
//
// Deploy:  supabase functions deploy ai-assistant
// Secret:  supabase secrets set GROQ_API_KEY=gsk_...   (pegue em console.groq.com)
//          (SUPABASE_URL e SUPABASE_ANON_KEY são injetados automaticamente)

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_STT_MODEL = Deno.env.get('GROQ_STT_MODEL') ?? 'whisper-large-v3-turbo';
const PAYMENT = new Set(['pix', 'cash', 'credit', 'debit', 'bank_transfer']);

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (body: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? corsHeaders(req) : {}), 'Content-Type': 'application/json' },
  });

const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayISO = () => new Date().toISOString().slice(0, 10);

function monthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return { start: new Date(y, m, 1).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
}

function findByName(items: any[], name?: string) {
  if (!name) return null;
  const q = String(name).trim().toLowerCase();
  return items.find((x) => x.name.toLowerCase() === q) ?? items.find((x) => x.name.toLowerCase().includes(q)) ?? null;
}

// ── Chamada ao Groq (OpenAI-compatible) ─────────────────────────────────

async function groqChat(key: string, messages: any[], tools?: any[]) {
  const body: any = { model: GROQ_MODEL, messages, temperature: 0.3, max_tokens: 1024 };
  if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message ?? { content: '' };
}

// ── Transcrição de áudio (voz → texto) via Whisper no Groq ──────────────

async function transcribeAudio(key: string, b64: string, mime?: string): Promise<string> {
  // Aceita tanto base64 puro quanto data URL ("data:audio/...;base64,XXXX").
  const comma = b64.indexOf(',');
  const raw = (comma >= 0 && b64.slice(0, comma).includes('base64')) ? b64.slice(comma + 1) : b64;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const m = (mime || 'audio/webm').split(';')[0];
  const ext = m.includes('mp4') || m.includes('m4a') ? 'm4a'
            : m.includes('mpeg') || m.includes('mp3') ? 'mp3'
            : m.includes('wav') ? 'wav'
            : m.includes('ogg') ? 'ogg' : 'webm';

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: m }), `audio.${ext}`);
  form.append('model', GROQ_STT_MODEL);
  form.append('language', 'pt');
  form.append('response_format', 'json');

  const res = await fetch(GROQ_STT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return String(data?.text ?? '').trim();
}

// ── Contexto financeiro ─────────────────────────────────────────────────

async function buildContext(supabase: SupabaseClient) {
  const { start, end } = monthRange();
  const [txRes, accRes, balRes, budRes, goalRes, catRes] = await Promise.all([
    supabase.from('transactions').select('type, amount, status, category_id').gte('date', start).lte('date', end),
    supabase.from('accounts').select('id, name, type').eq('is_archived', false),
    supabase.from('account_balances').select('id, balance'),
    supabase.from('budgets').select('category_id, amount'),
    supabase.from('goals').select('name, target_amount, current_amount, is_completed'),
    supabase.from('categories').select('id, name, type'),
  ]);

  const txs = txRes.data ?? [];
  const accounts = accRes.data ?? [];
  const balances = new Map((balRes.data ?? []).map((b: any) => [b.id, Number(b.balance)]));
  const budgets = budRes.data ?? [];
  const goals = goalRes.data ?? [];
  const cats = catRes.data ?? [];
  const catName = new Map(cats.map((c: any) => [c.id, c.name]));

  const eff = txs.filter((t: any) => t.status === 'effected');
  const income = eff.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expense = eff.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

  const byCat = new Map<string, number>();
  for (const t of eff) {
    if (t.type !== 'expense') continue;
    const n = catName.get(t.category_id) ?? 'Sem categoria';
    byCat.set(n, (byCat.get(n) ?? 0) + Number(t.amount));
  }
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = accounts.reduce((s: number, a: any) => s + (balances.get(a.id) ?? 0), 0);

  const payLabels: Record<string, string> = { pix: 'Pix', cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', bank_transfer: 'Transferência bancária' };
  const byPay = new Map<string, number>();
  try {
    const { data: payRows } = await supabase
      .from('transactions')
      .select('amount, payment_method')
      .eq('status', 'effected')
      .eq('type', 'expense')
      .gte('date', start)
      .lte('date', end);
    for (const t of (payRows ?? [])) {
      const k = (t as any).payment_method ?? 'sem forma';
      byPay.set(k, (byPay.get(k) ?? 0) + Number((t as any).amount));
    }
  } catch {
    // coluna payment_method (migração 006) pode ainda não existir — ignora
  }

  const lines: string[] = [
    `Saldo total: ${brl(total)}. Entradas: ${brl(income)}. Saídas: ${brl(expense)}. Resultado: ${brl(income - expense)}.`,
  ];
  if (accounts.length) lines.push('Carteiras: ' + accounts.map((a: any) => `${a.name} (${brl(balances.get(a.id) ?? 0)})`).join(', '));
  if (top.length) lines.push('Gastos por categoria: ' + top.map(([n, v]) => `${n}: ${brl(v)}`).join(', '));
  if (budgets.length) lines.push('Orçamentos: ' + budgets.map((b: any) => `${catName.get(b.category_id) ?? 'Categoria'}: gasto ${brl(byCat.get(catName.get(b.category_id)) ?? 0)} de ${brl(Number(b.amount))}`).join(', '));
  if (goals.length) lines.push('Metas: ' + goals.map((g: any) => `${g.name}: ${brl(Number(g.current_amount))}/${brl(Number(g.target_amount))}${g.is_completed ? ' (concluída)' : ''}`).join(', '));
  if (byPay.size) lines.push('Gastos por forma de pagamento: ' + [...byPay.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${payLabels[k] ?? k}: ${brl(v)}`).join(', '));

  // Conjuntos de dados numéricos prontos para gráficos (valores reais).
  const datasets = {
    categorias: top.map(([label, value]) => ({ label, value })),
    pagamento: [...byPay.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: payLabels[k] ?? k, value: v })),
    carteiras: accounts.map((a: any) => ({ label: a.name, value: balances.get(a.id) ?? 0 })),
    entradas_saidas: [{ label: 'Entradas', value: income }, { label: 'Saídas', value: expense }],
    metas: goals.map((g: any) => ({ label: g.name, value: Number(g.current_amount) })),
  };

  return { summaryText: lines.join('\n'), accounts, categories: cats, datasets };
}

// ── Ferramentas do Operador (formato OpenAI) ────────────────────────────

const fn = (name: string, description: string, properties: any, required: string[]) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

const TOOLS = [
  fn('criar_lancamento', 'Cria um lançamento (income/expense/transfer).', {
    tipo: { type: 'string', enum: ['income', 'expense', 'transfer'] },
    descricao: { type: 'string' }, valor: { type: 'number' },
    conta: { type: 'string', description: 'nome da carteira de origem' },
    categoria: { type: 'string' },
    conta_destino: { type: 'string', description: 'só para transfer' },
    forma_pagamento: { type: 'string', enum: ['pix', 'cash', 'credit', 'debit', 'bank_transfer'] },
    data: { type: 'string', description: 'YYYY-MM-DD; padrão hoje' },
  }, ['tipo', 'descricao', 'valor', 'conta']),
  fn('criar_categoria', 'Cria uma categoria.', {
    nome: { type: 'string' }, tipo: { type: 'string', enum: ['income', 'expense'] },
  }, ['nome', 'tipo']),
  fn('criar_carteira', 'Cria uma carteira/conta.', {
    nome: { type: 'string' },
    tipo: { type: 'string', enum: ['checking', 'savings', 'cash', 'credit_card', 'investment', 'other'] },
    saldo_inicial: { type: 'number' },
  }, ['nome', 'tipo']),
  fn('criar_meta', 'Cria uma meta de economia.', {
    nome: { type: 'string' }, valor_alvo: { type: 'number' }, valor_inicial: { type: 'number' },
  }, ['nome', 'valor_alvo']),
  fn('definir_orcamento', 'Define/atualiza o orçamento mensal de uma categoria.', {
    categoria: { type: 'string' }, valor: { type: 'number' },
  }, ['categoria', 'valor']),
  fn('aportar_meta', 'Aporta (ou retira, negativo) valor em uma meta.', {
    meta: { type: 'string' }, valor: { type: 'number' },
  }, ['meta', 'valor']),
];

async function execTool(name: string, args: any, supabase: SupabaseClient, userId: string, accounts: any[], categories: any[]) {
  try {
    if (name === 'criar_lancamento') {
      const acc = findByName(accounts, args.conta);
      if (!acc) return { ok: false, message: `Carteira "${args.conta}" não encontrada. Disponíveis: ${accounts.map((a) => a.name).join(', ') || 'nenhuma'}.` };
      const valor = Number(args.valor);
      if (!valor || valor <= 0) return { ok: false, message: 'Valor inválido.' };
      const cat = findByName(categories, args.categoria);
      const toAcc = args.tipo === 'transfer' ? findByName(accounts, args.conta_destino) : null;
      if (args.tipo === 'transfer' && !toAcc) return { ok: false, message: 'Transferência precisa de conta de destino válida.' };
      const row: any = {
        user_id: userId, account_id: acc.id, to_account_id: toAcc?.id ?? null,
        category_id: cat?.id ?? null, type: args.tipo, status: 'effected',
        description: String(args.descricao ?? 'Lançamento').trim(), amount: valor,
        date: args.data || todayISO(),
      };
      if (PAYMENT.has(args.forma_pagamento)) row.payment_method = args.forma_pagamento;
      let { error } = await supabase.from('transactions').insert(row);
      if (error && row.payment_method) {
        // coluna payment_method (migração 006) pode não existir — tenta sem ela
        delete row.payment_method;
        ({ error } = await supabase.from('transactions').insert(row));
      }
      if (error) throw error;
      return { ok: true, message: `Lançamento criado: ${row.description} (${brl(valor)}) em ${acc.name}.` };
    }
    if (name === 'criar_categoria') {
      const { data, error } = await supabase.from('categories').insert({ user_id: userId, name: String(args.nome).trim(), type: args.tipo, icon: 'ellipsis-horizontal-outline' }).select().single();
      if (error) throw error;
      categories.push(data);
      return { ok: true, message: `Categoria "${args.nome}" criada.` };
    }
    if (name === 'criar_carteira') {
      const { data, error } = await supabase.from('accounts').insert({ user_id: userId, name: String(args.nome).trim(), type: args.tipo, initial_balance: Number(args.saldo_inicial ?? 0), currency: 'BRL' }).select().single();
      if (error) throw error;
      accounts.push(data);
      return { ok: true, message: `Carteira "${args.nome}" criada.` };
    }
    if (name === 'criar_meta') {
      const { error } = await supabase.from('goals').insert({ user_id: userId, name: String(args.nome).trim(), target_amount: Number(args.valor_alvo), current_amount: Number(args.valor_inicial ?? 0) });
      if (error) throw error;
      return { ok: true, message: `Meta "${args.nome}" criada (alvo ${brl(Number(args.valor_alvo))}).` };
    }
    if (name === 'definir_orcamento') {
      const cat = findByName(categories, args.categoria);
      if (!cat) return { ok: false, message: `Categoria "${args.categoria}" não encontrada.` };
      const { error } = await supabase.from('budgets').upsert({ user_id: userId, category_id: cat.id, amount: Number(args.valor) }, { onConflict: 'user_id,category_id' });
      if (error) throw error;
      return { ok: true, message: `Orçamento de ${cat.name} definido em ${brl(Number(args.valor))}/mês.` };
    }
    if (name === 'aportar_meta') {
      const { data: goals } = await supabase.from('goals').select('id, name, target_amount, current_amount');
      const g = findByName(goals ?? [], args.meta);
      if (!g) return { ok: false, message: `Meta "${args.meta}" não encontrada.` };
      const nxt = Math.max(0, Number(g.current_amount) + Number(args.valor));
      const { error } = await supabase.from('goals').update({ current_amount: nxt, is_completed: nxt >= Number(g.target_amount) }).eq('id', g.id);
      if (error) throw error;
      return { ok: true, message: `Aporte de ${brl(Number(args.valor))} na meta "${g.name}". Total: ${brl(nxt)}.` };
    }
    return { ok: false, message: `Ferramenta desconhecida: ${name}.` };
  } catch (e) {
    return { ok: false, message: `Erro em ${name}: ${String((e as any)?.message ?? e)}` };
  }
}

// ── Agentes ─────────────────────────────────────────────────────────────

async function routeIntent(key: string, question: string): Promise<'analise' | 'acao' | 'grafico'> {
  const m = await groqChat(key, [
    { role: 'system', content: 'Classifique a mensagem em UMA palavra: "grafico" se o usuário pede um gráfico, histograma, visualização ou comparativo visual (ex.: "mostre um gráfico", "faça um histograma", "visualize meus gastos"); "acao" se quer criar/registrar/salvar algo (lançamento, despesa, receita, transferência, categoria, carteira, orçamento, meta, aporte); "analise" caso contrário. Responda só com a palavra.' },
    { role: 'user', content: question },
  ]);
  const t = String(m.content ?? '').toLowerCase();
  if (t.includes('grafico') || t.includes('gráfico')) return 'grafico';
  return (t.includes('acao') || t.includes('ação')) ? 'acao' : 'analise';
}

const CHART_TITLES: Record<string, string> = {
  categorias: 'Gastos por categoria',
  pagamento: 'Gastos por forma de pagamento',
  carteiras: 'Saldo por carteira',
  entradas_saidas: 'Entradas vs Saídas',
  metas: 'Progresso das metas',
};

const CHART_TOOL = fn('gerar_grafico',
  'Escolhe o conjunto de dados e o tipo de gráfico que melhor respondem ao pedido do usuário.',
  {
    dataset: { type: 'string', enum: ['categorias', 'pagamento', 'carteiras', 'entradas_saidas', 'metas'],
      description: 'categorias=gastos por categoria; pagamento=gastos por forma de pagamento; carteiras=saldo por carteira; entradas_saidas=entradas vs saídas; metas=progresso das metas' },
    tipo: { type: 'string', enum: ['bar', 'pie'], description: 'bar para comparar/histograma; pie para proporção' },
    titulo: { type: 'string' },
  }, ['dataset', 'tipo']);

async function runChartAgent(key: string, persona: string, summary: string, datasets: any, question: string) {
  const sys = `Você é ${persona}, o agente de GRÁFICOS do Konoha Fin. Use a ferramenta gerar_grafico para escolher o conjunto de dados e o tipo de gráfico que respondem ao pedido do usuário. Depois escreva 1 frase curta em português explicando o gráfico. Nunca invente números. DADOS DISPONÍVEIS:\n${summary}`;
  const messages: any[] = [{ role: 'system', content: sys }, { role: 'user', content: question }];
  let chart: any = null;

  for (let i = 0; i < 3; i++) {
    const m = await groqChat(key, messages, [CHART_TOOL]);
    if (m.tool_calls && m.tool_calls.length) {
      messages.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls });
      for (const tc of m.tool_calls) {
        let a: any = {};
        try { a = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        const points = (datasets[a.dataset] ?? []).filter((p: any) => Number.isFinite(p.value) && p.value !== 0);
        chart = { type: a.tipo === 'pie' ? 'pie' : 'bar', title: a.titulo || CHART_TITLES[a.dataset] || 'Gráfico', points };
        messages.push({ role: 'tool', tool_call_id: tc.id,
          content: points.length ? `Gráfico "${chart.title}" pronto com ${points.length} itens.` : 'Sem dados para esse gráfico.' });
      }
      continue;
    }
    const text = String(m.content ?? '').trim();
    const fallback = chart?.points?.length ? `Aqui está o gráfico: ${chart.title}.` : 'Não há dados suficientes para gerar o gráfico.';
    return { answer: text || fallback, chart };
  }
  return { answer: chart?.points?.length ? `Aqui está o gráfico: ${chart.title}.` : 'Não consegui gerar o gráfico.', chart };
}

async function runAnalyst(key: string, persona: string, summary: string, history: any[], question: string) {
  const sys = `Você é ${persona}, o agente ANALISTA do app Konoha Fin. Responda em português do Brasil, curto e prático. Baseie-se SOMENTE nos dados abaixo; se não houver, diga que não tem essa informação. Nunca invente valores.\n\nDADOS:\n${summary}`;
  const m = await groqChat(key, [{ role: 'system', content: sys }, ...history, { role: 'user', content: question }]);
  return String(m.content ?? '').trim() || 'Não consegui analisar agora.';
}

async function runOperator(key: string, persona: string, supabase: SupabaseClient, userId: string, accounts: any[], categories: any[], question: string) {
  const sys = `Você é ${persona}, o agente OPERADOR do app Konoha Fin. Use as ferramentas para registrar o que o usuário pedir. Se faltar dado obrigatório, pergunte. Carteiras: ${accounts.map((a) => a.name).join(', ') || 'nenhuma'}. Categorias: ${categories.map((c) => c.name).join(', ') || 'nenhuma'}. Ao terminar, confirme em uma frase curta.`;
  const messages: any[] = [{ role: 'system', content: sys }, { role: 'user', content: question }];
  const actions: any[] = [];

  for (let i = 0; i < 4; i++) {
    const m = await groqChat(key, messages, TOOLS);
    if (m.tool_calls && m.tool_calls.length) {
      messages.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls });
      for (const tc of m.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        const r = await execTool(tc.function.name, args, supabase, userId, accounts, categories);
        actions.push({ tool: tc.function.name, ok: r.ok, message: r.message });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: r.message });
      }
      continue;
    }
    const text = String(m.content ?? '').trim();
    return { answer: text || (actions.length ? actions[actions.length - 1].message : 'Pronto.'), actions };
  }
  return { answer: actions.length ? actions[actions.length - 1].message : 'Concluído.', actions };
}

// ── Orquestração ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    const key = Deno.env.get('GROQ_API_KEY');
    if (!key) return json({ error: 'GROQ_API_KEY não configurada.' }, 500, req);

    const { question, history, agentName, mode, audio, mime } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr || !u.user) return json({ error: 'Não autenticado.' }, 401, req);

    // Transcrição de voz (não precisa de pergunta).
    if (mode === 'transcribe') {
      if (!audio || typeof audio !== 'string') return json({ error: 'Áudio ausente.' }, 400, req);
      const text = await transcribeAudio(key, audio, mime);
      return json({ text }, 200, req);
    }

    if (!question || typeof question !== 'string') return json({ error: 'Pergunta ausente.' }, 400, req);

    const persona = (agentName && String(agentName).trim()) || 'Konoha';
    const hist = (Array.isArray(history) ? history : [])
      .filter((m: any) => m && typeof m.text === 'string')
      .slice(-10)
      .map((m: any) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.text) }));

    const intent = await routeIntent(key, question);

    if (intent === 'acao') {
      const { accounts, categories } = await buildContext(supabase);
      const { answer, actions } = await runOperator(key, persona, supabase, u.user.id, accounts, categories, question);
      return json({ answer, agent: 'operador', actions }, 200, req);
    }

    const ctx = await buildContext(supabase);

    if (intent === 'grafico') {
      const { answer, chart } = await runChartAgent(key, persona, ctx.summaryText, ctx.datasets, question);
      return json({ answer, agent: 'grafico', chart, actions: [] }, 200, req);
    }

    const answer = await runAnalyst(key, persona, ctx.summaryText, hist, question);
    return json({ answer, agent: 'analista', actions: [] }, 200, req);
  } catch (e) {
    return json({ error: `LLM: ${String((e as any)?.message ?? e)}` }, 502, req);
  }
});
