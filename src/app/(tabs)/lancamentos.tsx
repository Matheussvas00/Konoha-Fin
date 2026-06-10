import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, StatusBar,
  ScrollView, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  TransactionType, TransactionRow,
  listTransactions, createTransaction, updateTransaction,
  deleteTransaction, toggleStatus, currentMonth, CreateTransactionInput,
} from '../../lib/transactions';
import { Category, listCategories } from '../../lib/categories';
import { AccountWithBalance, listAccountsWithBalance } from '../../lib/accounts';

// ── Helpers ────────────────────────────────────────────────────────────

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const TYPE_LABELS: Record<TransactionType, string> = {
  income:   'Receita',
  expense:  'Despesa',
  transfer: 'Transferência',
};

const TYPE_COLORS: Record<TransactionType, string> = {
  income:   '#22c55e',
  expense:  '#f87171',
  transfer: '#60a5fa',
};

const TYPE_ICONS: Record<TransactionType, string> = {
  income:   'arrow-down-circle-outline',
  expense:  'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

// ── Picker simples ─────────────────────────────────────────────────────

type PickerItem = { id: string; name: string; color?: string | null };

function PickerModal({
  visible, title, items, selected, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
        <View style={pm.sheet} onStartShouldSetResponder={() => true}>
          <View style={pm.handle} />
          <Text style={pm.title}>{title}</Text>
          <ScrollView>
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={pm.item}
                onPress={() => { onSelect(item.id); onClose(); }}
              >
                {item.color ? (
                  <View style={[pm.dot, { backgroundColor: item.color }]} />
                ) : null}
                <Text style={[pm.itemTxt, selected === item.id && pm.itemTxtActive]}>
                  {item.name}
                </Text>
                {selected === item.id && (
                  <Ionicons name="checkmark" size={18} color="#e63946" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32, maxHeight: '60%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#333',
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a4e',
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  itemTxt: { flex: 1, color: '#aaa', fontSize: 15 },
  itemTxtActive: { color: '#fff', fontWeight: '600' },
});

// ── Screen ─────────────────────────────────────────────────────────────

export default function LancamentosScreen() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // filtros
  const [month, setMonth]           = useState(currentMonth());
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');

  // dados auxiliares
  const [accounts, setAccounts]     = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // modal form
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]           = useState<TransactionRow | null>(null);

  // campos
  const [txType, setTxType]           = useState<TransactionType>('expense');
  const [accountId, setAccountId]     = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId]   = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr]     = useState('');
  const [date, setDate]               = useState(todayISO());
  const [isPending, setIsPending]     = useState(false);
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);

  // pickers
  const [showAccPicker, setShowAccPicker]     = useState(false);
  const [showToAccPicker, setShowToAccPicker] = useState(false);
  const [showCatPicker, setShowCatPicker]     = useState(false);

  // ── Load ──────────────────────────────────────────────────────────

  async function loadAll(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true);
      const [txs, accs, cats] = await Promise.all([
        listTransactions({ month }),
        listAccountsWithBalance(),
        listCategories(),
      ]);
      setTransactions(txs);
      setAccounts(accs);
      setCategories(cats);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadAll(); }, [month]);
  const onRefresh = useCallback(() => loadAll(true), [month]);

  // ── Abertura do form ──────────────────────────────────────────────

  function openCreate(defaultType: TransactionType = 'expense') {
    setEditing(null);
    setTxType(defaultType);
    setAccountId(accounts[0]?.id ?? '');
    setToAccountId(accounts[1]?.id ?? '');
    setCategoryId('');
    setDescription('');
    setAmountStr('');
    setDate(todayISO());
    setIsPending(false);
    setNotes('');
    setModalVisible(true);
  }

  function openEdit(tx: TransactionRow) {
    setEditing(tx);
    setTxType(tx.type);
    setAccountId(tx.account_id);
    setToAccountId(tx.to_account_id ?? '');
    setCategoryId(tx.category_id ?? '');
    setDescription(tx.description);
    setAmountStr(tx.amount.toFixed(2).replace('.', ','));
    setDate(tx.date);
    setIsPending(tx.status === 'pending');
    setNotes(tx.notes ?? '');
    setModalVisible(true);
  }

  // ── Save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!description.trim()) { Alert.alert('Atenção', 'Digite uma descrição.'); return; }
    if (!accountId)          { Alert.alert('Atenção', 'Selecione a conta.'); return; }
    const amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
    if (!amount || amount <= 0) { Alert.alert('Atenção', 'Valor inválido.'); return; }
    if (txType === 'transfer' && !toAccountId) {
      Alert.alert('Atenção', 'Selecione a conta de destino.'); return;
    }

    setSaving(true);
    try {
      const payload: CreateTransactionInput = {
        account_id:    accountId,
        category_id:   categoryId || undefined,
        to_account_id: txType === 'transfer' ? toAccountId : undefined,
        type:          txType,
        status:        isPending ? 'pending' : 'effected',
        description:   description.trim(),
        amount,
        date,
        notes: notes.trim() || undefined,
      };

      if (editing) {
        await updateTransaction(editing.id, payload);
      } else {
        await createTransaction(payload);
      }
      setModalVisible(false);
      await loadAll();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Delete / toggle ───────────────────────────────────────────────

  function confirmDelete(tx: TransactionRow) {
    Alert.alert('Excluir lançamento', `Excluir "${tx.description}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(tx.id);
            setTransactions((p) => p.filter((t) => t.id !== tx.id));
          } catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  async function handleToggle(tx: TransactionRow) {
    try {
      await toggleStatus(tx.id, tx.status);
      setTransactions((p) =>
        p.map((t) =>
          t.id === tx.id
            ? { ...t, status: t.status === 'pending' ? 'effected' : 'pending' }
            : t
        )
      );
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  // ── Navegação de mês ──────────────────────────────────────────────

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function monthLabel() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  // ── Dados filtrados e resumo ──────────────────────────────────────

  const filtered = filterType === 'all'
    ? transactions
    : transactions.filter((t) => t.type === filterType);

  const filteredCats = categories.filter((c) =>
    txType === 'transfer' || c.type === (txType === 'income' ? 'income' : 'expense')
  );

  const effected = transactions.filter((t) => t.status === 'effected');
  const income   = effected.filter((t) => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
  const expense  = effected.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Lançamentos</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/categorias')} style={s.catBtn}>
          <Ionicons name="pricetag-outline" size={20} color="#aaa" />
        </TouchableOpacity>
      </View>

      {/* Navegador de mês */}
      <View style={s.monthNav}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={s.monthArrow}>
          <Ionicons name="chevron-back" size={20} color="#aaa" />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{monthLabel()}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={s.monthArrow}>
          <Ionicons name="chevron-forward" size={20} color="#aaa" />
        </TouchableOpacity>
      </View>

      {/* Resumo */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Entradas</Text>
          <Text style={[s.summaryValue, { color: '#22c55e' }]}>{formatBRL(income)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Saídas</Text>
          <Text style={[s.summaryValue, { color: '#f87171' }]}>{formatBRL(expense)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Saldo</Text>
          <Text style={[s.summaryValue, { color: income - expense < 0 ? '#f87171' : '#fff' }]}>
            {formatBRL(income - expense)}
          </Text>
        </View>
      </View>

      {/* Filtros de tipo */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterScroll} contentContainerStyle={s.filterContent}>
        {(['all', 'income', 'expense', 'transfer'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.chip, filterType === f && s.chipActive]}
            onPress={() => setFilterType(f)}
          >
            <Text style={[s.chipTxt, filterType === f && s.chipTxtActive]}>
              {f === 'all' ? 'Todos' : TYPE_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lista */}
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor="#e63946" colors={['#e63946']} />
        }
        contentContainerStyle={[s.list, filtered.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={48} color="#333" />
            <Text style={s.emptyTxt}>
              {loading ? 'Carregando…' : 'Nenhum lançamento neste mês'}
            </Text>
            <TouchableOpacity onPress={() => openCreate()} style={s.emptyBtn}>
              <Text style={s.emptyBtnTxt}>+ Adicionar</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: tx }) => {
          const color = TYPE_COLORS[tx.type];
          const icon  = TYPE_ICONS[tx.type];
          const sign  = tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔ ' : '-';
          return (
            <TouchableOpacity
              style={[s.txCard, tx.status === 'pending' && s.txPending]}
              onPress={() => openEdit(tx)}
              onLongPress={() => confirmDelete(tx)}
              activeOpacity={0.75}
            >
              <TouchableOpacity
                style={[s.txIconWrap, { backgroundColor: color + '18' }]}
                onPress={() => handleToggle(tx)}
              >
                <Ionicons
                  name={(tx.status === 'pending' ? 'time-outline' : icon) as any}
                  size={20}
                  color={tx.status === 'pending' ? '#555' : color}
                />
              </TouchableOpacity>

              <View style={s.txInfo}>
                <Text style={[s.txDesc, tx.status === 'pending' && { color: '#666' }]}
                  numberOfLines={1}>{tx.description}</Text>
                <Text style={s.txMeta}>
                  {tx.category_name ?? tx.account_name ?? '—'}
                  {tx.type === 'transfer' && tx.to_account_name
                    ? ` → ${tx.to_account_name}` : ''}
                  {' · '}{fmtDate(tx.date)}
                </Text>
              </View>

              <Text style={[s.txAmount, { color: tx.status === 'pending' ? '#555' : color }]}>
                {sign}{formatBRL(tx.amount)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB */}
      <View style={s.fab}>
        <TouchableOpacity style={[s.fabBtn, s.fabTransfer]} onPress={() => openCreate('transfer')}>
          <Ionicons name="swap-horizontal" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[s.fabBtn, s.fabIncome]} onPress={() => openCreate('income')}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.fabTxt}>Receita</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.fabBtn, s.fabExpense]} onPress={() => openCreate('expense')}>
          <Ionicons name="remove" size={18} color="#fff" />
          <Text style={s.fabTxt}>Despesa</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal Form ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.sheet}>
            <View style={s.handle} />

            <ScrollView showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">

              {/* Título + tipo */}
              <View style={s.formHeader}>
                <Text style={s.sheetTitle}>
                  {editing ? 'Editar' : 'Novo'} {TYPE_LABELS[txType]}
                </Text>
                {!editing && (
                  <View style={s.typeToggle}>
                    {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          s.typeBtn,
                          txType === t && {
                            backgroundColor: TYPE_COLORS[t] + '33',
                            borderColor: TYPE_COLORS[t],
                          },
                        ]}
                        onPress={() => setTxType(t)}
                      >
                        <Ionicons name={TYPE_ICONS[t] as any} size={16}
                          color={txType === t ? TYPE_COLORS[t] : '#555'} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Descrição */}
              <Text style={s.label}>Descrição</Text>
              <TextInput
                style={s.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Ex.: Supermercado"
                placeholderTextColor="#4a4a6a"
              />

              {/* Valor */}
              <Text style={s.label}>Valor (R$)</Text>
              <TextInput
                style={[s.input, s.inputLarge]}
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0,00"
                placeholderTextColor="#4a4a6a"
                keyboardType="decimal-pad"
              />

              {/* Conta */}
              <Text style={s.label}>
                {txType === 'transfer' ? 'Conta de origem' : 'Conta'}
              </Text>
              <TouchableOpacity style={s.picker} onPress={() => setShowAccPicker(true)}>
                <Text style={accountId ? s.pickerTxt : s.pickerPh}>
                  {accounts.find((a) => a.id === accountId)?.name ?? 'Selecionar conta…'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#555" />
              </TouchableOpacity>

              {/* Conta destino */}
              {txType === 'transfer' && (
                <>
                  <Text style={s.label}>Conta de destino</Text>
                  <TouchableOpacity style={s.picker} onPress={() => setShowToAccPicker(true)}>
                    <Text style={toAccountId ? s.pickerTxt : s.pickerPh}>
                      {accounts.find((a) => a.id === toAccountId)?.name ?? 'Selecionar conta…'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#555" />
                  </TouchableOpacity>
                </>
              )}

              {/* Categoria */}
              {txType !== 'transfer' && (
                <>
                  <Text style={s.label}>Categoria</Text>
                  <TouchableOpacity style={s.picker} onPress={() => setShowCatPicker(true)}>
                    <Text style={categoryId ? s.pickerTxt : s.pickerPh}>
                      {filteredCats.find((c) => c.id === categoryId)?.name ?? 'Sem categoria'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#555" />
                  </TouchableOpacity>
                </>
              )}

              {/* Data */}
              <Text style={s.label}>Data (AAAA-MM-DD)</Text>
              <TextInput
                style={s.input}
                value={date}
                onChangeText={setDate}
                placeholder="2025-06-07"
                placeholderTextColor="#4a4a6a"
                keyboardType="numeric"
                maxLength={10}
              />

              {/* Pendente */}
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Lançamento pendente</Text>
                  <Text style={s.switchSub}>Não afeta o saldo até ser efetivado</Text>
                </View>
                <Switch
                  value={isPending}
                  onValueChange={setIsPending}
                  trackColor={{ false: '#2a2a4e', true: '#e63946' }}
                  thumbColor="#fff"
                />
              </View>

              {/* Notas */}
              <Text style={s.label}>Notas (opcional)</Text>
              <TextInput
                style={[s.input, s.inputNotes]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Observações…"
                placeholderTextColor="#4a4a6a"
                multiline
                numberOfLines={2}
              />

              {/* Botões */}
              <View style={s.sheetBtns}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => setModalVisible(false)}
                  disabled={saving}
                >
                  <Text style={s.cancelTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={s.saveTxt}>{saving ? 'Salvando…' : 'Salvar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pickers auxiliares */}
      <PickerModal
        visible={showAccPicker}
        title="Selecionar conta"
        items={accounts.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
        selected={accountId}
        onSelect={setAccountId}
        onClose={() => setShowAccPicker(false)}
      />
      <PickerModal
        visible={showToAccPicker}
        title="Conta de destino"
        items={accounts
          .filter((a) => a.id !== accountId)
          .map((a) => ({ id: a.id, name: a.name, color: a.color }))}
        selected={toAccountId}
        onSelect={setToAccountId}
        onClose={() => setShowToAccPicker(false)}
      />
      <PickerModal
        visible={showCatPicker}
        title="Selecionar categoria"
        items={[
          { id: '', name: 'Sem categoria', color: null },
          ...filteredCats.map((c) => ({ id: c.id, name: c.name, color: c.color })),
        ]}
        selected={categoryId}
        onSelect={setCategoryId}
        onClose={() => setShowCatPicker(false)}
      />
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f1e' },

  header: {
    backgroundColor: '#1a1a2e',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#2a2a4e',
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '700' },
  catBtn: { padding: 6 },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1, borderBottomColor: '#2a2a4e',
  },
  monthArrow: { padding: 6 },
  monthLabel: {
    color: '#fff', fontSize: 15, fontWeight: '700', textTransform: 'capitalize',
  },

  summaryRow: { flexDirection: 'row', gap: 1, backgroundColor: '#2a2a4e' },
  summaryCard: {
    flex: 1, backgroundColor: '#1a1a2e',
    alignItems: 'center', paddingVertical: 12,
  },
  summaryLabel: {
    color: '#666', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  summaryValue: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 2 },

  filterScroll: { maxHeight: 50 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#2a2a4e', backgroundColor: '#1a1a2e',
  },
  chipActive: { backgroundColor: '#e63946', borderColor: '#e63946' },
  chipTxt: { color: '#888', fontSize: 13, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },

  list: { padding: 16, paddingBottom: 100, gap: 8 },
  listEmpty: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 80 },
  emptyTxt: { color: '#555', fontSize: 15 },
  emptyBtn: {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#e63946',
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '700' },

  txCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1a2e', borderRadius: 14,
    borderWidth: 1, borderColor: '#2a2a4e', padding: 14,
  },
  txPending: { opacity: 0.65, borderStyle: 'dashed' },
  txIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  txInfo: { flex: 1, gap: 3 },
  txDesc: { color: '#fff', fontSize: 14, fontWeight: '600' },
  txMeta: { color: '#666', fontSize: 12 },
  txAmount: { fontSize: 14, fontWeight: '800' },

  fab: {
    position: 'absolute', bottom: 72, right: 16,
    flexDirection: 'row', gap: 8, alignItems: 'center',
  },
  fabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 14, elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  fabIncome:   { backgroundColor: '#16a34a' },
  fabExpense:  { backgroundColor: '#dc2626' },
  fabTransfer: { backgroundColor: '#2563eb', paddingHorizontal: 12 },
  fabTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32,
    maxHeight: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#333',
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  typeToggle: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a4e',
  },

  label: {
    color: '#888', fontSize: 12, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f0f1e', borderWidth: 1, borderColor: '#2a2a4e',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    color: '#fff', fontSize: 15, marginBottom: 16,
  },
  inputLarge: { fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 1 },
  inputNotes: { minHeight: 60, textAlignVertical: 'top' },

  picker: {
    backgroundColor: '#0f0f1e', borderWidth: 1, borderColor: '#2a2a4e',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  pickerTxt: { color: '#fff', fontSize: 15 },
  pickerPh:  { color: '#4a4a6a', fontSize: 15 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0f0f1e', borderWidth: 1, borderColor: '#2a2a4e',
    borderRadius: 12, padding: 14, marginBottom: 16, gap: 12,
  },
  switchLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  switchSub:   { color: '#555', fontSize: 12, marginTop: 2 },

  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#2a2a4e', alignItems: 'center',
  },
  cancelTxt: { color: '#888', fontWeight: '700' },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#e63946', alignItems: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
