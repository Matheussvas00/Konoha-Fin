import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────

export type CategoryType = 'income' | 'expense';

export type Category = {
  id:         string;
  user_id:    string;
  name:       string;
  type:       CategoryType;
  color:      string | null;
  icon:       string | null;
  parent_id:  string | null;
  created_at: string;
};

// ── Metadados ──────────────────────────────────────────────────────────

export const CATEGORY_COLORS = [
  '#e63946', '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#2563eb', '#7c3aed', '#db2777', '#64748b', '#22c55e',
];

export const EXPENSE_ICONS: Array<{ icon: string; label: string }> = [
  { icon: 'cart-outline',           label: 'Mercado'       },
  { icon: 'restaurant-outline',     label: 'Alimentação'   },
  { icon: 'car-outline',            label: 'Transporte'    },
  { icon: 'home-outline',           label: 'Moradia'       },
  { icon: 'medkit-outline',         label: 'Saúde'         },
  { icon: 'school-outline',         label: 'Educação'      },
  { icon: 'shirt-outline',          label: 'Vestuário'     },
  { icon: 'game-controller-outline', label: 'Lazer'        },
  { icon: 'phone-portrait-outline', label: 'Tecnologia'    },
  { icon: 'paw-outline',            label: 'Pet'           },
  { icon: 'fitness-outline',        label: 'Academia'      },
  { icon: 'ellipsis-horizontal-outline', label: 'Outro'   },
];

export const INCOME_ICONS: Array<{ icon: string; label: string }> = [
  { icon: 'briefcase-outline',      label: 'Salário'       },
  { icon: 'trending-up-outline',    label: 'Investimento'  },
  { icon: 'gift-outline',           label: 'Presente'      },
  { icon: 'cash-outline',           label: 'Freelance'     },
  { icon: 'business-outline',       label: 'Negócio'       },
  { icon: 'card-outline',           label: 'Reembolso'     },
  { icon: 'ellipsis-horizontal-outline', label: 'Outro'   },
];

// ── Consultas ──────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .is('parent_id', null)          // apenas categorias raiz por ora
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listCategoriesByType(type: CategoryType): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('type', type)
    .is('parent_id', null)
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ── Mutações ──────────────────────────────────────────────────────────

export type CreateCategoryInput = {
  name:      string;
  type:      CategoryType;
  color?:    string;
  icon?:     string;
  parent_id?: string;
};

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name:      input.name,
      type:      input.type,
      color:     input.color  ?? CATEGORY_COLORS[0],
      icon:      input.icon   ?? 'ellipsis-horizontal-outline',
      parent_id: input.parent_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export type UpdateCategoryInput = {
  name?:  string;
  color?: string;
  icon?:  string;
};

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
