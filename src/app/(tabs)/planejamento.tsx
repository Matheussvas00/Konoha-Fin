import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, ScrollView, ActivityIndicator,
  Alert, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BudgetProgress, listBudgetsWithProgress, upsertBudget, deleteBudget,
  getBudgetedCategoryIds,
} from '../../lib/budgets';
import {
  Goal, listGoals, createGoal, contributeGoal, deleteGoal,
  goalProgress, GOAL_COLORS, GOAL_ICONS,
} from '../../lib/goals';
import { Category, listCategoriesByType } from '../../lib/categories';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';

// ── Helpers ───────────────────────────────────────────────────────────
function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function parseInput(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
}

type Tab = 'budgets' | 'goals';

// ════════════════════════════════════════════════════════════════════
export default function PlanejamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('budgets');
  const [search, setSearch] = useState('');

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Planejamento</Text>
        <View style={s.iconBtn} />
      </View>

      {/* Abas */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'budgets' && s.tabActive]}
          onPress={() => setTab('budgets')}
        >
          <Ionicons name="pie-chart-outline" size={16}
            color={tab === 'budgets' ? colors.brandText : colors.textMuted} />
          <Text style={[s.tabTxt, tab === 'budgets' && s.tabTxtActive]}>Orçamentos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'goals' && s.tabActive]}
          onPress={() => setTab('goals')}
        >
          <Ionicons name="flag-outline" size={16}
            color={tab === 'goals' ? colors.brandText : colors.textMuted} />
          <Text style={[s.tabTxt, tab === 'goals' && s.tabTxtActive]}>Metas</Text>
        </TouchableOpacity>
      </View>

      {/* Busca */}
      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar..."
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {tab === 'budgets' ? <BudgetsTab search={search} /> : <GoalsTab search={search} />}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
// ABA ORÇAMENTOS
// ════════════════════════════════════════════════════════════════════
function BudgetsTab({ search }: { search: string }) {
  const [items, setItems]     = useState<BudgetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modal, setModal]       = useState(false);
  const [cats, setCats]         = useState<Category[]>([]);
  const [pickedCat, setPickedCat] = useState<string | null>(null);
  const [amount, setAmount]     = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      setItems(await listBudgetsWithProgress());
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openModal() {
    setPickedCat(null);
    setAmount('');
    try {
      const [all, used] = await Promise.all([
        listCategoriesByType('expense'),
        getBudgetedCategoryIds(),
      ]);
      const usedSet = new Set(used);
      setCats(all.filter((c) => !usedSet.has(c.id)));
    } catch {
      setCats([]);
    }
    setModal(true);
  }

  async function handleSave() {
    if (!pickedCat) { Alert.alert('Atenção', 'Escolha uma categoria.'); return; }
    const value = parseInput(amount);
    if (value <= 0) { Alert.alert('Atenção', 'Informe um valor maior que zero.'); return; }
    setSaving(true);
    try {
      await upsertBudget(pickedCat, value);
      setModal(false);
      await load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(b: BudgetProgress) {
    Alert.alert('Remover orçamento', `Remover o limite de "${b.categoryName}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          try { await deleteBudget(b.id); await load(); }
          catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  const totalLimit = items.reduce((s, b) => s + b.amount, 0);
  const totalSpent = items.reduce((s, b) => s + b.spent, 0);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((b) => b.categoryName.toLowerCase().includes(q))
    : items;

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.text} /></View>;
  }

  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        onRefresh={() => { setRefreshing(true); load(true); }}
        refreshing={refreshing}
        contentContainerStyle={filtered.length === 0 ? s.listEmpty : s.listContent}
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={s.summaryCard}>
              <View style={s.summaryCol}>
                <Text style={s.summaryLabel}>Gasto / Limite do mês</Text>
                <Text style={s.summaryValue}>
                  {formatBRL(totalSpent)} <Text style={s.summaryOf}>/ {formatBRL(totalLimit)}</Text>
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>🎯</Text>
            <Text style={s.emptyTitle}>Nenhum orçamento</Text>
            <Text style={s.emptySub}>
              Defina limites de gasto por categoria{'\n'}e acompanhe o quanto já usou no mês.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <View style={s.catLabelWrap}>
                <View style={[s.iconWrap, { backgroundColor: item.categoryColor + '25' }]}>
                  <Ionicons name={item.categoryIcon as any} size={18} color={item.categoryColor} />
                </View>
                <Text style={s.cardName} numberOfLines={1}>{item.categoryName}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={10}>
                <Ionicons name="trash-outline" size={18} color={colors.expense} />
              </TouchableOpacity>
            </View>

            <View style={s.track}>
              <View style={[
                s.fill,
                {
                  width: `${Math.min(item.pct, 100)}%`,
                  backgroundColor: item.over ? colors.expense : item.categoryColor,
                },
              ]} />
            </View>

            <View style={s.cardBottom}>
              <Text style={[s.spentTxt, item.over && { color: colors.expense }]}>
                {formatBRL(item.spent)} de {formatBRL(item.amount)}
              </Text>
              <Text style={[s.remainTxt, item.over && { color: colors.expense }]}>
                {item.over
                  ? `Excedeu ${formatBRL(Math.abs(item.remaining))}`
                  : `Resta ${formatBRL(item.remaining)}`}
              </Text>
            </View>
          </View>
        )}
      />

      <TouchableOpacity style={s.fab} onPress={openModal} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color={colors.brandText} />
      </TouchableOpacity>

      {/* Modal novo orçamento */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <Pressable style={s.overlay} onPress={() => setModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.sheet}
        >
          <View style={s.sheetHandle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.sheetTitle}>Novo orçamento</Text>

            <Text style={s.fieldLabel}>Categoria de despesa</Text>
            {cats.length === 0 ? (
              <Text style={s.hint}>
                Todas as categorias já têm orçamento — ou você ainda não criou categorias de despesa.
              </Text>
            ) : (
              <View style={s.catGrid}>
                {cats.map((c) => {
                  const active = pickedCat === c.id;
                  const col = c.color ?? '#64748b';
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.catChip, active && { backgroundColor: col, borderColor: col }]}
                      onPress={() => setPickedCat(c.id)}
                    >
                      <Ionicons name={(c.icon ?? 'pricetag-outline') as any}
                        size={14} color={active ? colors.text : col} />
                      <Text style={[s.catChipTxt, active && { color: colors.text }]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={s.fieldLabel}>Limite mensal (R$)</Text>
            <TextInput
              style={s.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.placeholder}
            />

            <View style={s.btnRow}>
              <TouchableOpacity style={s.btnCancel} onPress={() => setModal(false)}>
                <Text style={s.btnCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSave, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.brandText} /> : <Text style={s.btnSaveTxt}>Salvar</Text>}
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// ABA METAS
// ════════════════════════════════════════════════════════════════════
function GoalsTab({ search }: { search: string }) {
  const [goals, setGoals]     = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modal, setModal]   = useState(false);
  const [name, setName]     = useState('');
  const [target, setTarget] = useState('');
  const [initial, setInitial] = useState('');
  const [color, setColor]   = useState(GOAL_COLORS[0]);
  const [icon, setIcon]     = useState(GOAL_ICONS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      setGoals(await listGoals());
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal() {
    setName(''); setTarget(''); setInitial('');
    setColor(GOAL_COLORS[0]); setIcon(GOAL_ICONS[0]);
    setModal(true);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Atenção', 'Dê um nome à meta.'); return; }
    const t = parseInput(target);
    if (t <= 0) { Alert.alert('Atenção', 'Informe um valor alvo.'); return; }
    setSaving(true);
    try {
      await createGoal({
        name: name.trim(),
        target_amount: t,
        current_amount: parseInput(initial),
        color, icon,
      });
      setModal(false);
      await load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  }

  function promptContribute(goal: Goal, sign: 1 | -1) {
    Alert.prompt?.(
      sign === 1 ? 'Adicionar aporte' : 'Retirar valor',
      `Meta: ${goal.name}`,
      async (txt?: string) => {
        const v = parseInput(txt ?? '');
        if (v <= 0) return;
        try {
          await contributeGoal(goal, sign * v);
          await load();
        } catch (e: any) { Alert.alert('Erro', e.message); }
      },
      'plain-text', '', 'decimal-pad'
    );
    // Fallback Android (Alert.prompt só existe no iOS): incrementa rápido
    if (Platform.OS !== 'ios') {
      Alert.alert(
        sign === 1 ? 'Adicionar aporte' : 'Retirar valor',
        'Escolha um valor rápido:',
        [
          { text: 'Cancelar', style: 'cancel' },
          ...[50, 100, 500].map((v) => ({
            text: `R$ ${v}`,
            onPress: async () => {
              try { await contributeGoal(goal, sign * v); await load(); }
              catch (e: any) { Alert.alert('Erro', e.message); }
            },
          })),
        ]
      );
    }
  }

  function confirmDelete(goal: Goal) {
    Alert.alert('Excluir meta', `Excluir "${goal.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try { await deleteGoal(goal.id); await load(); }
          catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? goals.filter((g) => g.name.toLowerCase().includes(q))
    : goals;

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.text} /></View>;
  }

  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        onRefresh={() => { setRefreshing(true); load(true); }}
        refreshing={refreshing}
        contentContainerStyle={filtered.length === 0 ? s.listEmpty : s.listContent}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>🏆</Text>
            <Text style={s.emptyTitle}>Nenhuma meta</Text>
            <Text style={s.emptySub}>
              Crie objetivos de economia{'\n'}e acompanhe seu progresso.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const pct = goalProgress(item);
          const col = item.color ?? colors.brand;
          return (
            <View style={[s.card, item.is_completed && { borderColor: col }]}>
              <View style={s.cardTop}>
                <View style={s.catLabelWrap}>
                  <View style={[s.iconWrap, { backgroundColor: col + '25' }]}>
                    <Ionicons name={(item.icon ?? 'trophy-outline') as any} size={18} color={col} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                    {item.is_completed && <Text style={s.doneTxt}>Concluída 🎉</Text>}
                  </View>
                </View>
                <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.expense} />
                </TouchableOpacity>
              </View>

              <View style={s.track}>
                <View style={[s.fill, { width: `${pct}%`, backgroundColor: col }]} />
              </View>

              <View style={s.cardBottom}>
                <Text style={s.spentTxt}>
                  {formatBRL(item.current_amount)} <Text style={s.summaryOf}>de {formatBRL(item.target_amount)}</Text>
                </Text>
                <Text style={[s.remainTxt, { color: col }]}>{pct.toFixed(0)}%</Text>
              </View>

              {!item.is_completed && (
                <View style={s.goalActions}>
                  <TouchableOpacity style={s.goalBtn} onPress={() => promptContribute(item, 1)}>
                    <Ionicons name="add" size={16} color={colors.income} />
                    <Text style={[s.goalBtnTxt, { color: colors.income }]}>Aportar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.goalBtn} onPress={() => promptContribute(item, -1)}>
                    <Ionicons name="remove" size={16} color={colors.expense} />
                    <Text style={[s.goalBtnTxt, { color: colors.expense }]}>Retirar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      <TouchableOpacity style={s.fab} onPress={openModal} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color={colors.brandText} />
      </TouchableOpacity>

      {/* Modal nova meta */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <Pressable style={s.overlay} onPress={() => setModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.sheet}
        >
          <View style={s.sheetHandle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.sheetTitle}>Nova meta</Text>

            <Text style={s.fieldLabel}>Nome</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Ex.: Viagem, Reserva de emergência…"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={s.fieldLabel}>Valor alvo (R$)</Text>
            <TextInput
              style={s.input}
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={s.fieldLabel}>Já guardado (opcional)</Text>
            <TextInput
              style={s.input}
              value={initial}
              onChangeText={setInitial}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={s.fieldLabel}>Ícone</Text>
            <View style={s.iconGrid}>
              {GOAL_ICONS.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[s.iconPick, icon === ic && { borderColor: color, backgroundColor: color + '22' }]}
                  onPress={() => setIcon(ic)}
                >
                  <Ionicons name={ic as any} size={20} color={icon === ic ? color : colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Cor</Text>
            <View style={s.colorRow}>
              {GOAL_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            <View style={s.btnRow}>
              <TouchableOpacity style={s.btnCancel} onPress={() => setModal(false)}>
                <Text style={s.btnCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSave, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.brandText} /> : <Text style={s.btnSaveTxt}>Criar meta</Text>}
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },

  tabs: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.surface, borderRadius: 12, padding: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 9,
  },
  tabActive: { backgroundColor: colors.brand },
  tabTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  tabTxtActive: { color: colors.brandText },

  // Busca
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, padding: 0 },

  listContent: { padding: 16, paddingTop: 8, gap: 12, paddingBottom: 100 },
  listEmpty: { flex: 1, padding: 16 },

  summaryCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 4,
  },
  summaryCol: { gap: 4 },
  summaryLabel: {
    color: colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  summaryValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  summaryOf: { color: colors.textFaint, fontSize: 14, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 },
  iconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardName: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  doneTxt: { color: colors.income, fontSize: 12, fontWeight: '600', marginTop: 2 },

  track: { height: 9, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  spentTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  remainTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },

  goalActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  goalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
  },
  goalBtnTxt: { fontSize: 13, fontWeight: '700' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: colors.surfaceAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%',
    borderTopWidth: 1, borderColor: colors.border,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 20 },
  fieldLabel: {
    color: colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  hint: { color: colors.textFaint, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  input: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 15, marginBottom: 16,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  catChipTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  iconPick: {
    width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: colors.text, transform: [{ scale: 1.15 }] },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  btnCancelTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 15 },
  btnSave: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  btnSaveTxt: { color: colors.brandText, fontWeight: '700', fontSize: 15 },
});
