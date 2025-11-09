import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    // Get current user and verify admin role
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - please sign in" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { stripe_subscription_id, user_id, area_code, reason } = await req.json();

    // Validate required fields
    if (!stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "Missing stripe_subscription_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${user.id} initiating refund for subscription ${stripe_subscription_id}`);

    // Create service client for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get subscription details from Stripe
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);
    } catch (stripeError) {
      console.error("Error retrieving subscription:", stripeError);
      return new Response(
        JSON.stringify({
          error: "Subscription not found in Stripe",
          details: (stripeError as Error).message
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if subscription has a payment to refund
    const latestInvoice = subscription.latest_invoice;
    if (!latestInvoice) {
      return new Response(
        JSON.stringify({ error: "No invoice found for this subscription" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoice to find payment intent
    const invoice = typeof latestInvoice === 'string'
      ? await stripe.invoices.retrieve(latestInvoice)
      : latestInvoice;

    if (!invoice.payment_intent) {
      return new Response(
        JSON.stringify({ error: "No payment intent found for this subscription" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentIntentId = typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent.id;

    // Cancel the subscription
    console.log(`Cancelling subscription ${stripe_subscription_id}...`);
    await stripe.subscriptions.cancel(stripe_subscription_id);

    // Issue refund
    console.log(`Issuing refund for payment intent ${paymentIntentId}...`);
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: reason || "requested_by_customer",
      metadata: {
        refunded_by_admin: user.id,
        reason: "manual_admin_refund",
        area_code: area_code || "unknown",
        affected_user_id: user_id || "unknown"
      }
    });

    console.log(`Refund ${refund.id} created successfully`);

    // Log the failed purchase in database
    const { error: failedPurchaseError } = await supabase
      .from("failed_phone_purchases")
      .insert({
        user_id: user_id || subscription.metadata?.user_id || null,
        area_code: area_code || "unknown",
        stripe_subscription_id,
        stripe_session_id: null,
        retell_error_message: "Manual admin refund - phone number not provisioned",
        retell_error_details: {
          admin_refund: true,
          refunded_by: user.id,
          reason: reason || "manual_admin_refund"
        },
        refund_status: "completed",
        refund_id: refund.id,
        refunded_at: new Date().toISOString()
      });

    if (failedPurchaseError) {
      console.error("Error logging failed purchase:", failedPurchaseError);
    }

    // Update phone_numbers table if entry exists
    const { error: phoneUpdateError } = await supabase
      .from("phone_numbers")
      .update({
        status: "inactive",
        subscription_active: false
      })
      .eq("stripe_subscription_id", stripe_subscription_id);

    if (phoneUpdateError) {
      console.warn("No phone number entry found to update:", phoneUpdateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Refund processed successfully",
        refund_id: refund.id,
        amount_refunded: refund.amount,
        currency: refund.currency,
        subscription_cancelled: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in refund-failed-purchase function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
