import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────
export type Goal = {
  id:             string;
  user_id:        string;
  name:           string;
  target_amount:  number;
  current_amount: number;
  color:          string | null;
  icon:           string | null;
  target_date:    string | null;
  is_completed:   boolean;
  created_at:     string;
};

export const GOAL_COLORS = [
  '#e63946', '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#2563eb', '#7c3aed', '#db2777', '#22c55e', '#f59e0b',
];

export const GOAL_ICONS = [
  'airplane-outline', 'home-outline', 'car-outline', 'school-outline',
  'gift-outline', 'phone-portrait-outline', 'heart-outline', 'cash-outline',
  'trophy-outline', 'umbrella-outline',
];

// ── Helpers ────────────────────────────────────────────────────────────
export function goalProgress(g: Goal): number {
  if (g.target_amount <= 0) return 0;
  return Math.min((g.current_amount / g.target_amount) * 100, 100);
}

function normalize(g: any): Goal {
  return {
    ...g,
    target_amount:  Number(g.target_amount),
    current_amount: Number(g.current_amount),
  };
}

// ── Consultas ──────────────────────────────────────────────────────────
export async function listGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .order('is_completed', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalize);
}

// ── Mutações ───────────────────────────────────────────────────────────
export type CreateGoalInput = {
  name:          string;
  target_amount: number;
  current_amount?: number;
  color?:        string;
  icon?:         string;
  target_date?:  string | null;
};

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const current = input.current_amount ?? 0;
  const { data, error } = await supabase
    .from('goals')
    .insert({
      name:           input.name,
      target_amount:  input.target_amount,
      current_amount: current,
      color:          input.color ?? GOAL_COLORS[0],
      icon:           input.icon ?? 'trophy-outline',
      target_date:    input.target_date ?? null,
      is_completed:   current >= input.target_amount,
    })
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}

export type UpdateGoalInput = {
  name?:         string;
  target_amount?: number;
  color?:        string;
  icon?:         string;
  target_date?:  string | null;
};

export async function updateGoal(id: string, input: UpdateGoalInput): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}

/**
 * Adiciona (ou remove, com valor negativo) um aporte à meta.
 * Recalcula is_completed e nunca deixa o valor abaixo de zero.
 */
export async function contributeGoal(goal: Goal, delta: number): Promise<Goal> {
  const next = Math.max(0, goal.current_amount + delta);
  const { data, error } = await supabase
    .from('goals')
    .update({
      current_amount: next,
      is_completed:   next >= goal.target_amount,
    })
    .eq('id', goal.id)
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}
