import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Will get API key after user authentication

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

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { phone_number_id } = await req.json()

    if (!phone_number_id) {
      return new Response(
        JSON.stringify({ error: 'Phone number ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id)
    if (!retellApiKey) {
      console.error('Retell API key not configured')
      return new Response(
        JSON.stringify({ error: 'Service configuration error - API key missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Deleting phone number for user ${user.id}, phone_number_id: ${phone_number_id}`)

    // Get phone number details from database
    const { data: phoneNumber, error: fetchError } = await supabaseClient
      .from('phone_numbers')
      .select('*')
      .eq('id', phone_number_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !phoneNumber) {
      console.error('Phone number not found:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Phone number not found or not owned by user' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cancel Stripe subscription if it exists
    let stripeCanceled = false
    if (phoneNumber.stripe_subscription_id) {
      try {
        console.log(`Canceling Stripe subscription: ${phoneNumber.stripe_subscription_id}`)
        
        // Initialize Stripe
        const Stripe = (await import('https://esm.sh/stripe@14.21.0')).default
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
          apiVersion: '2023-10-16',
        })
        
        await stripe.subscriptions.cancel(phoneNumber.stripe_subscription_id)
        stripeCanceled = true
        console.log('Stripe subscription canceled successfully')
      } catch (stripeError) {
        console.error('Error canceling Stripe subscription:', stripeError)
        // Continue with phone number deletion even if Stripe cancellation fails
      }
    }

    // Call Retell API to delete phone number
    console.log(`Calling Retell API to delete phone number: ${phoneNumber.retell_phone_id}`)
    const retellResponse = await fetch(`https://api.retellai.com/delete-phone-number/${phoneNumber.retell_phone_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
    })

    console.log('Retell API response status:', retellResponse.status)

    if (!retellResponse.ok) {
      const errorText = await retellResponse.text()
      console.error('Retell API error:', retellResponse.status, errorText)
      
      // Even if Retell deletion fails, we still mark the number as inactive
      // This prevents billing but keeps the record for troubleshooting
    }

    // Update phone number status in database - mark as inactive and stop subscription
    const { error: updateError } = await supabaseClient
      .from('phone_numbers')
      .update({
        status: 'inactive',
        subscription_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', phone_number_id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Database update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update phone number status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Remove phone number association from any agents
    const { error: agentUpdateError } = await supabaseClient
      .from('user_agents')
      .update({ phone_number_id: null })
      .eq('phone_number_id', phone_number_id)
      .eq('user_id', user.id)

    if (agentUpdateError) {
      console.error('Agent update error:', agentUpdateError)
      // Don't fail the request for this, just log it
    }

    console.log('Phone number deleted successfully')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Phone number deleted and subscription cancelled',
        retell_deleted: retellResponse.ok,
        stripe_canceled: stripeCanceled
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
