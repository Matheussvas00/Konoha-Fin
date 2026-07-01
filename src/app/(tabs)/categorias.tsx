import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, StatusBar,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Category, CategoryType,
  CATEGORY_COLORS, EXPENSE_ICONS, INCOME_ICONS,
  listCategories, createCategory, updateCategory, deleteCategory,
} from '../../lib/categories';
import { confirmAction } from '../../lib/confirm';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';

// ── Helpers ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CategoryType, string> = {
  income:  'Receita',
  expense: 'Despesa',
};

// ── Screen ─────────────────────────────────────────────────────────────

export default function CategoriasScreen() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // filtro de tipo
  const [filterType, setFilterType] = useState<CategoryType | 'all'>('all');
  const [search, setSearch] = useState('');

  // modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]           = useState<Category | null>(null);

  // campos do form
  const [name, setName]     = useState('');
  const [type, setType]     = useState<CategoryType>('expense');
  const [color, setColor]   = useState(CATEGORY_COLORS[0]);
  const [icon, setIcon]     = useState('ellipsis-horizontal-outline');
  const [saving, setSaving] = useState(false);

  async function load(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true);
      const data = await listCategories();
      setCategories(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);
  const onRefresh = useCallback(() => load(true), []);

  function openCreate() {
    setEditing(null);
    setName(''); setType('expense');
    setColor(CATEGORY_COLORS[0]); setIcon('ellipsis-horizontal-outline');
    setModalVisible(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setName(cat.name); setType(cat.type);
    setColor(cat.color ?? CATEGORY_COLORS[0]);
    setIcon(cat.icon  ?? 'ellipsis-horizontal-outline');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Atenção', 'Digite o nome da categoria.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(editing.id, { name: name.trim(), color, icon });
      } else {
        await createCategory({ name: name.trim(), type, color, icon });
      }
      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(cat: Category) {
    confirmAction({
      title: 'Excluir categoria',
      message: `Deseja excluir "${cat.name}"? Só é possível excluir categorias sem lançamentos ou orçamentos vinculados.`,
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteCategory(cat.id);
          setCategories((prev) => prev.filter((c) => c.id !== cat.id));
        } catch (e: any) {
          Alert.alert('Erro', e.message);
        }
      },
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = categories.filter(
    (c) =>
      (filterType === 'all' || c.type === filterType) &&
      c.name.toLowerCase().includes(q)
  );

  const icons = type === 'income' ? INCOME_ICONS : EXPENSE_ICONS;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Categorias</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={22} color={colors.brandText} />
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View style={s.filterRow}>
        {(['all', 'expense', 'income'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filterType === f && s.filterChipActive]}
            onPress={() => setFilterType(f)}
          >
            <Text style={[s.filterChipTxt, filterType === f && s.filterChipTxtActive]}>
              {f === 'all' ? 'Todas' : TYPE_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
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
        keyExtractor={(c) => c.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.text} colors={[colors.text]} />
        }
        contentContainerStyle={[s.list, filtered.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="pricetag-outline" size={48} color={colors.border} />
            <Text style={s.emptyTxt}>
              {loading ? 'Carregando…' : 'Nenhuma categoria ainda'}
            </Text>
            <TouchableOpacity onPress={openCreate} style={s.emptyBtn}>
              <Text style={s.emptyBtnTxt}>+ Criar categoria</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => openEdit(cat)}
            onLongPress={() => confirmDelete(cat)}
            activeOpacity={0.75}
          >
            <View style={[s.catIcon, { backgroundColor: (cat.color ?? colors.textFaint) + '22' }]}>
              <Ionicons name={(cat.icon ?? 'ellipsis-horizontal-outline') as any}
                size={20} color={cat.color ?? colors.textFaint} />
            </View>
            <View style={s.catInfo}>
              <Text style={s.catName}>{cat.name}</Text>
              <Text style={[
                s.catType,
                { color: cat.type === 'income' ? colors.income : colors.expense },
              ]}>
                {TYPE_LABELS[cat.type]}
              </Text>
            </View>
            <View style={[s.colorDot, { backgroundColor: cat.color ?? colors.textFaint }]} />
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
            {/* Handle */}
            <View style={s.handle} />

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.sheetTitle}>
                {editing ? 'Editar categoria' : 'Nova categoria'}
              </Text>

              {/* Nome */}
              <Text style={s.label}>Nome</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Ex.: Alimentação"
                placeholderTextColor={colors.placeholder}
                maxLength={40}
              />

              {/* Tipo (só na criação) */}
              {!editing && (
                <>
                  <Text style={s.label}>Tipo</Text>
                  <View style={s.typeRow}>
                    {(['expense', 'income'] as CategoryType[]).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[s.typeBtn, type === t && (t === 'expense' ? s.typeBtnExpense : s.typeBtnIncome)]}
                        onPress={() => { setType(t); setIcon('ellipsis-horizontal-outline'); }}
                      >
                        <Text style={[s.typeBtnTxt, type === t && s.typeBtnTxtActive]}>
                          {TYPE_LABELS[t]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Ícone */}
              <Text style={s.label}>Ícone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={s.iconScroll} contentContainerStyle={{ gap: 8 }}>
                {icons.map(({ icon: ic, label }) => (
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

              {/* Cor */}
              <Text style={s.label}>Cor</Text>
              <View style={s.colorRow}>
                {CATEGORY_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[s.colorSwatch, { backgroundColor: c },
                      color === c && s.colorSwatchActive]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>

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
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' },
  addBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterChipTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filterChipTxtActive: { color: colors.brandText },

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
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.md,
    padding: 0,
  },

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
    borderWidth: 1, borderColor: colors.border,
    padding: 14,
  },
  catIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  catInfo: { flex: 1 },
  catName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  catType: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },

  // Modal
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32,
    maxHeight: '90%',
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

  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  typeBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  typeBtnExpense: { backgroundColor: alpha(colors.expenseStrong, 0.2), borderColor: colors.expenseStrong },
  typeBtnIncome:  { backgroundColor: alpha(colors.incomeStrong, 0.2),  borderColor: colors.incomeStrong },
  typeBtnTxt: { color: colors.textFaint, fontWeight: '700' },
  typeBtnTxtActive: { color: colors.text },

  iconScroll: { marginBottom: 18 },
  iconOption: {
    alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg, minWidth: 64,
  },
  iconOptionActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  iconLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchActive: { borderWidth: 3, borderColor: colors.text },

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
