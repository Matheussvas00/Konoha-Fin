import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDashboardData, DashboardData } from '../../lib/dashboard';
import {
  getCategoryBreakdown, getMonthlyEvolution,
  CategorySlice, MonthBar,
} from '../../lib/analytics';
import { CategoryBreakdown, MonthlyEvolution } from '../../components/DashboardCharts';
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS } from '../../lib/accounts';

// ── Helpers ────────────────────────────────────────────────────────────

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function firstName(full: string) {
  return full.split(' ')[0];
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ── Componentes auxiliares ─────────────────────────────────────────────

function SectionHeader({
  title, linkLabel, onPress,
}: { title: string; linkLabel?: string; onPress?: () => void }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {linkLabel && (
        <TouchableOpacity onPress={onPress}>
          <Text style={s.sectionLink}>{linkLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────

export default function InicioScreen() {
  const router = useRouter();

  const [data, setData]         = useState<DashboardData | null>(null);
  const [breakdown, setBreakdown] = useState<CategorySlice[]>([]);
  const [evolution, setEvolution] = useState<MonthBar[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  async function load(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true);
      const [result, cats, evo] = await Promise.all([
        getDashboardData(),
        getCategoryBreakdown('expense'),
        getMonthlyEvolution(6),
      ]);
      setData(result);
      setBreakdown(cats);
      setEvolution(evo);
    } catch (e) {
      // Garante dados vazios para não crashar com data === null
      setData({
        fullName: 'Ninja',
        totalBalance: 0,
        monthly: { income: 0, expense: 0 },
        topAccounts: [],
        recent: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);
  const onRefresh = useCallback(() => load(true), []);

  // ── Skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loadingRoot}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  const d = data!;
  const balanceDisplay = hideBalance ? '••••••' : formatBRL(d.totalBalance);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.greet}>{greeting()},</Text>
          <Text style={s.name}>{firstName(d.fullName)} 👋</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/perfil')} style={s.signOutBtn}>
          <Ionicons name="person-circle-outline" size={26} color="#e63946" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#e63946"
            colors={['#e63946']}
          />
        }
      >
        {/* ── Cartão saldo total ── */}
        <View style={s.balanceCard}>
          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>Saldo total</Text>
            <TouchableOpacity onPress={() => setHideBalance((v) => !v)}>
              <Ionicons
                name={hideBalance ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color="#aaa"
              />
            </TouchableOpacity>
          </View>
          <Text style={s.balanceValue}>{balanceDisplay}</Text>

          {/* Botões rápidos */}
          <View style={s.quickActions}>
            <TouchableOpacity
              style={[s.qaBtn, s.qaBtnIncome]}
              onPress={() => router.push('/(tabs)/lancamentos')}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={s.qaBtnTxt}>Receita</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.qaBtn, s.qaBtnExpense]}
              onPress={() => router.push('/(tabs)/lancamentos')}
            >
              <Ionicons name="remove-circle-outline" size={16} color="#fff" />
              <Text style={s.qaBtnTxt}>Despesa</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.qaBtn, s.qaBtnTransfer]}
              onPress={() => router.push('/(tabs)/lancamentos')}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color="#fff" />
              <Text style={s.qaBtnTxt}>Transferência</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Resumo do mês ── */}
        <View style={s.monthRow}>
          <View style={[s.monthCard, s.monthCardIncome]}>
            <View style={s.monthIcon}>
              <Ionicons name="arrow-down-circle-outline" size={20} color="#22c55e" />
            </View>
            <Text style={s.monthCardLabel}>Entradas</Text>
            <Text style={[s.monthCardValue, { color: '#22c55e' }]}>
              {hideBalance ? '••••' : formatBRL(d.monthly.income)}
            </Text>
          </View>

          <View style={[s.monthCard, s.monthCardExpense]}>
            <View style={s.monthIcon}>
              <Ionicons name="arrow-up-circle-outline" size={20} color="#f87171" />
            </View>
            <Text style={s.monthCardLabel}>Saídas</Text>
            <Text style={[s.monthCardValue, { color: '#f87171' }]}>
              {hideBalance ? '••••' : formatBRL(d.monthly.expense)}
            </Text>
          </View>
        </View>

        {/* ── Gráficos ── */}
        {!hideBalance && (
          <>
            <MonthlyEvolution data={evolution} />
            <CategoryBreakdown data={breakdown} />
          </>
        )}

        {/* ── Atalho Planejamento ── */}
        <TouchableOpacity
          style={s.planCard}
          onPress={() => router.push('/(tabs)/planejamento')}
          activeOpacity={0.85}
        >
          <View style={s.planIcon}>
            <Ionicons name="flag" size={20} color="#e63946" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.planTitle}>Metas e Orçamento</Text>
            <Text style={s.planSub}>Defina limites e objetivos de economia</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#555" />
        </TouchableOpacity>

        {/* ── Carteiras ── */}
        <SectionHeader
          title="Carteiras"
          linkLabel="Ver todas"
          onPress={() => router.push('/(tabs)/carteiras')}
        />

        {d.topAccounts.length === 0 ? (
          <TouchableOpacity
            style={s.emptyCard}
            onPress={() => router.push('/(tabs)/carteiras')}
          >
            <Ionicons name="wallet-outline" size={28} color="#555" />
            <Text style={s.emptyTxt}>Nenhuma carteira ainda</Text>
            <Text style={s.emptyLink}>Criar minha primeira →</Text>
          </TouchableOpacity>
        ) : (
          d.topAccounts.map((acc) => {
            const icon  = ACCOUNT_TYPE_ICONS[acc.type as any] ?? 'wallet-outline';
            const color = acc.color ?? ACCOUNT_TYPE_COLORS[acc.type as any] ?? '#555';
            return (
              <TouchableOpacity
                key={acc.id}
                style={s.accountRow}
                onPress={() => router.push('/(tabs)/carteiras')}
                activeOpacity={0.75}
              >
                <View style={[s.accountIcon, { backgroundColor: color + '22' }]}>
                  <Ionicons name={icon as any} size={20} color={color} />
                </View>
                <Text style={s.accountName} numberOfLines={1}>{acc.name}</Text>
                <Text style={[
                  s.accountBalance,
                  acc.balance < 0 && { color: '#f87171' },
                ]}>
                  {hideBalance ? '••••' : formatBRL(acc.balance)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Últimas transações ── */}
        <SectionHeader
          title="Últimas transações"
          linkLabel="Ver todas"
          onPress={() => router.push('/(tabs)/lancamentos')}
        />

        {d.recent.length === 0 ? (
          <TouchableOpacity
            style={s.emptyCard}
            onPress={() => router.push('/(tabs)/lancamentos')}
          >
            <Ionicons name="receipt-outline" size={28} color="#555" />
            <Text style={s.emptyTxt}>Nenhum lançamento este mês</Text>
            <Text style={s.emptyLink}>Adicionar primeiro →</Text>
          </TouchableOpacity>
        ) : (
          d.recent.map((tx) => {
            const isIncome   = tx.type === 'income';
            const isTransfer = tx.type === 'transfer';
            const sign       = isIncome ? '+' : isTransfer ? '' : '-';
            const valueColor = isIncome ? '#22c55e' : isTransfer ? '#60a5fa' : '#f87171';
            const txIcon     = isIncome
              ? 'arrow-down-circle-outline'
              : isTransfer
              ? 'swap-horizontal-outline'
              : 'arrow-up-circle-outline';
            const iconColor  = isIncome ? '#22c55e' : isTransfer ? '#60a5fa' : '#f87171';

            return (
              <View key={tx.id} style={s.txRow}>
                <View style={[s.txIcon, { backgroundColor: iconColor + '18' }]}>
                  <Ionicons name={txIcon as any} size={18} color={iconColor} />
                </View>
                <View style={s.txInfo}>
                  <Text style={s.txDesc} numberOfLines={1}>{tx.description}</Text>
                  <Text style={s.txMeta}>
                    {tx.category ?? tx.account ?? '—'}
                    {' · '}
                    {fmtDate(tx.date)}
                  </Text>
                </View>
                <Text style={[s.txAmount, { color: valueColor }]}>
                  {hideBalance ? '••••' : `${sign}${formatBRL(tx.amount)}`}
                </Text>
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f0f1e',
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 16,
    marginTop: 16,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(230,57,70,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  planSub: { color: '#666', fontSize: 12, marginTop: 2 },
  loadingRoot: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    backgroundColor: '#1a1a2e',
    paddingTop: 56,
    paddingBottom: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  greet: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  signOutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(230,57,70,0.1)',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  // Saldo
  balanceCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 22,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  balanceLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  qaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
  },
  qaBtnIncome:   { backgroundColor: '#16a34a' },
  qaBtnExpense:  { backgroundColor: '#dc2626' },
  qaBtnTransfer: { backgroundColor: '#2563eb' },
  qaBtnTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Resumo mensal
  monthRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  monthCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  monthCardIncome: {
    backgroundColor: 'rgba(34,197,94,0.07)',
    borderColor: 'rgba(34,197,94,0.2)',
  },
  monthCardExpense: {
    backgroundColor: 'rgba(248,113,113,0.07)',
    borderColor: 'rgba(248,113,113,0.2)',
  },
  monthIcon: {
    marginBottom: 8,
  },
  monthCardLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  monthCardValue: {
    fontSize: 17,
    fontWeight: '800',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionLink: {
    color: '#e63946',
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderStyle: 'dashed',
    paddingVertical: 28,
    marginBottom: 24,
    gap: 6,
  },
  emptyTxt: {
    color: '#555',
    fontSize: 14,
  },
  emptyLink: {
    color: '#e63946',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },

  // Conta row
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  accountBalance: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Transação row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txDesc: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  txMeta: {
    color: '#666',
    fontSize: 12,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
