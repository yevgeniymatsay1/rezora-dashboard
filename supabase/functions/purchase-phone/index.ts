import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRetellApiKeyForFunction, getGlobalRetellApiKey } from '../_shared/retell-api-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHONE_NUMBER_COST_CENTS = 500; // $5.00 = 500 credits

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get current user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      console.error('Authentication error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - please sign in' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authenticated user:', user.id)

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { area_code } = await req.json()

    // Validate area code
    if (!area_code || !/^\d{3}$/.test(area_code)) {
      return new Response(
        JSON.stringify({ error: 'Invalid area code. Must be 3 digits.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const areaCodeInt = parseInt(area_code, 10)
    if (isNaN(areaCodeInt)) {
      return new Response(
        JSON.stringify({ error: 'Invalid area code format.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing phone number purchase for user ${user.id}, area code ${areaCodeInt}`)

    // Create service client for credit operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // ===== USE ATOMIC RPC FOR CREDIT DEDUCTION (race-condition safe) =====
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', {
        p_user_id: user.id,
        p_amount_cents: PHONE_NUMBER_COST_CENTS,
        p_description: `Phone number purchase - ${area_code} area`,
        p_metadata: {
          area_code,
          transaction_type: 'phone_purchase',
          request_timestamp: new Date().toISOString()
        }
      });

    if (deductError) {
      console.error('❌ Credit deduction RPC error:', deductError);
      return new Response(
        JSON.stringify({ error: 'Failed to deduct credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!deductResult?.success) {
      // Insufficient credits
      console.log(`❌ Insufficient credits: ${deductResult?.error}`);
      return new Response(
        JSON.stringify({
          error: deductResult?.error || 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required_credits: PHONE_NUMBER_COST_CENTS
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newBalance = deductResult.new_balance;
    console.log(`✅ Deducted ${PHONE_NUMBER_COST_CENTS} credits. New balance: ${newBalance}`);

    // ===== STEP 2.5: Check if auto-reload should trigger =====
    try {
      // Call trigger-auto-reload function (fire and forget - don't block on this)
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/trigger-auto-reload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          new_balance: newBalance
        })
      }).catch(err => console.error('Auto-reload check failed (non-blocking):', err));
    } catch (autoReloadError) {
      // Don't fail the purchase if auto-reload check fails
      console.warn('Auto-reload check error (non-blocking):', autoReloadError);
    }

    // ===== STEP 3: Get Retell API key =====
    let retellApiKey: string;
    try {
      retellApiKey = await getRetellApiKeyForFunction(user.id);
    } catch (error) {
      console.warn(`Failed to get user-specific API key for user ${user.id}, falling back to global:`, error);
      try {
        const globalKey = await getGlobalRetellApiKey();
        retellApiKey = globalKey.apiKey;
      } catch (globalError) {
        console.error('Failed to get any Retell API key:', globalError);

        // Refund credits (add them back)
        const refundBalance = newBalance + PHONE_NUMBER_COST_CENTS;
        await supabase.from('user_credits').update({
          balance_cents: refundBalance,
          updated_at: new Date().toISOString()
        }).eq('user_id', user.id);

        await supabase.from('credit_transactions').insert({
          user_id: user.id,
          type: 'refund',
          amount_cents: PHONE_NUMBER_COST_CENTS,
          balance_after_cents: refundBalance,
          description: `Refund - Service configuration error`,
          metadata: { area_code, error: 'Failed to get Retell API key' }
        });

        return new Response(
          JSON.stringify({ error: 'Service configuration error - Unable to provision phone number' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ===== STEP 4: Create phone number via Retell API =====
    console.log(`Attempting to create phone number with area code ${areaCodeInt} via Telnyx...`);

    let retellData;
    try {
      const retellResponse = await fetch('https://api.retellai.com/create-phone-number', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          area_code: areaCodeInt,
          number_provider: 'telnyx', // Use Telnyx for better availability
        }),
      });

      if (!retellResponse.ok) {
        const errorText = await retellResponse.text();
        let errorDetails;
        try {
          errorDetails = JSON.parse(errorText);
        } catch {
          errorDetails = { raw_error: errorText };
        }

        console.error('Retell API error:', errorDetails);

        // Refund credits (add them back)
        const refundBalance = newBalance + PHONE_NUMBER_COST_CENTS;
        await supabase.from('user_credits').update({
          balance_cents: refundBalance,
          updated_at: new Date().toISOString()
        }).eq('user_id', user.id);

        // Log refund transaction
        await supabase.from('credit_transactions').insert({
          user_id: user.id,
          type: 'refund',
          amount_cents: PHONE_NUMBER_COST_CENTS,
          balance_after_cents: refundBalance,
          description: `Refund - Phone number unavailable in ${area_code}`,
          metadata: { area_code, error: errorDetails.message || 'Unknown error' }
        });

        return new Response(
          JSON.stringify({
            error: `No phone numbers available in area code ${area_code}. Please try a different area code.`,
            code: 'AREA_CODE_UNAVAILABLE'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      retellData = await retellResponse.json();
      console.log('Successfully created phone number:', retellData.phone_number);

    } catch (error) {
      console.error('Error calling Retell API:', error);

      // Refund credits (add them back)
      const refundBalance = newBalance + PHONE_NUMBER_COST_CENTS;
      await supabase.from('user_credits').update({
        balance_cents: refundBalance,
        updated_at: new Date().toISOString()
      }).eq('user_id', user.id);

      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        type: 'refund',
        amount_cents: PHONE_NUMBER_COST_CENTS,
        balance_after_cents: refundBalance,
        description: `Refund - Failed to provision phone number`,
        metadata: { area_code, error: String(error) }
      });

      return new Response(
        JSON.stringify({ error: 'Failed to provision phone number. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 5: Store phone number in database =====
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    const { data: phoneRecord, error: phoneError } = await supabase
      .from('phone_numbers')
      .insert({
        user_id: user.id,
        phone_number: retellData.phone_number,
        area_code: area_code,
        retell_phone_id: retellData.phone_number,
        provider: 'telnyx',
        billing_method: 'credits',
        status: 'active',
        subscription_active: true,
        monthly_cost_cents: PHONE_NUMBER_COST_CENTS,
        next_billing_date: nextBillingDate.toISOString(),
        purchased_at: new Date().toISOString()
      })
      .select()
      .single();

    if (phoneError) {
      console.error('Error storing phone number:', phoneError);
      // Note: Phone number was created in Retell but not stored locally
      // This is a data consistency issue that needs manual resolution
      return new Response(
        JSON.stringify({
          error: 'Phone number created but database error occurred. Please contact support.',
          phone_number: retellData.phone_number
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 6: Log phone subscription transaction =====
    const billingPeriodStart = new Date();
    const billingPeriodEnd = new Date(nextBillingDate);

    await supabase
      .from('phone_subscription_transactions')
      .insert({
        user_id: user.id,
        phone_number_id: phoneRecord.id,
        transaction_type: 'initial_purchase',
        amount_cents: PHONE_NUMBER_COST_CENTS,
        billing_period_start: billingPeriodStart.toISOString(),
        billing_period_end: billingPeriodEnd.toISOString(),
        payment_status: 'paid',
        stripe_payment_intent_id: null // Credits-based, no Stripe
      });

    console.log(`Successfully purchased phone number ${retellData.phone_number} for user ${user.id}`);

    // ===== Return success =====
    return new Response(
      JSON.stringify({
        success: true,
        phone_number: retellData.phone_number,
        area_code: area_code,
        monthly_cost_cents: PHONE_NUMBER_COST_CENTS,
        next_billing_date: nextBillingDate.toISOString(),
        credits_remaining: newBalance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
