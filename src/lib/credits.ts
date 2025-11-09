import { supabase } from "@/integrations/supabase/client";

export async function getUserCredits(userId: string) {
  const { data } = await supabase
    .from('user_credits')
    .select('balance_cents')
    .eq('user_id', userId)
    .single();
    
  return data?.balance_cents || 0;
}

export async function hasEnoughCredits(userId: string, requiredCents: number) {
  const balance = await getUserCredits(userId);
  return balance >= requiredCents;
}

export function formatCredits(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function calculateUserCost(retellCostCents: number) {
  // 1.667x markup (approximately 67% markup)
  return Math.ceil(retellCostCents * 1.667);
}

export async function initializeUserCreditsIfNeeded(userId: string) {
  const { error } = await supabase
    .from('user_credits')
    .upsert({
      user_id: userId,
      balance_cents: 0
    }, {
      onConflict: 'user_id',
      ignoreDuplicates: true
    });

  if (error) {
    console.error('Error initializing user credits:', error);
  }
}

export async function getUserCreditTransactions(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching credit transactions:', error);
    return [];
  }

  return data || [];
}

export async function getCreditPackages() {
  const { data, error } = await supabase
    .from('credit_packages')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true });

  if (error) {
    console.error('Error fetching credit packages:', error);
    return [];
  }

  return data || [];
}