// Supabase Edge Function — Assistente financeiro MULTIAGENTE com Google Gemini.
//
// Arquitetura (sistema multiagente):
//   1) ROTEADOR  — classifica a mensagem do usuário em "analise" ou "acao".
//   2) ANALISTA  — agente somente-leitura: relatórios, análises e insights a
//                  partir de um resumo financeiro do mês.
//   3) OPERADOR  — agente com ferramentas (function calling) que GRAVA dados:
//                  lançamentos, categorias, carteiras, orçamentos e metas.
//
// Deploy:
//   supabase functions deploy ai-assistant
//   supabase secrets set GEMINI_API_KEY=sua_chave
//
// O JWT do usuário (header Authorization) garante RLS em todas as operações.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    start: new Date(y, m, 1).toISOString().slice(0, 10),
    end: new Date(y, m + 1, 0).toISOString().slice(0, 10),
    label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
}

// ── Chamada genérica ao Gemini ──────────────────────────────────────────

type GeminiPart = { text?: string; functionCall?: { name: string; args: any }; functionResponse?: any };
type GeminiContent = { role: 'user' | 'model' | 'function'; parts: GeminiPart[] };

async function callGemini(
  key: string,
  systemText: string,
  contents: GeminiContent[],
  tools?: any[],
): Promise<GeminiPart[]> {
  const body: any = {
    system_instruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  };
  if (tools) {
    body.tools = tools;
    body.tool_config = { function_calling_config: { mode: 'AUTO' } };
  }

  const res = await fetch(GEMINI_URL(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts ?? [];
}

function partsText(parts: GeminiPart[]): string {
  return parts.filter((p) => p.text).map((p) => p.text).join('').trim();
}

// ── Coleta de contexto financeiro ───────────────────────────────────────

async function buildContext(supabase: SupabaseClient) {
  const { start, end, label } = monthRange();
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
  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totalBalance = accounts.reduce((s: number, a: any) => s + (balances.get(a.id) ?? 0), 0);

  const summary: string[] = [];
  summary.push(`Mês de referência: ${label}.`);
  summary.push(`Saldo total: ${brl(totalBalance)}. Entradas: ${brl(income)}. Saídas: ${brl(expense)}. Resultado: ${brl(income - expense)}.`);
  if (accounts.length) summary.push('Carteiras: ' + accounts.map((a: any) => `${a.name} (${brl(balances.get(a.id) ?? 0)})`).join(', ') + '.');
  if (topCats.length) summary.push('Gastos por categoria: ' + topCats.map(([n, v]) => `${n}: ${brl(v)}`).join(', ') + '.');
  if (budgets.length) summary.push('Orçamentos: ' + budgets.map((b: any) => `${catName.get(b.category_id) ?? 'Categoria'}: gasto ${brl(byCat.get(catName.get(b.category_id)) ?? 0)} de ${brl(Number(b.amount))}`).join(', ') + '.');
  if (goals.length) summary.push('Metas: ' + goals.map((g: any) => `${g.name}: ${brl(Number(g.current_amount))}/${brl(Number(g.target_amount))}${g.is_completed ? ' (concluída)' : ''}`).join(', ') + '.');

  return {
    summaryText: summary.join('\n'),
    accounts: accounts as any[],
    categories: cats as any[],
  };
}

// ── Agente 1: ROTEADOR ──────────────────────────────────────────────────

async function routeIntent(key: string, question: string): Promise<'analise' | 'acao'> {
  const sys =
    'Você é um roteador de um sistema financeiro multiagente. Classifique a mensagem do usuário em UMA palavra: ' +
    '"acao" se ele quer CRIAR/REGISTRAR/SALVAR algo (lançamento, despesa, receita, transferência, categoria, carteira, orçamento, meta); ' +
    '"analise" se ele quer relatório, análise, consulta, dica ou conversa. Responda SOMENTE com "acao" ou "analise".';
  const parts = await callGemini(key, sys, [{ role: 'user', parts: [{ text: question }] }]);
  const label = partsText(parts).toLowerCase();
  return label.includes('acao') || label.includes('ação') ? 'acao' : 'analise';
}

// ── Agente 2: ANALISTA (somente leitura) ────────────────────────────────

async function runAnalyst(
  key: string, persona: string, summaryText: string,
  history: GeminiContent[], question: string,
): Promise<string> {
  const sys =
    `Você é ${persona}, o agente ANALISTA do app Konoha Fin. Responda em português do Brasil, ` +
    `de forma curta, clara e prática. Baseie-se SOMENTE nos dados abaixo; se não houver o dado, diga que não tem essa informação. ` +
    `Não invente números. Dê dicas acionáveis quando fizer sentido.\n\nDADOS:\n${summaryText}`;
  const parts = await callGemini(key, sys, [...history, { role: 'user', parts: [{ text: question }] }]);
  return partsText(parts) || 'Não consegui gerar uma análise agora.';
}

// ── Agente 3: OPERADOR (com ferramentas de escrita) ─────────────────────

const operatorTools = [{
  function_declarations: [
    {
      name: 'criar_lancamento',
      description: 'Cria um lançamento (receita, despesa ou transferência).',
      parameters: {
        type: 'OBJECT',
        properties: {
          tipo: { type: 'STRING', enum: ['income', 'expense', 'transfer'] },
          descricao: { type: 'STRING' },
          valor: { type: 'NUMBER', description: 'valor positivo em reais' },
          conta: { type: 'STRING', description: 'nome da carteira de origem' },
          categoria: { type: 'STRING', description: 'nome da categoria (opcional)' },
          conta_destino: { type: 'STRING', description: 'apenas para transferência' },
          data: { type: 'STRING', description: 'YYYY-MM-DD; se omitido, hoje' },
        },
        required: ['tipo', 'descricao', 'valor', 'conta'],
      },
    },
    {
      name: 'criar_categoria',
      description: 'Cria uma nova categoria.',
      parameters: {
        type: 'OBJECT',
        properties: {
          nome: { type: 'STRING' },
          tipo: { type: 'STRING', enum: ['income', 'expense'] },
        },
        required: ['nome', 'tipo'],
      },
    },
    {
      name: 'criar_carteira',
      description: 'Cria uma nova carteira/conta.',
      parameters: {
        type: 'OBJECT',
        properties: {
          nome: { type: 'STRING' },
          tipo: { type: 'STRING', enum: ['checking', 'savings', 'cash', 'credit_card', 'investment', 'other'] },
          saldo_inicial: { type: 'NUMBER' },
        },
        required: ['nome', 'tipo'],
      },
    },
    {
      name: 'criar_meta',
      description: 'Cria uma meta de economia.',
      parameters: {
        type: 'OBJECT',
        properties: {
          nome: { type: 'STRING' },
          valor_alvo: { type: 'NUMBER' },
          valor_inicial: { type: 'NUMBER' },
        },
        required: ['nome', 'valor_alvo'],
      },
    },
  ],
}];

function findByName<T extends { name: string }>(list: T[], name?: string): T | undefined {
  if (!name) return undefined;
  const q = name.trim().toLowerCase();
  return list.find((x) => x.name.toLowerCase() === q) ?? list.find((x) => x.name.toLowerCase().includes(q));
}

async function execTool(
  name: string, args: any, supabase: SupabaseClient, userId: string,
  accounts: any[], categories: any[],
): Promise<{ ok: boolean; message: string }> {
  try {
    if (name === 'criar_lancamento') {
      const acc = findByName(accounts, args.conta);
      if (!acc) return { ok: false, message: `Carteira "${args.conta}" não encontrada. Disponíveis: ${accounts.map((a) => a.name).join(', ') || 'nenhuma'}.` };
      const cat = findByName(categories, args.categoria);
      const toAcc = args.tipo === 'transfer' ? findByName(accounts, args.conta_destino) : undefined;
      if (args.tipo === 'transfer' && !toAcc) return { ok: false, message: 'Transferência precisa de uma conta de destino válida.' };
      const valor = Number(args.valor);
      if (!valor || valor <= 0) return { ok: false, message: 'Valor inválido.' };

      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        account_id: acc.id,
        to_account_id: toAcc?.id ?? null,
        category_id: cat?.id ?? null,
        type: args.tipo,
        status: 'effected',
        description: String(args.descricao ?? '').trim() || 'Lançamento',
        amount: valor,
        date: args.data || todayISO(),
      });
      if (error) throw error;
      return { ok: true, message: `Lançamento criado: ${args.descricao} (${brl(valor)}) em ${acc.name}.` };
    }

    if (name === 'criar_categoria') {
      const { data, error } = await supabase.from('categories').insert({
        user_id: userId, name: String(args.nome).trim(), type: args.tipo,
        icon: 'ellipsis-horizontal-outline',
      }).select().single();
      if (error) throw error;
      categories.push(data);
      return { ok: true, message: `Categoria "${args.nome}" (${args.tipo === 'income' ? 'receita' : 'despesa'}) criada.` };
    }

    if (name === 'criar_carteira') {
      const { data, error } = await supabase.from('accounts').insert({
        user_id: userId, name: String(args.nome).trim(), type: args.tipo,
        initial_balance: Number(args.saldo_inicial ?? 0), currency: 'BRL',
      }).select().single();
      if (error) throw error;
      accounts.push(data);
      return { ok: true, message: `Carteira "${args.nome}" criada com saldo ${brl(Number(args.saldo_inicial ?? 0))}.` };
    }

    if (name === 'criar_meta') {
      const { error } = await supabase.from('goals').insert({
        user_id: userId, name: String(args.nome).trim(),
        target_amount: Number(args.valor_alvo), current_amount: Number(args.valor_inicial ?? 0),
      });
      if (error) throw error;
      return { ok: true, message: `Meta "${args.nome}" criada (alvo ${brl(Number(args.valor_alvo))}).` };
    }

    return { ok: false, message: `Ferramenta desconhecida: ${name}.` };
  } catch (e) {
    return { ok: false, message: `Erro ao executar ${name}: ${String((e as any)?.message ?? e)}` };
  }
}

