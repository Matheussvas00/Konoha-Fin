import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategorySlice, MonthBar, PaymentSlice } from '../lib/analytics';
import { colors, spacing, radius, font, alpha } from '../lib/theme';

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Despesas por categoria (barras horizontais) ────────────────────────
export function CategoryBreakdown({ data }: { data: CategorySlice[] }) {
  if (data.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.title}>Despesas por categoria</Text>
        <Text style={s.empty}>Sem despesas neste mês ainda.</Text>
      </View>
    );
  }

  const total = data.reduce((sum, c) => sum + c.total, 0);
  const top = data.slice(0, 6);

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>Despesas por categoria</Text>
        <Text style={s.totalTxt}>{formatBRL(total)}</Text>
      </View>

      <View style={{ gap: 12, marginTop: 4 }}>
        {top.map((c) => (
          <View key={c.name} style={s.catRow}>
            <View style={s.catTop}>
              <View style={s.catLabelWrap}>
                <View style={[s.dot, { backgroundColor: c.color }]} />
                <Text style={s.catName} numberOfLines={1}>{c.name}</Text>
              </View>
              <Text style={s.catValue}>{formatBRL(c.total)}</Text>
            </View>
            <View style={s.track}>
              <View
                style={[s.fill, { width: `${Math.max(c.pct, 2)}%`, backgroundColor: c.color }]}
              />
            </View>
            <Text style={s.catPct}>{c.pct.toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Despesas por forma de pagamento (barras horizontais, monocromático) ─
export function PaymentBreakdown({ data }: { data: PaymentSlice[] }) {
  if (data.length === 0) return null;

  const total = data.reduce((sum, p) => sum + p.total, 0);

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>Gastos por forma de pagamento</Text>
        <Text style={s.totalTxt}>{formatBRL(total)}</Text>
      </View>

      <View style={{ gap: 12, marginTop: 4 }}>
        {data.map((p) => (
          <View key={p.key} style={s.catRow}>
            <View style={s.catTop}>
              <View style={s.catLabelWrap}>
                <Ionicons name={p.icon as any} size={14} color={colors.textMuted} />
                <Text style={s.catName} numberOfLines={1}>{p.label}</Text>
              </View>
              <Text style={s.catValue}>{formatBRL(p.total)}</Text>
            </View>
            <View style={s.track}>
              <View
                style={[s.fill, { width: `${Math.max(p.pct, 2)}%`, backgroundColor: colors.text }]}
              />
            </View>
            <Text style={s.catPct}>{p.pct.toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Evolução mensal (barras verticais agrupadas) ───────────────────────
export function MonthlyEvolution({ data }: { data: MonthBar[] }) {
  const maxVal = Math.max(
    1,
    ...data.map((m) => Math.max(m.income, m.expense))
  );
  const hasData = data.some((m) => m.income > 0 || m.expense > 0);

  return (
    <View style={s.card}>
      <Text style={s.title}>Evolução mensal</Text>

      {!hasData ? (
        <Text style={s.empty}>Sem movimentações nos últimos meses.</Text>
      ) : (
        <>
          <View style={s.chart}>
            {data.map((m) => {
              const incomeH  = (m.income  / maxVal) * 100;
              const expenseH = (m.expense / maxVal) * 100;
              return (
                <View key={m.key} style={s.col}>
                  <View style={s.bars}>
                    <View style={s.barSlot}>
                      <View style={[s.bar, s.barIncome, { height: `${Math.max(incomeH, 1)}%` }]} />
                    </View>
                    <View style={s.barSlot}>
                      <View style={[s.bar, s.barExpense, { height: `${Math.max(expenseH, 1)}%` }]} />
                    </View>
                  </View>
                  <Text style={s.colLabel}>{m.label}</Text>
                </View>
              );
            })}
          </View>

          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: colors.income }]} />
              <Text style={s.legendTxt}>Entradas</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: colors.expense }]} />
              <Text style={s.legendTxt}>Saídas</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  totalTxt: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    color: colors.textFaint,
    fontSize: 13,
    marginTop: 10,
  },

  // Categorias
  catRow: { gap: 5 },
  catTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    paddingRight: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  catName: { color: colors.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  catValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  catPct: { color: colors.textFaint, fontSize: 11, fontWeight: '600', alignSelf: 'flex-end' },

  // Evolução
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 130,
    marginTop: 14,
  },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    height: 110,
  },
  barSlot: {
    width: 9,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  barIncome:  { backgroundColor: colors.income },
  barExpense: { backgroundColor: colors.expense },
  colLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  legendTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
