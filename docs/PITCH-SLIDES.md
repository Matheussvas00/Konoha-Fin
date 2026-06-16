# Roteiro de slides — Konoha Fin · IA Multiagente

Sugestão de 8 slides (~5 min). Texto enxuto; fale o resto.

---

### Slide 1 — Capa
**Konoha Fin — Assistente financeiro multiagente**
Subtítulo: "Conversar com o dinheiro: analisar e registrar por linguagem natural"
Seu nome · disciplina · data.

### Slide 2 — Problema
- Apps de finanças exigem navegar telas e preencher formulários.
- Resultado: as pessoas desistem de lançar gastos e não analisam os dados.

### Slide 3 — Solução
- Um assistente conversacional dentro do app.
- **Sistema multiagente**: o sistema decide quem atende — quem **analisa** ou quem **executa**.
- Usa os **dados reais** do usuário (sem inventar números).

### Slide 4 — Arquitetura (diagrama)
Coordenador → delega para **Analista** (leitura) ou **Operador** (escrita).
(Use o diagrama de blocos do `PITCH-IA.md`, seção 3.)

### Slide 5 — Os 3 agentes
- **Coordenador (roteador):** classifica e delega.
- **Analista (leitura):** relatórios, análises, dicas.
- **Operador (escrita):** cria lançamentos/categorias/carteiras/metas via _function calling_.
Frase-chave: *separar ler de escrever = menos erro e mais segurança.*

### Slide 6 — Como funciona (fluxo)
Use o **diagrama de sequência** do `PITCH-IA.md` (seção 4.1).
Destaque: o LLM **pede** a ferramenta; o servidor **executa** no banco com **RLS**.

### Slide 7 — Demo ao vivo (roteiro)
1. "Como foram meus gastos este mês?" → responde o **Analista**.
2. "Lance R$ 50 no mercado pela carteira Nubank" → **Operador** cria e confirma.
3. Abre **Lançamentos** e mostra a despesa criada pela IA.
4. Troca o nome do agente no **Perfil**.

### Slide 8 — Tecnologia & evolução
- **Google ADK + Gemini** (Python), **FastAPI**, **Supabase (Postgres + RLS)**, **React Native**.
- Próximos passos: 4º agente **Auditor** (human-in-the-loop), **streaming**, e expor as ferramentas como **servidor MCP**.

---

> Dica de fala: enfatize "**multiagente de verdade**" — não é um chatbot só de
> perguntas; ele **age** (registra dados) com segurança (RLS + ferramentas tipadas)
> e com **especialização** entre agentes.
