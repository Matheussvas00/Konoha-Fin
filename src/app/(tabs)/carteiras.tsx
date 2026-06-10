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
} from '../../lib/accounts';

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

// ── Componente ────────────────────────────────────────────────────────
export default function CarteirasScreen() {
  const [accounts, setAccounts]       = useState<AccountWithBalance[]>([]);
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

  // ── Carregamento ────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await listAccountsWithBalance();
      setAccounts(data);
    } catch (e: any) {
      Alert.alert('Erro ao carregar carteiras', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Modal ───────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setFormName('');
    setFormType('checking');
    setFormBalance('0');
    setFormColor(ACCOUNT_TYPE_COLORS.checking);
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
      Alert.alert('Atenção', 'O nome da carteira não pode ficar em branco.');
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
          initial_balance: parseInput(formBalance),
          color:           formColor,
        });
      }
      closeModal();
      await load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive(account: AccountWithBalance) {
    Alert.alert(
      'Arquivar carteira',
      `Arquivar "${account.name}"?\n\nEla sai da lista, mas todos os lançamentos são preservados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Arquivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveAccount(account.id);
              await load();
            } catch (e: any) {
              Alert.alert('Erro', e.message);
            }
          },
        },
      ]
    );
  }

  // ── Arquivadas ───────────────────────────────────────────────────────
  async function openArchived() {
    setArchivedVisible(true);
    setArchivedLoading(true);
    try {
      const data = await listArchivedAccounts();
      setArchived(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
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
      Alert.alert('Erro', e.message);
    }
  }

  function confirmDelete(account: Account) {
    Alert.alert(
      'Excluir carteira',
      `Excluir "${account.name}" definitivamente?\n\nEsta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              setArchived((prev) => prev.filter((a) => a.id !== account.id));
            } catch (e: any) {
              Alert.alert('Não foi possível excluir', e.message);
            }
          },
        },
      ]
    );
  }

  // ── Totais ───────────────────────────────────────────────────────────
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  // ── Loading inicial ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#e63946" />
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
            <Ionicons name="archive-outline" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.8}>
            <Ionicons name="add" size={22} color="#fff" />
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

      {/* Lista */}
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={accounts.length === 0 ? styles.listEmpty : styles.listContent}
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
          const color = item.color ?? ACCOUNT_TYPE_COLORS[item.type];
          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: color }]}
              onPress={() => openEdit(item)}
              activeOpacity={0.75}
            >
              {/* Ícone */}
              <View style={[styles.iconWrap, { backgroundColor: color + '25' }]}>
                <Ionicons
                  name={ACCOUNT_TYPE_ICONS[item.type] as any}
                  size={22}
                  color={color}
                />
              </View>

              {/* Nome + tipo */}
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardType}>{ACCOUNT_TYPE_LABELS[item.type]}</Text>
              </View>

              {/* Saldo + arquivar */}
              <View style={styles.cardRight}>
                <Text style={[styles.cardBalance, item.balance < 0 && styles.negative]}>
                  {formatBRL(item.balance)}
                </Text>
                <TouchableOpacity
                  onPress={() => confirmArchive(item)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.archiveBtn}
                >
                  <Ionicons name="archive-outline" size={16} color="#555" />
                </TouchableOpacity>
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
        {/* Fundo escuro clicável fecha o modal */}
        <Pressable style={styles.overlay} onPress={closeModal} />

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
              placeholderTextColor="#4a4a6a"
              autoFocus
              returnKeyType="done"
            />

            {/* Tipo */}
            <Text style={styles.fieldLabel}>Tipo</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              {ACCOUNT_TYPES.map((t) => {
                const active = formType === t;
                const col    = ACCOUNT_TYPE_COLORS[t];
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, active && { backgroundColor: col, borderColor: col }]}
                    onPress={() => {
                      setFormType(t);
                      // Ao mudar o tipo, atualiza a cor sugerida se ela ainda era padrão
                      if (!editingId) setFormColor(col);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={ACCOUNT_TYPE_ICONS[t] as any}
                      size={14}
                      color={active ? '#fff' : '#888'}
                    />
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {ACCOUNT_TYPE_LABELS[t]}
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
                  onChangeText={setFormBalance}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor="#4a4a6a"
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
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.btnSaveTxt}>{editingId ? 'Salvar' : 'Criar'}</Text>
                }
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal de carteiras arquivadas ────────────────────────────── */}
      <Modal
        visible={archivedVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setArchivedVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setArchivedVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Carteiras arquivadas</Text>

          {archivedLoading ? (
            <View style={{ paddingVertical: 40 }}>
              <ActivityIndicator color="#e63946" />
            </View>
          ) : archived.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptySub}>Nenhuma carteira arquivada.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {archived.map((item) => {
                const color = item.color ?? ACCOUNT_TYPE_COLORS[item.type];
                return (
                  <View key={item.id} style={styles.archivedRow}>
                    <View style={[styles.iconWrap, { backgroundColor: color + '25' }]}>
                      <Ionicons name={ACCOUNT_TYPE_ICONS[item.type] as any} size={20} color={color} />
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.cardType}>{ACCOUNT_TYPE_LABELS[item.type]}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.restoreBtn}
                      onPress={() => handleRestore(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color="#22c55e" />
                      <Text style={styles.restoreTxt}>Restaurar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDelete(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.deleteBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color="#e63946" />
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
      </Modal>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    backgroundColor: '#1a1a2e',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerTitle: {
    color: '#fff',
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
    borderColor: '#2a2a4e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e63946',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Linha de carteira arquivada
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  restoreTxt: {
    color: '#22c55e',
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
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  totalLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  totalValue: {
    color: '#22c55e',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  totalSub: {
    color: '#555',
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
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
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
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cardType: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  cardBalance: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '700',
  },
  archiveBtn: {
    opacity: 0.8,
  },
  negative: {
    color: '#e63946',
  },

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
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: '#12122a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: '#2a2a4e',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  fieldHint: {
    color: '#555',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1e1e3a',
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fff',
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
    borderColor: '#2a2a4e',
    backgroundColor: '#1e1e3a',
    marginRight: 8,
  },
  chipLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: '#fff',
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
    borderColor: '#fff',
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
    borderColor: '#2a2a4e',
    alignItems: 'center',
  },
  btnCancelTxt: {
    color: '#888',
    fontWeight: '600',
    fontSize: 15,
  },
  btnSave: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#e63946',
    alignItems: 'center',
  },
  btnSaveTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
