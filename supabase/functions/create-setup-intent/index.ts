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

    console.log(`Creating payment method setup session for user ${user.id}`);

    // Get or create Stripe customer
    let stripeCustomerId: string;

    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    if (customers.data.length > 0) {
      stripeCustomerId = customers.data[0].id;
      console.log(`Found existing customer: ${stripeCustomerId}`);
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id
        }
      });
      stripeCustomerId = customer.id;
      console.log(`Created new customer: ${stripeCustomerId}`);
    }

    // Create Checkout Session in setup mode (for collecting payment method)
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',  // Setup mode - just collect payment method, don't charge
      customer: stripeCustomerId,
      success_url: `${req.headers.get('origin')}/settings?payment_method_added=true`,
      cancel_url: `${req.headers.get('origin')}/settings`,
      payment_method_types: ['card'],
      metadata: {
        user_id: user.id,
        purpose: 'auto_reload_payment_method'
      }
    });

    console.log(`Created setup session: ${session.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        checkout_url: session.url,
        session_id: session.id
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in create-setup-intent function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
