import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGlobalRetellApiKey } from '../_shared/retell-api-key.ts';
import {
  sendGracePeriodStarted,
  sendGracePeriodReminder,
  sendPhoneDeleted,
} from '../_shared/email-service.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PHONE_NUMBER_COST_CENTS = 500; // $5.00 = 500 credits

interface PhoneRecord {
  id: string;
  user_id: string;
  phone_number: string;
  next_billing_date: string;
  grace_period_started_at: string | null;
  grace_period_expires_at: string | null;
  grace_period_notified_at: string | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting monthly phone number billing process...');

    // Create Supabase service client (cron jobs use service role)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get all active phone numbers that are due for billing (credits-based only)
    const today = new Date();
    const { data: phonesDue, error: fetchError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('subscription_active', true)
      .eq('billing_method', 'credits')
      .lte('next_billing_date', today.toISOString());

    if (fetchError) {
      console.error('Error fetching phones due for billing:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${phonesDue?.length || 0} phone numbers due for billing`);

    const results = {
      processed: 0,
      successful_charges: 0,
      failed_charges: 0,
      grace_periods_started: 0,
      grace_period_reminders: 0,
      deleted_numbers: [],
      errors: []
    };

    if (!phonesDue || phonesDue.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No phone numbers due for billing', results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each phone number
    for (const phone of phonesDue) {
      results.processed++;

      try {
        console.log(`Processing phone ${phone.phone_number} for user ${phone.user_id}`);

        // Get user's current credit balance
        const { data: userCredits, error: creditsError } = await supabase
          .from('user_credits')
          .select('balance_cents')
          .eq('user_id', phone.user_id)
          .single();

        if (creditsError || !userCredits) {
          console.error(`Error fetching credits for user ${phone.user_id}:`, creditsError);
          results.errors.push({
            phone_number: phone.phone_number,
            error: 'Failed to fetch user credits'
          });
          continue;
        }

        // Check if user has sufficient credits
        if (userCredits.balance_cents >= PHONE_NUMBER_COST_CENTS) {
          // ===== Sufficient credits: Charge and extend billing period =====
          await processSuccessfulCharge(supabase, phone, userCredits.balance_cents);
          results.successful_charges++;
          console.log(`Successfully charged ${PHONE_NUMBER_COST_CENTS} credits for ${phone.phone_number}`);

        } else {
          // ===== Insufficient credits: Try auto-reload first =====
          console.log(`Insufficient credits for user ${phone.user_id} (${userCredits.balance_cents} < ${PHONE_NUMBER_COST_CENTS})`);
          console.log('Attempting auto-reload...');

          let autoReloadSucceeded = false;

          try {
            // Trigger auto-reload
            const autoReloadResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/trigger-auto-reload`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  user_id: phone.user_id,
                  new_balance: userCredits.balance_cents
                })
              }
            );

            if (autoReloadResponse.ok) {
              const autoReloadResult = await autoReloadResponse.json();
              console.log('Auto-reload response:', autoReloadResult);

              // Wait a moment for processing
              await new Promise(resolve => setTimeout(resolve, 2000));

              // Re-fetch balance after auto-reload attempt
              const { data: updatedCredits } = await supabase
                .from('user_credits')
                .select('balance_cents')
                .eq('user_id', phone.user_id)
                .single();

              if (updatedCredits && updatedCredits.balance_cents >= PHONE_NUMBER_COST_CENTS) {
                // Auto-reload succeeded! Process charge
                console.log(`Auto-reload succeeded for user ${phone.user_id}. New balance: ${updatedCredits.balance_cents}`);
                await processSuccessfulCharge(supabase, phone, updatedCredits.balance_cents);
                results.successful_charges++;
                autoReloadSucceeded = true;
              }
            }
          } catch (autoReloadError) {
            console.error('Error during auto-reload attempt:', autoReloadError);
            // Continue to grace period handling
          }

          // If auto-reload didn't succeed, handle grace period
          if (!autoReloadSucceeded) {
            console.log('Auto-reload failed or disabled, entering grace period handling');
            const gracePeriodResult = await handleGracePeriod(supabase, phone, userCredits.balance_cents);

            if (gracePeriodResult === 'started') {
              results.grace_periods_started++;
            } else if (gracePeriodResult === 'reminder') {
              results.grace_period_reminders++;
            } else if (gracePeriodResult === 'deleted') {
              results.failed_charges++;
              results.deleted_numbers.push({
                phone_number: phone.phone_number,
                user_id: phone.user_id,
                reason: 'grace_period_expired'
              });
            }
          }
        }

      } catch (error) {
        console.error(`Error processing phone ${phone.phone_number}:`, error);
        results.errors.push({
          phone_number: phone.phone_number,
          error: (error as Error).message
        });
      }
    }

    console.log('Monthly billing process completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Monthly phone billing completed',
        results
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in process-monthly-phone-billing function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Process a successful credit charge for phone billing
 */
async function processSuccessfulCharge(
  supabase: any,
  phone: PhoneRecord,
  currentBalance: number
): Promise<void> {
  // ===== USE ATOMIC RPC FOR CREDIT DEDUCTION (race-condition safe) =====
  const { data: deductResult, error: deductError } = await supabase
    .rpc('deduct_credits', {
      p_user_id: phone.user_id,
      p_amount_cents: PHONE_NUMBER_COST_CENTS,
      p_description: `Monthly phone number billing - ${phone.phone_number}`,
      p_metadata: {
        phone_number_id: phone.id,
        phone_number: phone.phone_number,
        transaction_type: 'monthly_phone_billing'
      }
    });

  if (deductError) {
    console.error('❌ Credit deduction RPC error:', deductError);
    throw new Error(`Failed to deduct credits: ${deductError.message}`);
  }

  if (!deductResult?.success) {
    // Insufficient credits (shouldn't happen as we checked before, but safety check)
    console.error('❌ Insufficient credits during monthly billing:', deductResult?.error);
    throw new Error(deductResult?.error || 'Insufficient credits');
  }

  const newBalance = deductResult.new_balance;
  console.log(`✅ Monthly billing: Deducted ${PHONE_NUMBER_COST_CENTS} credits. New balance: ${newBalance}`);

  // Update next billing date (add 1 month)
  const nextBillingDate = new Date(phone.next_billing_date);
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  // Clear grace period fields if they exist (successful payment)
  await supabase
    .from('phone_numbers')
    .update({
      next_billing_date: nextBillingDate.toISOString(),
      grace_period_started_at: null,
      grace_period_expires_at: null,
      grace_period_notified_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', phone.id);

  // Log phone subscription transaction
  await supabase.from('phone_subscription_transactions').insert({
    user_id: phone.user_id,
    phone_number_id: phone.id,
    transaction_type: 'monthly_charge',
    amount_cents: PHONE_NUMBER_COST_CENTS,
    billing_period_start: new Date(phone.next_billing_date).toISOString(),
    billing_period_end: nextBillingDate.toISOString(),
    payment_status: 'paid',
    stripe_payment_intent_id: null
  });
}

/**
 * Handle grace period logic for insufficient credits
 * Returns: 'started' | 'reminder' | 'deleted'
 */
async function handleGracePeriod(
  supabase: any,
  phone: PhoneRecord,
  currentBalance: number
): Promise<string> {
  const now = new Date();

  // Check if already in grace period
  if (phone.grace_period_started_at) {
    // Already in grace period - check if expired
    if (phone.grace_period_expires_at && new Date(phone.grace_period_expires_at) <= now) {
      // Grace period expired - delete phone
      console.log(`Grace period expired for phone ${phone.phone_number}, deleting...`);
      await deletePhone(supabase, phone, 'grace_period_expired');
      return 'deleted';
    } else {
      // Still in grace period - send daily reminder
      const daysRemaining = Math.ceil(
        (new Date(phone.grace_period_expires_at!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(`Phone ${phone.phone_number} still in grace period, ${daysRemaining} days remaining`);

      // Get user email
      const { data: userData } = await supabase.auth.admin.getUserById(phone.user_id);

      if (userData.user?.email) {
        await sendGracePeriodReminder({
          user_email: userData.user.email,
          phone_number: phone.phone_number,
          days_remaining: daysRemaining,
          amount_needed: PHONE_NUMBER_COST_CENTS
        });

        // Update last notified time
        await supabase
          .from('phone_numbers')
          .update({
            grace_period_notified_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('id', phone.id);
      }

      return 'reminder';
    }
  } else {
    // Start new grace period (7 days)
    const grace_period_expires_at = new Date();
    grace_period_expires_at.setDate(grace_period_expires_at.getDate() + 7);

    console.log(`Starting grace period for phone ${phone.phone_number}, expires: ${grace_period_expires_at.toISOString()}`);

    await supabase
      .from('phone_numbers')
      .update({
        grace_period_started_at: now.toISOString(),
        grace_period_expires_at: grace_period_expires_at.toISOString(),
        grace_period_notified_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq('id', phone.id);

    // Log transaction
    await supabase.from('phone_subscription_transactions').insert({
      user_id: phone.user_id,
      phone_number_id: phone.id,
      transaction_type: 'grace_period_started',
      amount_cents: 0,
      billing_period_start: now.toISOString(),
      billing_period_end: grace_period_expires_at.toISOString(),
      payment_status: 'failed',
      stripe_payment_intent_id: null
    });

    // Send grace period started notification
    const { data: userData } = await supabase.auth.admin.getUserById(phone.user_id);

    if (userData.user?.email) {
      await sendGracePeriodStarted({
        user_email: userData.user.email,
        phone_number: phone.phone_number,
        grace_period_expires: grace_period_expires_at.toISOString(),
        days_remaining: 7
      });
    }

    return 'started';
  }
}

/**
 * Delete phone number from Retell and deactivate in database
 */
async function deletePhone(
  supabase: any,
  phone: PhoneRecord,
  reason: string
): Promise<void> {
  try {
    // Get Retell API key
    const { apiKey } = await getGlobalRetellApiKey();

    // Delete from Retell
    const retellResponse = await fetch(
      `https://api.retellai.com/delete-phone-number/${encodeURIComponent(phone.phone_number)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      }
    );

    if (!retellResponse.ok) {
      console.warn(`Failed to delete phone from Retell: ${await retellResponse.text()}`);
      // Continue anyway - mark as inactive in our database
    } else {
      console.log(`Successfully released ${phone.phone_number} from Retell`);
    }
  } catch (retellError) {
    console.error(`Error releasing phone from Retell:`, retellError);
    // Continue anyway - mark as inactive
  }

  // Deactivate in database
  await supabase
    .from('phone_numbers')
    .update({
      status: 'inactive',
      subscription_active: false,
      deletion_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', phone.id);

  // Log transaction
  await supabase.from('phone_subscription_transactions').insert({
    user_id: phone.user_id,
    phone_number_id: phone.id,
    transaction_type: 'deactivation_insufficient_credits',
    amount_cents: 0,
    billing_period_start: new Date().toISOString(),
    billing_period_end: new Date().toISOString(),
    payment_status: 'failed',
    stripe_payment_intent_id: null
  });

  // Send deletion notification
  const { data: userData } = await supabase.auth.admin.getUserById(phone.user_id);

  if (userData.user?.email) {
    await sendPhoneDeleted({
      user_email: userData.user.email,
      phone_number: phone.phone_number,
      deletion_reason: reason
    });
  }

  console.log(`Phone ${phone.phone_number} deleted and user notified`);
}
