import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendLowBalanceWarning } from '../_shared/email-service.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PHONE_NUMBER_COST_CENTS = 500; // $5.00 = 500 credits
const WARNING_DAYS_AHEAD = 3; // Warn 3 days before billing

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting low balance phone check...');

    // Create Supabase service client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Calculate date range (today to 3 days from now)
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + WARNING_DAYS_AHEAD);

    // Find phones with billing due in next 3 days
    const { data: upcomingPhones, error: fetchError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('subscription_active', true)
      .eq('billing_method', 'credits')
      .gte('next_billing_date', today.toISOString())
      .lte('next_billing_date', warningDate.toISOString())
      .is('grace_period_started_at', null); // Not already in grace period

    if (fetchError) {
      console.error('Error fetching upcoming billing phones:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${upcomingPhones?.length || 0} phones with billing due in next ${WARNING_DAYS_AHEAD} days`);

    if (!upcomingPhones || upcomingPhones.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No phones with upcoming billing',
          warnings_sent: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group phones by user
    const phonesByUser = new Map<string, typeof upcomingPhones>();
    for (const phone of upcomingPhones) {
      if (!phonesByUser.has(phone.user_id)) {
        phonesByUser.set(phone.user_id, []);
      }
      phonesByUser.get(phone.user_id)!.push(phone);
    }

    console.log(`Checking ${phonesByUser.size} users for low balance warnings`);

    const results = {
      users_checked: phonesByUser.size,
      warnings_sent: 0,
      users_with_sufficient_balance: 0,
      errors: []
    };

    // Check each user's balance
    for (const [userId, userPhones] of phonesByUser.entries()) {
      try {
        // Get user's credit balance
        const { data: userCredits, error: creditsError } = await supabase
          .from('user_credits')
          .select('balance_cents')
          .eq('user_id', userId)
          .single();

        if (creditsError || !userCredits) {
          console.error(`Error fetching credits for user ${userId}:`, creditsError);
          results.errors.push({
            user_id: userId,
            error: 'Failed to fetch credits'
          });
          continue;
        }

        // Calculate total needed for all user's phones
        const totalNeeded = userPhones.length * PHONE_NUMBER_COST_CENTS;

        // Check if balance is sufficient
        if (userCredits.balance_cents < totalNeeded) {
          console.log(`User ${userId} has low balance: ${userCredits.balance_cents} < ${totalNeeded}`);

          // Get user email
          const { data: userData } = await supabase.auth.admin.getUserById(userId);

          if (userData.user?.email) {
            // Find the earliest billing date (most urgent)
            const earliestBilling = userPhones.reduce((earliest, phone) => {
              const billingDate = new Date(phone.next_billing_date);
              return billingDate < earliest ? billingDate : earliest;
            }, new Date(userPhones[0].next_billing_date));

            // Send warning email
            const phoneNumbers = userPhones.map(p => p.phone_number);

            await sendLowBalanceWarning({
              user_email: userData.user.email,
              current_balance: userCredits.balance_cents,
              required_amount: totalNeeded,
              billing_date: earliestBilling.toISOString(),
              phone_numbers: phoneNumbers
            });

            results.warnings_sent++;
            console.log(`Sent low balance warning to ${userData.user.email}`);
          } else {
            console.warn(`User ${userId} has no email, skipping warning`);
          }
        } else {
          results.users_with_sufficient_balance++;
          console.log(`User ${userId} has sufficient balance: ${userCredits.balance_cents} >= ${totalNeeded}`);
        }

      } catch (error) {
        console.error(`Error processing user ${userId}:`, error);
        results.errors.push({
          user_id: userId,
          error: (error as Error).message
        });
      }
    }

    console.log('Low balance check completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Low balance check completed',
        results
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in check-low-balance-phones function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
