// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { authService } from './auth.service';
import { baseService } from './base.service';

interface CreditBalance {
  id: string;
  user_id: string;
  balance: number;
  reserved: number;
  available: number;
  updated_at: string;
}

interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'usage' | 'refund' | 'adjustment';
  description: string;
  stripe_payment_intent_id?: string;
  campaign_id?: string;
  call_id?: string;
  created_at: string;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  area_code: string;
  capabilities: string[];
  monthly_cost: number;
  status: 'active' | 'released' | 'pending';
  retell_phone_number_id: string;
  agent_id?: string;
  created_at: string;
}

interface UsageStats {
  totalCreditsUsed: number;
  totalCalls: number;
  averageCallCost: number;
  creditsPurchased: number;
  currentBalance: number;
  reservedCredits: number;
}

/**
 * Service for billing and credit operations
 */
export const billingService = {
  /**
   * Get current credit balance
   */
  async getBalance(): Promise<CreditBalance> {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('credits')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    return baseService.handleOptionalResponse(response) || {
      id: '',
      user_id: user.id,
      balance: 0,
      reserved: 0,
      available: 0,
      updated_at: new Date().toISOString()
    };
  },

  /**
   * Get credit transactions with pagination
   */
  async getTransactions(page = 1, pageSize = 50) {
    const user = await authService.requireAuth();
    const offset = (page - 1) * pageSize;
    
    const response = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    return baseService.handleOptionalResponse(response) || [];
  },

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit = 10) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    return baseService.handleOptionalResponse(response) || [];
  },

  /**
   * Purchase credits
   */
  async purchaseCredits(amount: number, paymentIntentId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase.functions.invoke('process-credit-purchase', {
      body: {
        userId: user.id,
        amount,
        paymentIntentId
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to process credit purchase');
    }
    
    return response.data;
  },

  /**
   * Check and reserve credits for campaign
   */
  async checkAndReserveCredits(estimatedCost: number) {
    const user = await authService.requireAuth();
    
    const response = await supabase.rpc('check_and_reserve_credits', {
      p_user_id: user.id,
      p_estimated_cost_cents: estimatedCost
    });
    
    const result = baseService.handleResponse(response);
    
    return {
      canProceed: result.success && result.current_balance > 0,
      currentBalance: result.current_balance,
      warningLevel: this.getWarningLevel(result.current_balance),
      message: result.message || this.getCreditMessage(result.current_balance)
    };
  },

  /**
   * Release reserved credits
   */
  async releaseReservedCredits(campaignId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase.rpc('release_reserved_credits', {
      p_user_id: user.id,
      p_campaign_id: campaignId
    });
    
    return baseService.handleResponse(response);
  },

  /**
   * Deduct credits for usage
   */
  async deductCredits(amount: number, description: string, campaignId?: string, callId?: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount_cents: amount,
      p_description: description,
      p_campaign_id: campaignId,
      p_call_id: callId
    });
    
    return baseService.handleResponse(response);
  },

  /**
   * Get phone numbers for user
   */
  async getPhoneNumbers() {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('phone_numbers')
      .select(`
        *,
        user_agents(name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    return baseService.handleOptionalResponse(response) || [];
  },

  /**
   * Get available phone numbers for purchase
   */
  async getAvailablePhoneNumbers(areaCode?: string) {
    const response = await supabase.functions.invoke('search-phone-numbers', {
      body: { areaCode }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to search phone numbers');
    }
    
    return response.data;
  },

  /**
   * Purchase a phone number
   */
  async purchasePhoneNumber(phoneNumber: string, areaCode: string) {
    const user = await authService.requireAuth();
    
    // Check credits first
    const balance = await this.getBalance();
    const monthlyCost = 200; // $2.00 in cents
    
    if (balance.available < monthlyCost) {
      throw new Error('Insufficient credits to purchase phone number');
    }
    
    const response = await supabase.functions.invoke('purchase-phone-number', {
      body: {
        userId: user.id,
        phoneNumber,
        areaCode
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to purchase phone number');
    }
    
    return response.data;
  },

  /**
   * Release a phone number
   */
  async releasePhoneNumber(phoneNumberId: string) {
    const user = await authService.requireAuth();
    
    // Check if phone number is in use
    const { data: agents } = await supabase
      .from('user_agents')
      .select('id')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .limit(1);
    
    if (agents && agents.length > 0) {
      throw new Error('Phone number is currently assigned to an active agent');
    }
    
    const response = await supabase.functions.invoke('release-phone-number', {
      body: {
        userId: user.id,
        phoneNumberId
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to release phone number');
    }
    
    return response.data;
  },

  /**
   * Get usage statistics
   */
  async getUsageStats(startDate?: Date, endDate?: Date): Promise<UsageStats> {
    const user = await authService.requireAuth();
    
    let query = supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id);
    
    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }
    
    const response = await query;
    const transactions = baseService.handleOptionalResponse(response) || [];
    
    const balance = await this.getBalance();
    
    // Calculate statistics
    const stats: UsageStats = {
      totalCreditsUsed: 0,
      totalCalls: 0,
      averageCallCost: 0,
      creditsPurchased: 0,
      currentBalance: balance.balance,
      reservedCredits: balance.reserved
    };
    
    transactions.forEach(tx => {
      if (tx.type === 'usage') {
        stats.totalCreditsUsed += Math.abs(tx.amount);
        if (tx.call_id) {
          stats.totalCalls++;
        }
      } else if (tx.type === 'purchase') {
        stats.creditsPurchased += tx.amount;
      }
    });
    
    if (stats.totalCalls > 0) {
      stats.averageCallCost = Math.round(stats.totalCreditsUsed / stats.totalCalls);
    }
    
    return stats;
  },

  /**
   * Get subscription info
   */
  async getSubscription() {
    // TODO: Implement subscription management when needed
    // For now, return default values since these columns don't exist in profiles table
    return {
      subscription_tier: 'basic',
      subscription_status: 'active',
      subscription_end_date: null
    };
  },

  /**
   * Update subscription
   */
  async updateSubscription(tier: 'basic' | 'professional' | 'summit') {
    const user = await authService.requireAuth();
    
    const response = await supabase.functions.invoke('update-subscription', {
      body: {
        userId: user.id,
        tier
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update subscription');
    }
    
    return response.data;
  },

  /**
   * Private helper to get warning level based on balance
   */
  getWarningLevel(balance: number): 'critical' | 'warning' | 'normal' {
    if (balance <= 0) return 'critical';
    if (balance < 500) return 'warning';
    return 'normal';
  },

  /**
   * Private helper to get appropriate message based on balance
   */
  getCreditMessage(balance: number): string {
    if (balance <= 0) {
      return 'Your credit balance is depleted. Please add credits to continue.';
    }
    if (balance < 500) {
      return 'Your credit balance is running low. Consider adding more credits.';
    }
    return 'Sufficient credits available.';
  }
};