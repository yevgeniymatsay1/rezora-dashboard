import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { sendAutoReloadFailed } from '../_shared/email-service.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Checking if auto-reload is needed...');

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Create Supabase service client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id, new_balance } = await req.json();

    if (!user_id || new_balance === undefined) {
      return new Response(
        JSON.stringify({ error: "Missing user_id or new_balance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Checking auto-reload for user ${user_id}, balance: ${new_balance}`);

    // Get auto-reload settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_credit_reload_settings')
      .select('*')
      .eq('user_id', user_id)
      .eq('enabled', true)
      .single();

    if (settingsError || !settings) {
      console.log('Auto-reload not enabled for this user or settings not found');
      return new Response(
        JSON.stringify({ message: 'Auto-reload not enabled' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if payment method is set up
    if (!settings.stripe_payment_method_id || !settings.stripe_customer_id) {
      console.log('No payment method configured');
      return new Response(
        JSON.stringify({ message: 'No payment method configured' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if balance is below threshold
    if (new_balance >= settings.threshold_cents) {
      console.log(`Balance ${new_balance} is above threshold ${settings.threshold_cents}, no reload needed`);
      return new Response(
        JSON.stringify({ message: 'Balance above threshold' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we already reloaded recently (prevent duplicate charges)
    if (settings.last_reload_at) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const lastReload = new Date(settings.last_reload_at);
      if (lastReload > fiveMinutesAgo) {
        console.log('Already reloaded within last 5 minutes, skipping');
        return new Response(
          JSON.stringify({ message: 'Already reloaded recently' }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Triggering auto-reload: ${settings.reload_amount_cents} cents`);

    // Create reload history record
    const { data: reloadRecord, error: recordError } = await supabase
      .from('auto_reload_history')
      .insert({
        user_id,
        amount_cents: settings.reload_amount_cents,
        balance_before_cents: new_balance,
        status: 'pending'
      })
      .select()
      .single();

    if (recordError) {
      console.error('Error creating reload history:', recordError);
      throw recordError;
    }

    try {
      // Create Stripe payment intent (off-session)
      console.log(`Creating Stripe payment intent for ${settings.reload_amount_cents} cents`);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: settings.reload_amount_cents,
        currency: 'usd',
        customer: settings.stripe_customer_id,
        payment_method: settings.stripe_payment_method_id,
        off_session: true,  // Charge without user present
        confirm: true,  // Immediately confirm
        metadata: {
          user_id,
          type: 'auto_reload',
          reload_amount_cents: settings.reload_amount_cents.toString(),
          balance_before: new_balance.toString()
        }
      });

      console.log(`Payment intent created: ${paymentIntent.id}, status: ${paymentIntent.status}`);

      // Check if payment succeeded
      if (paymentIntent.status === 'succeeded') {
        // ===== USE BULLETPROOF ATOMIC RPC (same as manual purchases) =====
        const { data: result, error: processError } = await supabase
          .rpc('process_credit_purchase', {
            p_user_id: user_id,
            p_credits_cents: settings.reload_amount_cents,
            p_stripe_session_id: paymentIntent.id, // Use payment_intent as session ID
            p_stripe_payment_intent: paymentIntent.id,
            p_description: `Auto-reload - $${(settings.reload_amount_cents / 100).toFixed(2)}`
          });

        if (processError) {
          console.error('❌ Credit purchase RPC error:', processError);
          throw processError;
        }

        // Check if already processed (idempotency check)
        if (result?.already_processed) {
          console.log('✅ Auto-reload already processed (duplicate detected)');

          // Update history to reflect it was already done
          await supabase
            .from('auto_reload_history')
            .update({
              status: 'succeeded',
              completed_at: new Date().toISOString()
            })
            .eq('id', reloadRecord.id);

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Auto-reload already processed',
              already_processed: true
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (result?.success) {
          console.log(
            `✅ Auto-reload succeeded!\n` +
            `   User: ${result.user_id}\n` +
            `   Amount: ${result.credits_added} cents\n` +
            `   Balance: ${result.old_balance} → ${result.new_balance} cents`
          );

          // Update reload history with success
          await supabase
            .from('auto_reload_history')
            .update({
              status: 'succeeded',
              balance_after_cents: result.new_balance,
              stripe_payment_intent_id: paymentIntent.id,
              completed_at: new Date().toISOString()
            })
            .eq('id', reloadRecord.id);

          // Update reload settings
          await supabase
            .from('user_credit_reload_settings')
            .update({
              last_reload_at: new Date().toISOString(),
              total_reloads: settings.total_reloads + 1,
              total_reloaded_cents: settings.total_reloaded_cents + settings.reload_amount_cents,
              updated_at: new Date().toISOString()
            })
          .eq('user_id', user_id);

          // TODO: Send success email notification
          // await sendEmail(user, 'Credits Auto-Reloaded', ...);

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Auto-reload succeeded',
              amount_cents: settings.reload_amount_cents,
              new_balance: result.new_balance
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          throw new Error(result?.error || 'Credit purchase failed');
        }

      } else {
        // Payment requires additional action or failed
        throw new Error(`Payment status: ${paymentIntent.status}`);
      }

    } catch (stripeError) {
      console.error('Stripe payment failed:', stripeError);

      // Update reload history with failure
      await supabase
        .from('auto_reload_history')
        .update({
          status: 'failed',
          error_message: (stripeError as Error).message,
          error_code: (stripeError as any).code || 'unknown',
          completed_at: new Date().toISOString()
        })
        .eq('id', reloadRecord.id);

      // Send failure email notification
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(user_id);

        if (userData.user?.email) {
          // Get phone numbers at risk
          const { data: phonesAtRisk } = await supabase
            .from('phone_numbers')
            .select('phone_number')
            .eq('user_id', user_id)
            .eq('subscription_active', true)
            .eq('billing_method', 'credits');

          await sendAutoReloadFailed({
            user_email: userData.user.email,
            error_message: (stripeError as Error).message,
            phone_numbers_at_risk: phonesAtRisk?.map(p => p.phone_number) || []
          });

          console.log('Sent auto-reload failure email notification');
        }
      } catch (emailError) {
        console.error('Failed to send auto-reload failure email:', emailError);
        // Don't fail the request if email fails
      }

      console.log('Auto-reload failed, but continuing normal operation');

      return new Response(
        JSON.stringify({
          success: false,
          message: 'Auto-reload failed',
          error: (stripeError as Error).message
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in trigger-auto-reload function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
