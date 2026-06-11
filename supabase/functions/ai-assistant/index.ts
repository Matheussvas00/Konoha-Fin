// Supabase Edge Function — Assistente financeiro com Google Gemini.
//
// Deploy:
//   supabase functions deploy ai-assistant
//   supabase secrets set GEMINI_API_KEY=sua_chave_aqui
//
// A função usa o JWT do usuário (header Authorization) para ler os dados com
// RLS aplicada, monta um resumo financeiro do mês e pede ao Gemini uma resposta
// fundamentada na pergunta do usuário.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.0-flash';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  const label = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { start, end, label };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return json({ error: 'GEMINI_API_KEY não configurada na função.' }, 500);
    }

    const { question, history, agentName } = await req.json().catch(() => ({}));
    if (!question || typeof question !== 'string') {
      return json({ error: 'Pergunta ausente.' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Não autenticado.' }, 401);

    // ── Coleta de contexto financeiro (RLS já restringe ao usuário) ──────
    const { start, end, label } = monthRange();

    const [txRes, accRes, balRes, budRes, goalRes, catRes] = await Promise.all([
      supabase.from('transactions')
        .select('type, amount, status, category_id, date, description')
        .gte('date', start).lte('date', end),
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
    const catName = new Map((catRes.data ?? []).map((c: any) => [c.id, c.name]));

    const effected = txs.filter((t: any) => t.status === 'effected');
    const income = effected.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expense = effected.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

    // Gasto por categoria (despesas efetivadas)
    const byCat = new Map<string, number>();
    for (const t of effected) {
      if (t.type !== 'expense') continue;
      const name = catName.get(t.category_id) ?? 'Sem categoria';
      byCat.set(name, (byCat.get(name) ?? 0) + Number(t.amount));
    }
    const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const totalBalance = accounts.reduce((s: number, a: any) => s + (balances.get(a.id) ?? 0), 0);

    const lines: string[] = [];
    lines.push(`Mês de referência: ${label}.`);
    lines.push(`Saldo total das carteiras: ${brl(totalBalance)}.`);
    lines.push(`Entradas no mês: ${brl(income)}. Saídas no mês: ${brl(expense)}. Resultado: ${brl(income - expense)}.`);
    if (accounts.length) {
      lines.push('Carteiras: ' + accounts.map((a: any) => `${a.name} (${brl(balances.get(a.id) ?? 0)})`).join(', ') + '.');
    }
    if (topCats.length) {
      lines.push('Gastos por categoria no mês: ' + topCats.map(([n, v]) => `${n}: ${brl(v)}`).join(', ') + '.');
    }
    if (budgets.length) {
      lines.push('Orçamentos: ' + budgets.map((b: any) => {
        const name = catName.get(b.category_id) ?? 'Categoria';
        const spent = byCat.get(name) ?? 0;
        return `${name}: gasto ${brl(spent)} de ${brl(Number(b.amount))}`;
      }).join(', ') + '.');
    }
    if (goals.length) {
      lines.push('Metas: ' + goals.map((g: any) =>
        `${g.name}: ${brl(Number(g.current_amount))} de ${brl(Number(g.target_amount))}${g.is_completed ? ' (concluída)' : ''}`,
      ).join(', ') + '.');
    }

    const persona = (agentName && String(agentName).trim()) || 'Konoha';
    const systemText =
      `Você é ${persona}, um assistente financeiro pessoal dentro do app Konoha Fin. ` +
      `Responda em português do Brasil, de forma curta, clara e prática. ` +
      `Baseie-se SOMENTE nos dados financeiros fornecidos abaixo; se algo não estiver nos dados, diga que não tem essa informação. ` +
      `Use valores em reais e dê dicas acionáveis quando fizer sentido. Não invente números.\n\n` +
      `DADOS DO USUÁRIO:\n${lines.join('\n')}`;

    const contents = [
      ...(Array.isArray(history) ? history : [])
        .filter((m: any) => m && typeof m.text === 'string')
        .slice(-10)
        .map((m: any) => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: String(m.text) }],
        })),
      { role: 'user', parts: [{ text: question }] },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errTxt = await geminiRes.text();
      return json({ error: `Falha no Gemini: ${geminiRes.status}`, detail: errTxt }, 502);
    }

    const data = await geminiRes.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('').trim() ||
      'Não consegui gerar uma resposta agora.';

    return json({ answer });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
