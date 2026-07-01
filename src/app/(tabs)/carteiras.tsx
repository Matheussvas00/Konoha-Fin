import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, ScrollView, ActivityIndicator,
  Alert, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AccountWithBalance, AccountType, Account,
  ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS,
  listAccountsWithBalance, createAccount, updateAccount, archiveAccount,
  listArchivedAccounts, restoreAccount, deleteAccount,
  BalanceEntry, addBalanceEntry, listBalanceEntries, deleteBalanceEntry,
} from '../../lib/accounts';
import {
  WalletType, WALLET_TYPE_ICONS, WALLET_TYPE_COLORS, walletTypeMeta,
  listWalletTypes, ensureDefaultWalletTypes,
  createWalletType, updateWalletType, deleteWalletType,
} from '../../lib/walletTypes';
import { confirmAction, notify } from '../../lib/confirm';
import { maskMoney, parseMoney, maskDate, brToISO, isoToBR, todayBR } from '../../lib/masks';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';

// ── Helpers ───────────────────────────────────────────────────────────
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseInput(raw: string): number {
  // aceita vírgula como decimal
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
}

const PRESET_COLORS = [
  '#2563eb', '#16a34a', '#ca8a04', '#7c3aed',
  '#ea580c', '#e63946', '#0891b2', '#64748b',
  '#db2777', '#059669',
];

// Fallback usado enquanto a tabela wallet_types (migração 008) não existe:
// mantém o seletor de tipos funcionando com os tipos padrão.
const FALLBACK_TYPES: WalletType[] = ACCOUNT_TYPES.map((k, i) => ({
  id: k, user_id: '', key: k, name: ACCOUNT_TYPE_LABELS[k],
  icon: ACCOUNT_TYPE_ICONS[k], color: ACCOUNT_TYPE_COLORS[k],
  is_default: true, sort: i, created_at: '',
}));