async function runOperator(
  key: string, persona: string, supabase: SupabaseClient, userId: string,
  accounts: any[], categories: any[], question: string,
): Promise<{ answer: string; actions: { tool: string; ok: boolean; message: string }[] }> {
  const sys =
    `Você é ${persona}, o agente OPERADOR do app Konoha Fin. Sua função é REGISTRAR dados a pedido do usuário ` +
    `usando as ferramentas disponíveis. Em português do Brasil. ` +
    `Carteiras existentes: ${accounts.map((a) => a.name).join(', ') || 'nenhuma'}. ` +
    `Categorias existentes: ${categories.map((c) => c.name).join(', ') || 'nenhuma'}. ` +
    `Se faltar uma informação obrigatória, pergunte de forma objetiva em vez de chamar a ferramenta. ` +
    `Após registrar, confirme em uma frase curta o que foi feito.`;

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: question }] }];
  const actions: { tool: string; ok: boolean; message: string }[] = [];

  for (let step = 0; step < 5; step++) {
    const parts = await callGemini(key, sys, contents, operatorTools);
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      return { answer: partsText(parts) || 'Pronto.', actions };
    }

    // registra a vez do modelo (com as chamadas) e executa cada ferramenta
    contents.push({ role: 'model', parts });
    const responseParts: GeminiPart[] = [];
    for (const c of calls) {
      const fc = c.functionCall!;
      const result = await execTool(fc.name, fc.args ?? {}, supabase, userId, accounts, categories);
      actions.push({ tool: fc.name, ok: result.ok, message: result.message });
      responseParts.push({ functionResponse: { name: fc.name, response: { result: result.message, ok: result.ok } } });
    }
    contents.push({ role: 'function', parts: responseParts });
  }

  // fallback: pede um fechamento textual
  const closing = await callGemini(key, sys, contents);
  return { answer: partsText(closing) || actions.map((a) => a.message).join('\n') || 'Concluído.', actions };
}

// ── Orquestração ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

    const { question, history, agentName } = await req.json().catch(() => ({}));
    if (!question || typeof question !== 'string') return json({ error: 'Pergunta ausente.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Não autenticado.' }, 401);
    const userId = userData.user.id;

    const persona = (agentName && String(agentName).trim()) || 'Konoha';

    const histContents: GeminiContent[] = (Array.isArray(history) ? history : [])
      .filter((m: any) => m && typeof m.text === 'string')
      .slice(-10)
      .map((m: any) => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: String(m.text) }] }));

    // Agente 1 — Roteador
    const intent = await routeIntent(key, question);

    if (intent === 'acao') {
      const { accounts, categories } = await buildContext(supabase);
      const { answer, actions } = await runOperator(key, persona, supabase, userId, accounts, categories, question);
      return json({ answer, agent: 'operador', actions });
    }

    // Agente 2 — Analista
    const { summaryText } = await buildContext(supabase);
    const answer = await runAnalyst(key, persona, summaryText, histContents, question);
    return json({ answer, agent: 'analista', actions: [] });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
