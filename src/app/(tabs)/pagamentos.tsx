import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, StatusBar,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  PaymentMethod, PAYMENT_ICONS,
  listPaymentMethods, ensureDefaultPaymentMethods,
  createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
} from '../../lib/paymentMethods';
import { confirmAction, notify } from '../../lib/confirm';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';

// ── Screen ─────────────────────────────────────────────────────────────

export default function PagamentosScreen() {
  const [methods, setMethods]       = useState<PaymentMethod[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');

  // modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]           = useState<PaymentMethod | null>(null);

  // campos do form
  const [name, setName]     = useState('');
  const [icon, setIcon]     = useState('wallet-outline');
  const [saving, setSaving] = useState(false);

  async function load(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true);
      // garante as formas padrão na primeira vez
      const data = await ensureDefaultPaymentMethods();
      setMethods(data);
    } catch (e: any) {
      notify('Erro', e.message);
      try { setMethods(await listPaymentMethods()); } catch { /* noop */ }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);
  const onRefresh = useCallback(() => load(true), []);

  function openCreate() {
    setEditing(null);
    setName(''); setIcon('wallet-outline');
    setModalVisible(true);
  }

  function openEdit(pm: PaymentMethod) {
    setEditing(pm);
    setName(pm.name); setIcon(pm.icon ?? 'wallet-outline');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!name.trim()) { notify('Atenção', 'Digite o nome da forma de pagamento.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updatePaymentMethod(editing.id, { name: name.trim(), icon });
      } else {
        await createPaymentMethod({ name: name.trim(), icon });
      }
      setModalVisible(false);
      await load();
    } catch (e: any) {
      notify('Erro', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(pm: PaymentMethod) {
    confirmAction({
      title: 'Excluir forma de pagamento',
      message: `Deseja excluir "${pm.name}"? Só é possível excluir formas sem lançamentos vinculados.`,
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await deletePaymentMethod(pm);
          setMethods((prev) => prev.filter((m) => m.id !== pm.id));
        } catch (e: any) {
          notify('Erro', e.message);
        }
      },
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = methods.filter((m) => m.name.toLowerCase().includes(q));

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Formas de pagamento</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={22} color={colors.brandText} />
        </TouchableOpacity>
      </View>

      {/* Busca */}
      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={s.searchInput}
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
        data={filtered}
        keyExtractor={(m) => m.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.text} colors={[colors.text]} />
        }
        contentContainerStyle={[s.list, filtered.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="card-outline" size={48} color={colors.border} />
            <Text style={s.emptyTxt}>
              {loading ? 'Carregando…' : 'Nenhuma forma de pagamento'}
            </Text>
            <TouchableOpacity onPress={openCreate} style={s.emptyBtn}>
              <Text style={s.emptyBtnTxt}>+ Nova forma</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: pm }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => openEdit(pm)}
            onLongPress={() => confirmDelete(pm)}
            activeOpacity={0.75}
          >
            <View style={s.pmIcon}>
              <Ionicons name={(pm.icon ?? 'wallet-outline') as any} size={20} color={colors.text} />
            </View>
            <View style={s.pmInfo}>
              <Text style={s.pmName}>{pm.name}</Text>
              {pm.is_default && <Text style={s.pmTag}>Padrão</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      />

      {/* ── Modal criar/editar ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.sheet}>
            <View style={s.handle} />

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.sheetTitle}>
                {editing ? 'Editar forma' : 'Nova forma de pagamento'}
              </Text>

              {/* Nome */}
              <Text style={s.label}>Nome</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Ex.: Vale-refeição, PicPay…"
                placeholderTextColor={colors.placeholder}
                maxLength={40}
              />

              {/* Ícone */}
              <Text style={s.label}>Ícone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={s.iconScroll} contentContainerStyle={{ gap: 8 }}>
                {PAYMENT_ICONS.map(({ icon: ic, label }) => (
                  <TouchableOpacity
                    key={ic}
                    style={[s.iconOption, icon === ic && s.iconOptionActive]}
                    onPress={() => setIcon(ic)}
                  >
                    <Ionicons name={ic as any} size={22} color={icon === ic ? colors.brandText : colors.textMuted} />
                    <Text style={[s.iconLabel, icon === ic && { color: colors.brandText }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

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
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.surface,
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' },
  addBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.size.md, padding: 0 },

  list: { padding: 16, gap: 8 },
  listEmpty: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 80 },
  emptyTxt: { color: colors.textFaint, fontSize: 15 },
  emptyBtn: {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, backgroundColor: colors.brand,
  },
  emptyBtnTxt: { color: colors.brandText, fontWeight: '700' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  pmIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: alpha(colors.text, 0.12),
    alignItems: 'center', justifyContent: 'center',
  },
  pmInfo: { flex: 1 },
  pmName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pmTag: { color: colors.textFaint, fontSize: 11, fontWeight: '700', marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32, maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 20,
  },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 20 },

  label: {
    color: colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    color: colors.text, fontSize: 15, marginBottom: 18,
  },

  iconScroll: { marginBottom: 18 },
  iconOption: {
    alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg, minWidth: 64,
  },
  iconOptionActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  iconLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },

  sheetBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelTxt: { color: colors.textMuted, fontWeight: '700' },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.brand, alignItems: 'center',
  },
  saveTxt: { color: colors.brandText, fontWeight: '700', fontSize: 15 },
});