// ── Componente ────────────────────────────────────────────────────────
export default function CarteirasScreen() {
  const [accounts, setAccounts]       = useState<AccountWithBalance[]>([]);
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // arquivadas
  const [archived, setArchived]             = useState<Account[]>([]);
  const [archivedVisible, setArchivedVisible] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);

  // form
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [formName, setFormName]       = useState('');
  const [formType, setFormType]       = useState<AccountType>('checking');
  const [formBalance, setFormBalance] = useState('0');
  const [formColor, setFormColor]     = useState(ACCOUNT_TYPE_COLORS.checking);
  const [saving, setSaving]           = useState(false);

  // tipos de carteira (CRUD)
  const [walletTypes, setWalletTypes]       = useState<WalletType[]>([]);
  const [typesModal, setTypesModal]         = useState(false);
  const [typeEditing, setTypeEditing]       = useState<WalletType | null>(null);
  const [typeName, setTypeName]             = useState('');
  const [typeIcon, setTypeIcon]             = useState(WALLET_TYPE_ICONS[0]);
  const [typeColor, setTypeColor]           = useState(WALLET_TYPE_COLORS[0]);
  const [typeSaving, setTypeSaving]         = useState(false);

  // implantação de saldo
  const [balanceWallet, setBalanceWallet]   = useState<AccountWithBalance | null>(null);
  const [balanceEntries, setBalanceEntries] = useState<BalanceEntry[]>([]);
  const [balanceAmount, setBalanceAmount]   = useState('');
  const [balanceDate, setBalanceDate]       = useState(todayBR());
  const [balanceSaving, setBalanceSaving]   = useState(false);

  // ── Carregamento ────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await listAccountsWithBalance();
      setAccounts(data);
    } catch (e: any) {
      notify('Erro ao carregar carteiras', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Tipos de carteira — resiliente (tabela 008 pode não existir ainda).
    try {
      setWalletTypes(await ensureDefaultWalletTypes());
    } catch { /* migração 008 ainda não rodou */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tMeta = (key: string) => walletTypeMeta(key, walletTypes);
  // Opções mostradas no seletor de tipo (fallback fixo se a 008 não rodou).
  const typeOptions = walletTypes.length ? walletTypes : FALLBACK_TYPES;

  // ── Modal ───────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setFormName('');
    const def = typeOptions[0];
    setFormType(def?.key ?? 'checking');
    setFormBalance('');
    setFormColor(def?.color ?? ACCOUNT_TYPE_COLORS.checking);
    setModalVisible(true);
  }

  function openEdit(account: AccountWithBalance) {
    setEditingId(account.id);
    setFormName(account.name);
    setFormType(account.type);
    setFormBalance(String(account.initial_balance));
    setFormColor(account.color ?? ACCOUNT_TYPE_COLORS[account.type]);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
  }

  async function handleSave() {
    if (!formName.trim()) {
      notify('Atenção', 'O nome da carteira não pode ficar em branco.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateAccount(editingId, {
          name:  formName.trim(),
          type:  formType,
          color: formColor,
        });
      } else {
        await createAccount({
          name:            formName.trim(),
          type:            formType,
          initial_balance: parseMoney(formBalance),
          color:           formColor,
        });
      }
      closeModal();
      await load();
    } catch (e: any) {
      notify('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Implantar saldo ─────────────────────────────────────────────────
  async function openBalance(wallet: AccountWithBalance) {
    setBalanceWallet(wallet);
    setBalanceAmount('');
    setBalanceDate(todayBR());
    setBalanceEntries([]);
    try {
      setBalanceEntries(await listBalanceEntries(wallet.id));
    } catch (e: any) {
      notify('Erro', e.message);
    }
  }

  async function addBalance() {
    if (!balanceWallet) return;
    const amount = parseMoney(balanceAmount);
    if (!amount || amount <= 0) { notify('Atenção', 'Informe um valor maior que zero.'); return; }
    const iso = brToISO(balanceDate);
    if (!iso) { notify('Atenção', 'Data inválida. Use DD/MM/AAAA.'); return; }
    setBalanceSaving(true);
    try {
      await addBalanceEntry(balanceWallet.id, amount, iso);
      setBalanceAmount('');
      setBalanceEntries(await listBalanceEntries(balanceWallet.id));
      await load();
    } catch (e: any) {
      notify('Erro', e.message);
    } finally {
      setBalanceSaving(false);
    }
  }

  function removeBalance(entry: BalanceEntry) {
    confirmAction({
      title: 'Remover saldo implantado',
      message: `Remover o saldo de ${formatBRL(entry.amount)} de ${isoToBR(entry.date)}?`,
      confirmLabel: 'Remover',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteBalanceEntry(entry.id);
          setBalanceEntries((prev) => prev.filter((e) => e.id !== entry.id));
          await load();
        } catch (e: any) {
          notify('Erro', e.message);
        }
      },
    });
  }

  // ── Tipos de carteira (CRUD) ────────────────────────────────────────
  function openTypesModal() {
    setTypeEditing(null);
    setTypeName('');
    setTypeIcon(WALLET_TYPE_ICONS[0]);
    setTypeColor(WALLET_TYPE_COLORS[0]);
    setTypesModal(true);
  }

  function editType(t: WalletType) {
    setTypeEditing(t);
    setTypeName(t.name);
    setTypeIcon(t.icon ?? WALLET_TYPE_ICONS[0]);
    setTypeColor(t.color ?? WALLET_TYPE_COLORS[0]);
  }

  async function saveType() {
    if (!typeName.trim()) { notify('Atenção', 'Digite o nome do tipo.'); return; }
    setTypeSaving(true);
    try {
      if (typeEditing) {
        await updateWalletType(typeEditing.id, { name: typeName.trim(), icon: typeIcon, color: typeColor });
      } else {
        await createWalletType({ name: typeName.trim(), icon: typeIcon, color: typeColor });
      }
      setTypeEditing(null);
      setTypeName('');
      setTypeIcon(WALLET_TYPE_ICONS[0]);
      setTypeColor(WALLET_TYPE_COLORS[0]);
      setWalletTypes(await listWalletTypes());
    } catch (e: any) {
      notify('Erro', e.message);
    } finally {
      setTypeSaving(false);
    }
  }

  function removeType(t: WalletType) {
    confirmAction({
      title: 'Excluir tipo',
      message: `Excluir "${t.name}"? Só é possível excluir tipos sem carteiras vinculadas.`,
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteWalletType(t);
          setWalletTypes((prev) => prev.filter((x) => x.id !== t.id));
        } catch (e: any) {
          notify('Erro', e.message);
        }
      },
    });
  }

  function confirmArchive(account: AccountWithBalance) {
    confirmAction({
      title: 'Arquivar carteira',
      message: `Arquivar "${account.name}"?\n\nEla sai da lista, mas todos os lançamentos são preservados.`,
      confirmLabel: 'Arquivar',
      destructive: true,
      onConfirm: async () => {
        try {
          await archiveAccount(account.id);
          await load();
        } catch (e: any) {
          notify('Erro', e.message);
        }
      },
    });
  }

  // ── Arquivadas ───────────────────────────────────────────────────────
  async function openArchived() {
    setArchivedVisible(true);
    setArchivedLoading(true);
    try {
      const data = await listArchivedAccounts();
      setArchived(data);
    } catch (e: any) {
      notify('Erro', e.message);
    } finally {
      setArchivedLoading(false);
    }
  }

  async function handleRestore(account: Account) {
    try {
      await restoreAccount(account.id);
      setArchived((prev) => prev.filter((a) => a.id !== account.id));
      await load();
    } catch (e: any) {
      notify('Erro', e.message);
    }
  }

  function confirmDelete(account: Account) {
    confirmAction({
      title: 'Excluir carteira',
      message: `Excluir "${account.name}" definitivamente?\n\nEsta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteAccount(account.id);
          setArchived((prev) => prev.filter((a) => a.id !== account.id));
        } catch (e: any) {
          notify('Não foi possível excluir', e.message);
        }
      },
    });
  }

  // ── Totais ───────────────────────────────────────────────────────────
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  // ── Busca por nome ───────────────────────────────────────────────────
  const visibleAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  // ── Loading inicial ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Carteiras</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.ghostBtn} onPress={openArchived} activeOpacity={0.8}>
            <Ionicons name="archive-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.8}>
            <Ionicons name="add" size={22} color={colors.brandText} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Saldo total */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Saldo total</Text>
        <Text style={[styles.totalValue, totalBalance < 0 && styles.negative]}>
          {formatBRL(totalBalance)}
        </Text>
        <Text style={styles.totalSub}>
          {accounts.length} {accounts.length === 1 ? 'carteira ativa' : 'carteiras ativas'}
        </Text>
      </View>

      {/* Busca */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar..."
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {/* Lista */}
      <FlatList
        data={visibleAccounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={visibleAccounts.length === 0 ? styles.listEmpty : styles.listContent}
        onRefresh={() => { setRefreshing(true); load(true); }}
        refreshing={refreshing}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>👛</Text>
            <Text style={styles.emptyTitle}>Nenhuma carteira ainda</Text>
            <Text style={styles.emptySub}>
              Toque em + para adicionar{'\n'}sua primeira conta.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const color = item.color ?? tMeta(item.type).color;
          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: color }]}
              onPress={() => openEdit(item)}
              activeOpacity={0.75}
            >
              {/* Ícone */}
              <View style={[styles.iconWrap, { backgroundColor: color + '25' }]}>
                <Ionicons
                  name={tMeta(item.type).icon as any}
                  size={22}
                  color={color}
                />
              </View>

              {/* Nome + tipo */}
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardType}>{tMeta(item.type).label}</Text>
              </View>

              {/* Saldo + arquivar */}
              <View style={styles.cardRight}>
                <Text style={[styles.cardBalance, item.balance < 0 && styles.negative]}>
                  {formatBRL(item.balance)}
                </Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => openBalance(item)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.archiveBtn}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.income} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmArchive(item)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.archiveBtn}
                  >
                    <Ionicons name="archive-outline" size={16} color={colors.textFaint} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Modal criar / editar ─────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalRoot}>
        {/* Fundo escuro clicável fecha o modal */}
        <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheet}
        >
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={styles.sheetTitle}>
              {editingId ? 'Editar carteira' : 'Nova carteira'}
            </Text>

            {/* Nome */}
            <Text style={styles.fieldLabel}>Nome</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Ex.: Nubank, Carteira, Poupança…"
              placeholderTextColor={colors.placeholder}
              autoFocus
              returnKeyType="done"
            />

            {/* Tipo */}
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.fieldLabel}>Tipo</Text>
              <TouchableOpacity onPress={openTypesModal} hitSlop={8}>
                <Text style={styles.manageLink}>Gerenciar tipos</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              {typeOptions.map((t) => {
                const active = formType === t.key;
                const col    = t.color ?? '#64748b';
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.typeChip, active && { backgroundColor: col, borderColor: col }]}
                    onPress={() => {
                      setFormType(t.key);
                      // Ao mudar o tipo, atualiza a cor sugerida se ela ainda era padrão
                      if (!editingId) setFormColor(col);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={(t.icon ?? 'wallet-outline') as any}
                      size={14}
                      color={active ? colors.text : colors.textMuted}
                    />
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Saldo inicial — só no cadastro */}
            {!editingId && (
              <>
                <Text style={styles.fieldLabel}>Saldo inicial (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={formBalance}
                  onChangeText={(t) => setFormBalance(maskMoney(t))}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="done"
                />
                <Text style={styles.fieldHint}>
                  Quanto você já tem nessa conta hoje. Pode ser 0.
                </Text>
              </>
            )}

            {/* Cor */}
            <Text style={styles.fieldLabel}>Cor</Text>
            <View style={styles.colorRow}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    formColor === c && styles.colorDotActive,
                  ]}
                  onPress={() => setFormColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            {/* Botões */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnCancel} onPress={closeModal}>
                <Text style={styles.btnCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSave, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color={colors.brandText} />
                  : <Text style={styles.btnSaveTxt}>{editingId ? 'Salvar' : 'Criar'}</Text>
                }
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal implantar saldo ────────────────────────────────────── */}
      <Modal
        visible={!!balanceWallet}
        animationType="slide"
        transparent
        onRequestClose={() => setBalanceWallet(null)}
      >
        <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setBalanceWallet(null)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheet}
        >
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>Implantar saldo</Text>
            {balanceWallet && (
              <Text style={styles.balanceSub}>
                {balanceWallet.name} · saldo atual {formatBRL(balanceWallet.balance)}
              </Text>
            )}

            <Text style={styles.fieldLabel}>Valor (R$)</Text>
            <TextInput
              style={styles.input}
              value={balanceAmount}
              onChangeText={(t) => setBalanceAmount(maskMoney(t))}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={styles.fieldLabel}>Data (DD/MM/AAAA)</Text>
            <TextInput
              style={styles.input}
              value={balanceDate}
              onChangeText={(t) => setBalanceDate(maskDate(t))}
              keyboardType="numeric"
              maxLength={10}
              placeholder="07/06/2025"
              placeholderTextColor={colors.placeholder}
            />

            <TouchableOpacity
              style={[styles.addBalanceBtn, balanceSaving && { opacity: 0.7 }]}
              onPress={addBalance}
              disabled={balanceSaving}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={colors.brandText} />
              <Text style={styles.addBalanceTxt}>{balanceSaving ? 'Salvando…' : 'Adicionar saldo'}</Text>
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { marginTop: 22 }]}>Histórico</Text>
            {balanceEntries.length === 0 ? (
              <Text style={styles.fieldHint}>Nenhum saldo implantado ainda.</Text>
            ) : (
              balanceEntries.map((e) => (
                <View key={e.id} style={styles.histRow}>
                  <Ionicons name="cash-outline" size={16} color={colors.income} />
                  <Text style={styles.histDate}>{isoToBR(e.date)}</Text>
                  <Text style={styles.histVal}>{formatBRL(e.amount)}</Text>
                  <TouchableOpacity onPress={() => removeBalance(e)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={16} color={colors.expense} />
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal de tipos de carteira (CRUD) ────────────────────────── */}
      <Modal
        visible={typesModal}
        animationType="slide"
        transparent
        onRequestClose={() => setTypesModal(false)}
      >
        <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setTypesModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheet}
        >
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>Tipos de carteira</Text>

            <Text style={styles.fieldLabel}>{typeEditing ? 'Editar tipo' : 'Nome do novo tipo'}</Text>
            <TextInput
              style={styles.input}
              value={typeName}
              onChangeText={setTypeName}
              placeholder="Ex.: Cripto, Vale, Empresa…"
              placeholderTextColor={colors.placeholder}
              maxLength={40}
            />

            <Text style={styles.fieldLabel}>Ícone</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}
              contentContainerStyle={{ gap: 8 }}>
              {WALLET_TYPE_ICONS.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.typeIconOption, typeIcon === ic && { borderColor: typeColor, backgroundColor: typeColor + '22' }]}
                  onPress={() => setTypeIcon(ic)}
                >
                  <Ionicons name={ic as any} size={20} color={typeIcon === ic ? typeColor : colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Cor</Text>
            <View style={styles.colorRow}>
              {WALLET_TYPE_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, typeColor === c && styles.colorDotActive]}
                  onPress={() => setTypeColor(c)}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {typeEditing && (
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => { setTypeEditing(null); setTypeName(''); }}
                >
                  <Text style={styles.btnCancelTxt}>Cancelar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.addBalanceBtn, { flex: 1 }, typeSaving && { opacity: 0.7 }]}
                onPress={saveType}
                disabled={typeSaving}
                activeOpacity={0.85}
              >
                <Ionicons name={typeEditing ? 'checkmark' : 'add'} size={18} color={colors.brandText} />
                <Text style={styles.addBalanceTxt}>
                  {typeSaving ? 'Salvando…' : typeEditing ? 'Salvar' : 'Adicionar tipo'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 22 }]}>Tipos cadastrados</Text>
            {walletTypes.map((t) => (
              <View key={t.id} style={styles.histRow}>
                <View style={[styles.typeDot, { backgroundColor: (t.color ?? '#64748b') + '25' }]}>
                  <Ionicons name={(t.icon ?? 'wallet-outline') as any} size={16} color={t.color ?? '#64748b'} />
                </View>
                <Text style={styles.histDate}>{t.name}{t.is_default ? '  · padrão' : ''}</Text>
                <TouchableOpacity onPress={() => editType(t)} hitSlop={8} style={{ marginRight: 12 }}>
                  <Ionicons name="create-outline" size={17} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeType(t)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.expense} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 30 }} />
          </ScrollView>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal de carteiras arquivadas ────────────────────────────── */}
      <Modal
        visible={archivedVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setArchivedVisible(false)}
      >
        <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setArchivedVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Carteiras arquivadas</Text>

          {archivedLoading ? (
            <View style={{ paddingVertical: 40 }}>
              <ActivityIndicator color={colors.text} />
            </View>
          ) : archived.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptySub}>Nenhuma carteira arquivada.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {archived.map((item) => {
                const color = item.color ?? tMeta(item.type).color;
                return (
                  <View key={item.id} style={styles.archivedRow}>
                    <View style={[styles.iconWrap, { backgroundColor: color + '25' }]}>
                      <Ionicons name={tMeta(item.type).icon as any} size={20} color={color} />
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.cardType}>{tMeta(item.type).label}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.restoreBtn}
                      onPress={() => handleRestore(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color={colors.income} />
                      <Text style={styles.restoreTxt}>Restaurar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDelete(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.deleteBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.expense} />
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          <TouchableOpacity style={styles.btnCancel} onPress={() => setArchivedVisible(false)}>
            <Text style={styles.btnCancelTxt}>Fechar</Text>
          </TouchableOpacity>
          <View style={{ height: 28 }} />
        </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    backgroundColor: colors.surface,
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ghostBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Busca
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.md,
    padding: 0,
  },

  // Linha de carteira arquivada
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: alpha(colors.income, 0.4),
  },
  restoreTxt: {
    color: colors.income,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },

  // Saldo total
  totalCard: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  totalValue: {
    color: colors.income,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  totalSub: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 6,
  },

  // Lista
  listContent: {
    padding: 16,
    paddingTop: 8,
    gap: 10,
  },
  listEmpty: {
    flex: 1,
    padding: 16,
  },

  // Card de conta
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  cardType: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '500',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  cardBalance: {
    color: colors.income,
    fontSize: 15,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  archiveBtn: {
    opacity: 0.8,
  },
  negative: {
    color: colors.expense,
  },

  // Implantar saldo
  balanceSub: { color: colors.textMuted, fontSize: 13, marginBottom: 18, marginTop: -8 },
  addBalanceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 13, marginTop: 4,
  },
  addBalanceTxt: { color: colors.brandText, fontWeight: '700', fontSize: 15 },
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  histDate: { color: colors.textMuted, fontSize: 13, flex: 1 },
  histVal: { color: colors.text, fontSize: 14, fontWeight: '700' },

  // Tipos de carteira (gerenciamento)
  fieldHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manageLink: { color: colors.text, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  typeIconOption: {
    width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  typeDot: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Modal
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  fieldHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
    marginBottom: 16,
  },

  // Chips de tipo
  chipRow: {
    marginBottom: 16,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginRight: 8,
  },
  chipLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.text,
  },

  // Cores
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: colors.text,
    transform: [{ scale: 1.15 }],
  },

  // Botões do modal
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnCancelTxt: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 15,
  },
  btnSave: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  btnSaveTxt: {
    color: colors.brandText,
    fontWeight: '700',
    fontSize: 15,
  },
});
