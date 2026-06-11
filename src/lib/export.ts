import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TransactionRow, todayISO } from './transactions';

// ── Geração de CSV ─────────────────────────────────────────────────────
//
// Usamos ';' como separador (padrão de planilhas em pt-BR) e vírgula como
// separador decimal, evitando ambiguidade. Um BOM no início garante que o
// Excel abra os acentos corretamente.

const TYPE_LABEL: Record<string, string> = {
  income:   'Receita',
  expense:  'Despesa',
  transfer: 'Transferência',
};

function cell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transactionsToCSV(rows: TransactionRow[]): string {
  const header = [
    'Data', 'Descrição', 'Categoria', 'Conta', 'Destino',
    'Tipo', 'Valor', 'Status', 'Recorrência', 'Notas',
  ];

  const lines = [header.join(';')];

  for (const t of rows) {
    lines.push([
      t.date,
      t.description,
      t.category_name ?? '',
      t.account_name ?? '',
      t.to_account_name ?? '',
      TYPE_LABEL[t.type] ?? t.type,
      t.amount.toFixed(2).replace('.', ','),
      t.status === 'pending' ? 'Pendente' : 'Efetivado',
      t.recurrence ?? '',
      t.notes ?? '',
    ].map(cell).join(';'));
  }

  return '﻿' + lines.join('\r\n');
}

// ── Compartilhamento / download ────────────────────────────────────────

export type ExportResult = { shared: boolean; uri?: string };

/**
 * Exporta os lançamentos para CSV. No web faz download direto; no nativo grava
 * em cache e abre o share sheet (expo-sharing). Retorna `shared: false` quando
 * o compartilhamento não está disponível (arquivo gravado, mas não aberto).
 */
export async function exportTransactionsCSV(
  rows: TransactionRow[],
  filenameBase = 'lancamentos',
): Promise<ExportResult> {
  const csv = transactionsToCSV(rows);
  const filename = `${filenameBase}-${todayISO()}.csv`;

  if (Platform.OS === 'web') {
    const g = globalThis as any;
    const blob = new g.Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = g.URL.createObjectURL(blob);
    const a = g.document.createElement('a');
    a.href = url;
    a.download = filename;
    g.document.body.appendChild(a);
    a.click();
    a.remove();
    g.URL.revokeObjectURL(url);
    return { shared: true };
  }

  const file = new File(Paths.cache, filename);
  try {
    if (file.exists) file.delete();
  } catch {
    // ignora — segue para criar/escrever
  }
  file.create();
  file.write(csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Exportar lançamentos',
      UTI: 'public.comma-separated-values-text',
    });
    return { shared: true, uri: file.uri };
  }

  return { shared: false, uri: file.uri };
}
