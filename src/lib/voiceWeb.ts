// Voz via APIs do navegador (Web Speech). Tudo protegido: fora do navegador
// (app nativo) as funções viram no-op e os "available" retornam false, então a
// tela esconde os botões. Sem dependências novas.

export type DictationHandle = { stop: () => void };

function w(): any {
  return typeof window !== 'undefined' ? (window as any) : null;
}

// ── Reconhecimento de fala (voz → texto) ────────────────────────────────

export function speechToTextAvailable(): boolean {
  const g = w();
  return !!g && (!!g.SpeechRecognition || !!g.webkitSpeechRecognition);
}

/**
 * Inicia o ditado. Chama onText com a frase reconhecida e onEnd ao terminar
 * (ou erro). Retorna um handle para parar manualmente, ou null se indisponível.
 */
export function startDictation(
  onText: (text: string) => void,
  onEnd: () => void,
): DictationHandle | null {
  const g = w();
  if (!g) return null;
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = 'pt-BR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  rec.onresult = (e: any) => {
    const text = e?.results?.[0]?.[0]?.transcript ?? '';
    if (text) onText(text);
  };
  rec.onerror = () => onEnd();
  rec.onend = () => onEnd();

  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}

// ── Síntese de fala (texto → voz) ───────────────────────────────────────

export function textToSpeechAvailable(): boolean {
  const g = w();
  return !!g && 'speechSynthesis' in g;
}

export function speak(text: string) {
  const g = w();
  if (!g || !('speechSynthesis' in g)) return;
  try {
    const u = new g.SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 1;
    g.speechSynthesis.cancel();
    g.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
}

export function stopSpeaking() {
  const g = w();
  if (g && 'speechSynthesis' in g) {
    try { g.speechSynthesis.cancel(); } catch { /* noop */ }
  }
}
