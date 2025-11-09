import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";

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
    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Create Supabase client with user auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get current user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - please sign in" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { enabled, threshold_cents, reload_amount_cents, stripe_payment_method_id } = await req.json();

    // Validate inputs
    if (threshold_cents !== undefined && threshold_cents < 500) {
      return new Response(
        JSON.stringify({ error: "Threshold must be at least $5.00 (500 cents)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (reload_amount_cents !== undefined && reload_amount_cents < 1000) {
      return new Response(
        JSON.stringify({ error: "Reload amount must be at least $10.00 (1000 cents)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service client for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get or create Stripe customer
    let stripeCustomerId: string | null = null;

    if (stripe_payment_method_id) {
      // Check if customer already exists
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });

      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            user_id: user.id
          }
        });
        stripeCustomerId = customer.id;
      }

      // Attach payment method to customer
      await stripe.paymentMethods.attach(stripe_payment_method_id, {
        customer: stripeCustomerId,
      });

      // Set as default payment method
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: stripe_payment_method_id,
        },
      });

      console.log(`Attached payment method ${stripe_payment_method_id} to customer ${stripeCustomerId}`);
    }

    // Upsert auto-reload settings
    const { data: settings, error: upsertError } = await supabase
      .from('user_credit_reload_settings')
      .upsert({
        user_id: user.id,
        enabled: enabled !== undefined ? enabled : false,
        threshold_cents: threshold_cents || 1000,
        reload_amount_cents: reload_amount_cents || 5000,
        stripe_payment_method_id: stripe_payment_method_id || null,
        stripe_customer_id: stripeCustomerId || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting reload settings:', upsertError);
      throw upsertError;
    }

    console.log(`Successfully updated auto-reload settings for user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        settings: {
          enabled: settings.enabled,
          threshold_cents: settings.threshold_cents,
          reload_amount_cents: settings.reload_amount_cents,
          has_payment_method: !!settings.stripe_payment_method_id
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in setup-auto-reload function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
