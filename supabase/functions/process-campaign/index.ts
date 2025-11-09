import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// API key will be retrieved per user

interface RateLimiter {
  campaignId: string;
  windowStart: Date;
  callsInWindow: number;
  maxCallsPerMinute: number;
  maxCallsPerHour: number;
}

const rateLimiters = new Map<string, RateLimiter>();

// Helper function to check if within calling hours
function isWithinCallingHours(campaign: any): boolean {
  const now = new Date();
  
  // Get campaign timezone (default to EST for existing campaigns)
  const campaignTimezone = campaign.timezone || 'America/New_York';
  
  // Convert current UTC time to campaign timezone
  const currentTimeInTimezone = new Date(now.toLocaleString("en-US", {timeZone: campaignTimezone}));
  const currentDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][currentTimeInTimezone.getDay()];
  
  if (!campaign.active_days.includes(currentDay)) {
    return false;
  }

  const currentTime = currentTimeInTimezone.getHours() * 60 + currentTimeInTimezone.getMinutes();
  const [startHour, startMin] = campaign.calling_hours.start.split(':').map(Number);
  const [endHour, endMin] = campaign.calling_hours.end.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return currentTime >= startMinutes && currentTime <= endMinutes;
}

// Helper function to get next calling time
function getNextCallingTime(campaign: any): string {
  const campaignTimezone = campaign.timezone || 'America/New_York';
  const now = new Date();
  const currentTimeInTimezone = new Date(now.toLocaleString("en-US", {timeZone: campaignTimezone}));
  const currentDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][currentTimeInTimezone.getDay()];
  
  const [startHour, startMin] = campaign.calling_hours.start.split(':').map(Number);
  
  // If today is an active day and we haven't passed today's start time yet
  if (campaign.active_days.includes(currentDay)) {
    const currentTime = currentTimeInTimezone.getHours() * 60 + currentTimeInTimezone.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    
    if (currentTime < startMinutes) {
      // Return today's start time
      const nextStart = new Date(currentTimeInTimezone);
      nextStart.setHours(startHour, startMin, 0, 0);
      return nextStart.toLocaleString("en-US", {
        timeZone: campaignTimezone,
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  }
  
  // Find next active day
  const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  let daysToAdd = 1;
  let nextDay = (currentTimeInTimezone.getDay() + daysToAdd) % 7;
  
  while (!campaign.active_days.includes(daysOfWeek[nextDay]) && daysToAdd < 7) {
    daysToAdd++;
    nextDay = (currentTimeInTimezone.getDay() + daysToAdd) % 7;
  }
  
  const nextStart = new Date(currentTimeInTimezone);
  nextStart.setDate(nextStart.getDate() + daysToAdd);
  nextStart.setHours(startHour, startMin, 0, 0);
  
  return nextStart.toLocaleString("en-US", {
    timeZone: campaignTimezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Smart retry time calculation
function getSmartRetryTime(attemptDay: number, callingHours: any): string {
  const [startHour, startMin] = callingHours.start.split(':').map(Number);
  const [endHour, endMin] = callingHours.end.split(':').map(Number);
  
  const windowDuration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  const segments = 3; // Morning, afternoon, evening
  const segment = attemptDay % segments;
  
  const segmentDuration = windowDuration / segments;
  const segmentStart = (startHour * 60 + startMin) + (segment * segmentDuration);
  
  // Add randomness within segment
  const randomOffset = Math.random() * segmentDuration;
  const targetMinutes = segmentStart + randomOffset;
  
  const hours = Math.floor(targetMinutes / 60);
  const minutes = Math.floor(targetMinutes % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Rate limiting check
function checkRateLimit(campaignId: string): boolean {
  const now = new Date();
  let limiter = rateLimiters.get(campaignId);
  
  if (!limiter || (now.getTime() - limiter.windowStart.getTime()) > 60000) {
    // New window or expired
    limiter = {
      campaignId,
      windowStart: now,
      callsInWindow: 0,
      maxCallsPerMinute: 10,
      maxCallsPerHour: 300
    };
    rateLimiters.set(campaignId, limiter);
  }
  
  if (limiter.callsInWindow >= limiter.maxCallsPerMinute) {
    return false;
  }
  
  limiter.callsInWindow++;
  return true;
}

// Build dynamic variables from contact data and field mappings
function buildDynamicVariables(contact: any, fieldMappings: any): Record<string, string> {
  const variables: Record<string, string> = {};
  
  // Debug logging
  console.log('Contact object:', JSON.stringify(contact));
  console.log('Contact data:', JSON.stringify(contact.contact_data));
  console.log('Field mappings:', JSON.stringify(fieldMappings));
  
  // The actual contact info is in contact.contact_data (from get_next_contacts_to_call)
  const contactData = contact.contact_data || {};
  
  // Standard fields from contact_data
  variables['first_name'] = contactData.first_name || '';
  variables['last_name'] = contactData.last_name || '';
  variables['email'] = contactData.email || '';
  variables['address'] = contactData.address || '';
  
  // Phone number comes from the contact record itself (not contact_data)
  variables['phone_number'] = contact.phone_number || '';
  
  // Handle legacy phone field in contact_data if it exists
  if (contactData.phone) {
    const phoneValue = contactData.phone;
    if (typeof phoneValue === 'number') {
      variables['phone'] = Math.round(phoneValue).toString();
    } else {
      variables['phone'] = String(phoneValue);
    }
  }
  
  // Handle custom field mappings using contactData
  if (fieldMappings && contactData) {
    const mappings = fieldMappings?.mappings || fieldMappings || {};
    
    if (Array.isArray(mappings)) {
      for (const mapping of mappings) {
        if (mapping.csvHeader && mapping.variableName && contactData[mapping.csvHeader]) {
          const variableKey = mapping.variableName.toLowerCase().replace(/\s+/g, '_');
          variables[variableKey] = String(contactData[mapping.csvHeader]);
        }
      }
    } else {
      for (const [csvHeader, variableName] of Object.entries(mappings)) {
        if (csvHeader && variableName && contactData[csvHeader]) {
          const variableKey = (variableName as string).toLowerCase().replace(/\s+/g, '_');
          variables[variableKey] = String(contactData[csvHeader]);
        }
      }
    }
  }
  
  return variables;
}

// Helper function to get next contacts respecting order and concurrency
async function getNextContactsToCall(
  supabase: any,
  campaignId: string, 
  limit: number,
  maxRetryDays: number
): Promise<any[]> {
  try {
    // Use the database function for optimal performance
    const { data: contacts, error } = await supabase.rpc('get_next_contacts_to_call', {
      p_campaign_id: campaignId,
      p_max_retry_days: maxRetryDays,
      p_limit: limit
    });

    if (error) {
      console.error('Error calling get_next_contacts_to_call:', error);
      return [];
    }

    return contacts || [];
  } catch (error) {
    console.error('Error in getNextContactsToCall:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // First, check for campaigns paused due to calling hours and resume if now within hours
    const { data: pausedCampaigns } = await supabase
      .from('campaigns')
      .select(`
        *,
        user_agents!campaigns_agent_id_fkey (
          phone_numbers!user_agents_phone_number_id_fkey (
            phone_number
          )
        )
      `)
      .eq('status', 'paused')
      .eq('paused_reason', 'outside_calling_hours');

    for (const campaign of pausedCampaigns || []) {
      if (isWithinCallingHours(campaign)) {
        console.log(`Resuming campaign ${campaign.id} - now within calling hours`);
        await supabase
          .from('campaigns')
          .update({ 
            status: 'active',
            paused_reason: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaign.id);
      }
    }
    
    // Get all active campaigns with proper joins
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select(`
        *,
        user_agents!campaigns_agent_id_fkey (
          id,
          name,
          retell_agent_id,
          dynamic_prompt,
          phone_numbers!user_agents_phone_number_id_fkey (
            id,
            phone_number,
            retell_phone_id
          )
        ),
        campaign_contacts!campaign_contacts_campaign_id_fkey (
          contact_group_id,
          selected_fields,
          field_mappings
        )
      `)
      .eq('status', 'active');

    if (campaignsError) throw campaignsError;

    console.log(`Processing ${campaigns?.length || 0} active campaigns`);

    // Process each campaign
    for (const campaign of campaigns || []) {
      // 🔒 ATOMIC CREDIT CHECK - Prevents concurrent race conditions
      const { data: creditCheck } = await supabase.rpc('check_and_reserve_credits', {
        p_user_id: campaign.user_id,
        p_estimated_cost_cents: 100 // Estimate $1 per call maximum
      });

      if (!creditCheck?.success || !creditCheck?.can_proceed) {
        console.log(`Campaign ${campaign.id} skipped - credit check failed: ${creditCheck?.error || 'Insufficient credits'}`);
        
        // Check if auto-pause is enabled
        if (creditCheck?.auto_pause !== false) {
          // Update campaign status to show it needs credits
          await supabase
            .from('campaigns')
            .update({ 
              status: 'paused',
              paused_reason: 'Insufficient credits - campaign auto-paused',
              updated_at: new Date().toISOString()
            })
            .eq('id', campaign.id);
        }
          
        continue; // Skip to next campaign
      }

      // Log credit status with warning level
      const balanceFormatted = `$${(creditCheck.current_balance / 100).toFixed(2)}`;
      const warningEmoji = creditCheck.warning_level === 'critical' ? '⚠️' : 
                           creditCheck.warning_level === 'warning' ? '⚡' : '✅';
      
      console.log(`Campaign ${campaign.id} - ${warningEmoji} ${creditCheck.message} (Balance: ${balanceFormatted})`);
      if (!isWithinCallingHours(campaign)) {
        console.log(`Campaign ${campaign.id} outside calling hours - pausing campaign`);
        const nextCallingTime = getNextCallingTime(campaign);
        await supabase
          .from('campaigns')
          .update({ 
            status: 'paused',
            paused_reason: 'outside_calling_hours',
            updated_at: new Date().toISOString()
          })
          .eq('id', campaign.id);
        continue;
      }

      if (!checkRateLimit(campaign.id)) {
        console.log(`Campaign ${campaign.id} rate limited`);
        continue;
      }

      // Clean up old stuck calls first (older than 10 minutes)
      await supabase
        .from('campaign_contact_attempts')
        .update({ call_status: 'failed' })
        .eq('campaign_id', campaign.id)
        .eq('call_status', 'in-progress')
        .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

      // Get current active calls count (only truly active calls from last 60 seconds)
      const { count: activeCallsCount } = await supabase
        .from('campaign_contact_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('call_status', 'in-progress')
        .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString());

      const currentlyActive = activeCallsCount || 0;
      const availableSlots = campaign.concurrent_calls - currentlyActive;

      if (availableSlots <= 0) {
        console.log(`Campaign ${campaign.id} at concurrent limit: ${currentlyActive}/${campaign.concurrent_calls}`);
        continue;
      }

      // Get campaign contacts and field mappings
      const campaignContact = campaign.campaign_contacts?.[0];
      if (!campaignContact?.contact_group_id) {
        console.log(`Campaign ${campaign.id} has no contact group configured`);
        continue;
      }

      // Get next contacts to call using improved logic
      const contactsToProcess = await getNextContactsToCall(
        supabase,
        campaign.id,
        availableSlots,
        campaign.max_retry_days || 0
      );

      if (contactsToProcess.length === 0) {
        console.log(`Campaign ${campaign.id} has no contacts to process`);
        continue;
      }

      const fieldMappings = campaignContact.field_mappings;
      console.log(`Campaign ${campaign.id}: Processing ${contactsToProcess.length} contacts (${currentlyActive + contactsToProcess.length}/${campaign.concurrent_calls} total active)`);

      // Process contacts respecting concurrency
      let callsInitiated = 0;

      for (const contact of contactsToProcess) {
        // Double-check we haven't exceeded concurrency
        if (callsInitiated >= availableSlots) {
          console.log(`Campaign ${campaign.id}: Reached concurrency limit for this execution`);
          break;
        }

        // Get phone number and metadata from the function result
        const phoneNumber = contact.phone_number;
        const phoneIndex = contact.phone_index || 0;
        const totalPhones = contact.total_phones || 1;
        
        if (!phoneNumber) {
          console.log(`Contact ${contact.contact_id} has no phone number`);
          continue;
        }


        // Create attempt record first
        const { data: attempt, error: attemptError } = await supabase
          .from('campaign_contact_attempts')
          .insert({
            campaign_id: campaign.id,
            contact_id: contact.contact_id,
            phone_number: phoneNumber,
            phone_index: phoneIndex,
            total_phones: totalPhones,
            attempt_number: 1,
            attempt_day: 0,
            call_status: 'in-progress'
          })
          .select()
          .single();

        if (attemptError) {
          console.error('Error creating attempt:', attemptError);
          continue;
        }

        // Build dynamic variables from contact data and field mappings
        const dynamicVariables = buildDynamicVariables(contact, fieldMappings);

        // Get phone number and agent info
        const fromPhoneNumber = campaign.user_agents?.phone_numbers?.phone_number;
        const agentId = campaign.user_agents?.retell_agent_id;

        if (!fromPhoneNumber || !agentId) {
          console.error(`Campaign ${campaign.id} missing phone number or agent ID`);
          await supabase
            .from('campaign_contact_attempts')
            .update({ call_status: 'failed', retell_call_data: { error: 'Missing phone number or agent ID' } })
            .eq('id', attempt.id);
          continue;
        }

        console.log(`Calling ${phoneNumber} from ${fromPhoneNumber} with agent ${agentId}`);
        console.log(`Dynamic variables:`, dynamicVariables);

        // Get user-specific or global Retell API key for this campaign
        const retellApiKey = await getRetellApiKeyForFunction(campaign.user_id);
        if (!retellApiKey) {
          console.error(`No Retell API key available for user ${campaign.user_id}, campaign ${campaign.id}`);
          await supabase
            .from('campaign_contact_attempts')
            .update({ call_status: 'failed', retell_call_data: { error: 'Retell API key not configured' } })
            .eq('id', attempt.id);
          continue;
        }

        // Make Retell API call
        try {
          const retellResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${retellApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from_number: fromPhoneNumber,
              to_number: phoneNumber,
              override_agent_id: agentId,
              retell_llm_dynamic_variables: dynamicVariables,
              webhook_url: `${supabaseUrl}/functions/v1/retell-webhook`,
              metadata: {
                campaign_id: campaign.id,
                contact_id: contact.contact_id,
                attempt_id: attempt.id
              }
            })
          });

          const retellData = await retellResponse.json();

          if (retellResponse.ok && retellData.call_id) {
            // Update attempt with call ID
            await supabase
              .from('campaign_contact_attempts')
              .update({
                retell_call_id: retellData.call_id,
                actual_time: new Date().toTimeString().split(' ')[0],
                retell_call_data: retellData
              })
              .eq('id', attempt.id);

            // INCREMENT THE COUNTER - THIS IS THE KEY FIX
            callsInitiated++;
            console.log(`Call initiated successfully for contact ${contact.contact_id} - ${phoneNumber} (${callsInitiated}/${availableSlots})`);
          } else {
            // Call failed to initiate
            await supabase
              .from('campaign_contact_attempts')
              .update({
                call_status: 'failed',
                retell_call_data: retellData
              })
              .eq('id', attempt.id);

            console.error('Retell API error:', retellData);
          }
        } catch (error) {
          console.error('Error calling Retell API:', error);
          
          await supabase
            .from('campaign_contact_attempts')
            .update({
              call_status: 'failed',
              retell_call_data: { error: error.message }
            })
            .eq('id', attempt.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Campaigns processed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-campaign function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});