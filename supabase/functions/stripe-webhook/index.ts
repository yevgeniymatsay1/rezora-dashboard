import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getRetellApiKeyForFunction, getGlobalRetellApiKey } from '../_shared/retell-api-key.ts';

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
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Create Supabase service client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const signature = req.headers.get('stripe-signature')!;
    const body = await req.text();
    
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        Deno.env.get('STRIPE_WEBHOOK_SECRET') || ""
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Webhook Error', { status: 400 });
    }

    console.log(`Processing Stripe webhook: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { user_id, credits_cents, type, area_code } = session.metadata || {};

      if (type === 'phone_number_subscription') {
        // Handle phone number subscription
        if (!user_id || !area_code) {
          console.error('Missing metadata for phone subscription:', session.id);
          return new Response('Missing metadata', { status: 400 });
        }

        console.log(`Processing phone number subscription for user ${user_id}, area code ${area_code}`);

        // Get the subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        
        // Get user-specific or global Retell API key
        let retellApiKey: string;
        try {
          retellApiKey = await getRetellApiKeyForFunction(user_id);
        } catch (error) {
          console.warn(`Failed to get user-specific API key for user ${user_id}, falling back to global:`, error);
          const globalKey = await getGlobalRetellApiKey();
          retellApiKey = globalKey.apiKey;
        }
        
        const areaCodeInt = parseInt(area_code, 10);
        
        const retellResponse = await fetch('https://api.retellai.com/create-phone-number', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${retellApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            area_code: areaCodeInt,
          }),
        });

        if (!retellResponse.ok) {
          console.error('Failed to create phone number in Retell:', await retellResponse.text());
          throw new Error('Failed to create phone number');
        }

        const retellData = await retellResponse.json();
        console.log('Created phone number in Retell:', retellData);

        // Store phone number in database
        const { error: phoneError } = await supabase
          .from('phone_numbers')
          .insert({
            user_id,
            phone_number: retellData.phone_number,
            area_code: area_code,
            retell_phone_id: retellData.phone_number,
            stripe_subscription_id: subscription.id,
            status: 'active',
            subscription_active: true,
            monthly_cost_cents: 500,
            next_billing_date: new Date(subscription.current_period_end * 1000).toISOString(),
            purchased_at: new Date().toISOString()
          });

        if (phoneError) {
          console.error('Error storing phone number:', phoneError);
          throw phoneError;
        }

        // Log the subscription transaction
        const { error: transactionError } = await supabase
          .from('phone_subscription_transactions')
          .insert({
            user_id,
            phone_number_id: null, // Will be updated after phone number is created
            transaction_type: 'monthly_charge',
            amount_cents: 500,
            billing_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            billing_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            payment_status: 'paid',
            stripe_payment_intent_id: session.payment_intent as string
          });

        if (transactionError) {
          console.error('Error logging phone subscription transaction:', transactionError);
        }

        console.log(`Successfully created phone number subscription for user ${user_id}`);

      } else {
        // Handle credit purchase with bulletproof idempotency
        if (!user_id || !credits_cents) {
          console.error('Missing metadata in checkout session:', session.id);
          return new Response('Missing metadata', { status: 400 });
        }

        console.log(`Processing credit purchase: ${session.id} for user ${user_id}, amount ${credits_cents} cents`);

        // Step 1: Log webhook event (prevents duplicate event processing)
        const { error: eventLogError } = await supabase
          .from('stripe_webhook_events')
          .insert({
            event_id: event.id,
            event_type: event.type,
            payload: session,
          });

        if (eventLogError) {
          if (eventLogError.code === '23505') {
            // Duplicate event - this webhook was already processed
            console.log(`✅ Duplicate webhook event ignored: ${event.id}`);
            return new Response('OK (duplicate event)', {
              status: 200,
              headers: corsHeaders
            });
          }
          console.error('Error logging webhook event:', eventLogError);
          throw eventLogError;
        }

        // Step 2: Process credit purchase atomically (idempotent, race-condition safe)
        const { data: result, error: processError } = await supabase
          .rpc('process_credit_purchase', {
            p_user_id: user_id,
            p_credits_cents: parseInt(credits_cents),
            p_stripe_session_id: session.id,
            p_stripe_payment_intent: session.payment_intent as string,
            p_description: `Credit purchase - ${session.id}`
          });

        if (processError) {
          console.error('❌ Credit purchase RPC error:', processError);

          // Update event log with error
          await supabase
            .from('stripe_webhook_events')
            .update({
              processing_result: {
                success: false,
                error: processError.message
              }
            })
            .eq('event_id', event.id);

          throw processError;
        }

        // Step 3: Update event log with successful result
        await supabase
          .from('stripe_webhook_events')
          .update({ processing_result: result })
          .eq('event_id', event.id);

        // Step 4: Log detailed result
        if (result?.already_processed) {
          console.log(`✅ Payment already processed (duplicate session): ${session.id}`);
        } else if (result?.success) {
          console.log(
            `✅ Credits added successfully!\n` +
            `   User: ${result.user_id}\n` +
            `   Amount: ${result.credits_added} cents\n` +
            `   Balance: ${result.old_balance} → ${result.new_balance} cents\n` +
            `   Transaction ID: ${result.transaction_id}`
          );
        } else {
          console.error(`❌ Credit purchase failed: ${result?.error || 'Unknown error'}`);
          throw new Error(result?.error || 'Credit purchase failed');
        }
      }
    }

    // Handle subscription invoice payments (monthly charges)
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const customerId = subscription.customer as string;
        
        // Get customer to find user_id
        const customer = await stripe.customers.retrieve(customerId);
        const user_id = (customer as any).metadata?.user_id;
        
        if (user_id) {
          // Log the monthly subscription payment
          const { error: transactionError } = await supabase
            .from('phone_subscription_transactions')
            .insert({
              user_id,
              phone_number_id: null, // Could be enhanced to link to specific phone
              transaction_type: 'monthly_charge',
              amount_cents: invoice.amount_paid,
              billing_period_start: new Date(invoice.period_start * 1000).toISOString(),
              billing_period_end: new Date(invoice.period_end * 1000).toISOString(),
              payment_status: 'paid',
              stripe_payment_intent_id: invoice.payment_intent as string
            });

          if (transactionError) {
            console.error('Error logging monthly subscription payment:', transactionError);
          } else {
            console.log(`Logged monthly payment for user ${user_id}`);
          }
        }
      }
    }

    // Handle subscription cancellations
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;
      
      // Deactivate phone number subscription by subscription ID
      const { error: updateError } = await supabase
        .from('phone_numbers')
        .update({ 
          subscription_active: false,
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', subscriptionId);

      if (updateError) {
        console.error('Error deactivating phone subscription:', updateError);
      } else {
        console.log(`Deactivated phone subscription for subscription: ${subscriptionId}`);
      }
    }

    return new Response('OK', { 
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    console.error("Error in stripe-webhook function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});