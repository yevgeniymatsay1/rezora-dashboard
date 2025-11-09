import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyWebhookSignatureWithTimestamp } from "../_shared/webhook-verification.ts";
import { WebhookErrorHandler, isRetryableError } from "../_shared/webhook-error-handler.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp'
};

// Helpers to extract appointment details from Retell payload
function extractAppointment(payload: any) {
  try {
    const queue: any[] = [payload];
    while (queue.length) {
      const item = queue.shift();
      if (item && typeof item === 'object') {
        const name = (item.name || '').toString();
        if (name && /book_appointment/i.test(name)) {
          let args: any = (item as any).arguments;
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { 
              console.warn('Failed to parse tool call arguments:', e);
            }
          }
          const timeText = args?.time || args?.datetime || args?.date || null;
          return {
            booked: true,
            time_text: timeText || null,
            name: args?.name || null,
            email: args?.email || null,
            tool_call_id: (item as any).tool_call_id || null,
            execution_message: (item as any).execution_message || args?.execution_message || null,
            source: 'retell_tool_call'
          };
        }
        if ((item as any).role === 'tool_call_invocation' && (item as any).name) {
          const nm = ((item as any).name || '').toString();
          if (/book_appointment/i.test(nm)) {
            let args: any = (item as any).arguments;
            if (typeof args === 'string') {
              try { args = JSON.parse(args); } catch (e) { 
              console.warn('Failed to parse tool call arguments:', e);
            }
            }
            const timeText = args?.time || args?.datetime || args?.date || null;
            return {
              booked: true,
              time_text: timeText || null,
              name: args?.name || null,
              email: args?.email || null,
              tool_call_id: (item as any).tool_call_id || null,
              execution_message: (item as any).execution_message || args?.execution_message || null,
              source: 'retell_tool_call'
            };
          }
        }
        if (Array.isArray(item)) {
          queue.push(...item);
        } else {
          Object.values(item).forEach((v) => queue.push(v));
        }
      }
    }
  } catch (e) {
    console.warn('Appointment extraction failed:', e);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get webhook secret from environment
    const webhookSecret = Deno.env.get('RETELL_WEBHOOK_SECRET');
    
    // Get the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get('x-webhook-signature');
    const timestamp = req.headers.get('x-webhook-timestamp');
    
    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const isValid = verifyWebhookSignatureWithTimestamp(
        body,
        signature,
        timestamp,
        webhookSecret,
        300 // 5 minute tolerance
      );
      
      if (!isValid) {
        console.error('Retell webhook signature verification failed');
        return new Response(
          JSON.stringify({ error: 'Invalid webhook signature' }), 
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      console.log('✅ Webhook signature verified successfully');
    } else {
      console.warn('⚠️ RETELL_WEBHOOK_SECRET not configured - webhook signature verification disabled');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const errorHandler = new WebhookErrorHandler(supabaseUrl, supabaseKey);

    // Parse webhook payload from the verified body
    const payload = JSON.parse(body);
    console.log('Retell webhook received:', payload.event);

    // Handle different webhook events
    switch (payload.event) {
      case 'call_started': {
        const call = payload.call;
        const metadata = call?.metadata || {};
        console.log('Call started:', call?.call_id);

        // New: handle web-call session start
        if (metadata.web_call_session_id) {
          console.log('Updating web_call_sessions for call_started:', metadata.web_call_session_id);
          const updateData: any = {
            status: 'in-progress',
            retell_call_id: call?.call_id || null,
          };
          if (call?.start_timestamp) {
            updateData.started_at = new Date(call.start_timestamp).toISOString();
          }
          const { error: wcsErr } = await supabase
            .from('web_call_sessions')
            .update(updateData)
            .eq('id', metadata.web_call_session_id);

          if (wcsErr) {
            console.error('Error updating web_call_sessions (started):', wcsErr);
            await errorHandler.logError(
              'retell',
              'call_started',
              payload.call?.call_id || 'unknown',
              payload,
              wcsErr,
              isRetryableError(wcsErr)
            );
          } else {
            console.log(`✅ Web call session ${metadata.web_call_session_id} marked in-progress`);
          }
        }
        break;
      }
        
      case 'call_ended': {
        const call = payload.call;
        const metadata = call.metadata || {};
        
        console.log('Call ended:', call.call_id, 'Reason:', call.disconnection_reason);
        
        // Get attempt and campaign info first
        const { data: attemptData } = await supabase
          .from('campaign_contact_attempts')
          .select('campaign_id, contact_id')
          .eq('id', metadata.attempt_id)
          .single();
          
        let campaignData = null;
        if (attemptData) {
          // Get campaign owner
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('user_id, timezone, name')
            .eq('id', attemptData.campaign_id)
            .single();
          campaignData = campaign;
        }
        
        // Handle call cost calculation and deduction (separate from analysis storage)
        let costDeductionSuccess = true;
        if (call.call_cost && call.call_cost.combined_cost > 0 && campaignData) {
          // Retell returns cost in cents as decimal, ensure we convert to integer cents
          const retellCostCents = Math.round(call.call_cost.combined_cost);
          const userCostCents = Math.ceil(retellCostCents * 1.667);
          
          console.log(`Call cost - Retell: $${(retellCostCents / 100).toFixed(2)}, User charged: $${(userCostCents / 100).toFixed(2)}`);
          console.log(`Cost calculation: Retell=${retellCostCents} cents, User=${userCostCents} cents`);
          
          const { data: result } = await supabase.rpc('atomic_deduct_call_cost', {
            p_user_id: campaignData.user_id,
            p_cost_cents: userCostCents,
            p_attempt_id: metadata.attempt_id,
            p_call_metadata: {
              call_id: call.call_id,
              campaign_id: attemptData.campaign_id,
              attempt_id: metadata.attempt_id,
              duration_seconds: Math.ceil((call.duration_ms || 0) / 1000),
              retell_cost_cents: retellCostCents,
              markup_multiplier: 1.667,
              cost_breakdown: call.call_cost,
              description: `Call to ${call.to_number} (${Math.ceil((call.duration_ms || 0) / 1000)}s)`
            }
          });

          if (result?.success) {
            console.log(`✅ Atomically deducted $${(userCostCents / 100).toFixed(2)} from user ${campaignData.user_id}`);
            console.log(`💰 Balance: $${(result.previous_balance / 100).toFixed(2)} → $${(result.new_balance / 100).toFixed(2)}`);
            console.log(`🧾 Transaction ID: ${result.transaction_id}`);
          } else {
            console.error(`❌ Atomic credit deduction failed: ${result?.error}`);
            console.error(`🔍 Error detail: ${result?.error_detail}`);
            costDeductionSuccess = false;
          }
        } else if (call.call_cost?.combined_cost === 0) {
          console.log('ℹ️ Zero cost call - no credit deduction needed');
        }
        
        // Determine final status based on call outcome
        let finalStatus = 'completed';
        if (call.disconnection_reason === 'user_not_answered') {
          finalStatus = 'no-answer';
        } else if (call.in_voicemail) {
          finalStatus = 'voicemail';
        } else if (call.disconnection_reason === 'user_hangup' && call.duration_ms < 30000) {
          finalStatus = 'no-answer'; // Quick hangup treated as no answer
        }
        
        // Update the attempt record with basic call data (no analysis yet)
        if (metadata.attempt_id) {
          const updateData: any = {
            call_status: finalStatus,
            call_duration: call.call_cost?.total_duration_seconds || (call.duration_ms ? Math.round(call.duration_ms / 1000) : null),
            retell_call_data: call
          };
          
          // Add additional fields if available
          if (call.transcript) updateData.transcript = call.transcript;
          if (call.recording_url) updateData.recording_url = call.recording_url;
          if (call.end_timestamp) updateData.ended_at = new Date(call.end_timestamp).toISOString();
          
          const { error } = await supabase
            .from('campaign_contact_attempts')
            .update(updateData)
            .eq('id', metadata.attempt_id);
            
          if (error) {
            console.error('Error updating attempt:', error);
            await errorHandler.logError(
              'retell',
              'call_ended',
              payload.call?.call_id || 'unknown',
              payload,
              error,
              isRetryableError(error)
            );
          } else {
            console.log(`Updated attempt ${metadata.attempt_id} to ${finalStatus}`);
          }
          
          // Try to extract appointment info from payload and save it
          const appt = extractAppointment(call);
          if (appt) {
            const { error: apptErr } = await supabase
              .from('campaign_contact_attempts')
              .update({ appointment_data: appt })
              .eq('id', metadata.attempt_id);
            if (apptErr) {
              console.error('Error updating appointment_data:', apptErr);
            } else {
              console.log('✅ Appointment data saved for attempt', metadata.attempt_id, appt);
            }
          }
          
          // If this was a successful call, mark other pending attempts for same contact as completed
          if (finalStatus === 'completed') {
            await supabase
              .from('campaign_contact_attempts')
              .update({ call_status: 'completed' })
              .eq('campaign_id', metadata.campaign_id)
              .eq('contact_id', metadata.contact_id)
              .eq('call_status', 'pending');
          }
        } else {
          console.log('No attempt_id in metadata, skipping update');
        }

        // New flow: web calls (voice tests)
        if (metadata.web_call_session_id) {
          const sessionId = metadata.web_call_session_id as string;

          // Determine final status based on call outcome
          let finalStatus = 'completed';
          if (call.disconnection_reason === 'user_not_answered') {
            finalStatus = 'no-answer';
          } else if (call.in_voicemail) {
            finalStatus = 'voicemail';
          } else if (call.disconnection_reason === 'user_hangup' && call.duration_ms < 30000) {
            finalStatus = 'no-answer';
          }

          // Fetch session (to get user_id)
          const { data: session, error: sessErr } = await supabase
            .from('web_call_sessions')
            .select('user_id, agent_id')
            .eq('id', sessionId)
            .single();

          if (sessErr || !session) {
            console.error('Failed to load web_call_session for billing:', sessErr);
          }

          // Compute duration and costs
          const durationSeconds = call.call_cost?.total_duration_seconds || (call.duration_ms ? Math.round(call.duration_ms / 1000) : null);
          const retellCostCents = call.call_cost?.combined_cost ? Math.round(call.call_cost.combined_cost) : 0;
          const userCostCents = retellCostCents > 0 ? Math.ceil(retellCostCents * 1.667) : 0;

          // Update session base fields
          const sessionUpdate: any = {
            status: finalStatus,
            duration_seconds: durationSeconds,
            retell_call_id: call.call_id,
          };
          if (call.recording_url) sessionUpdate.recording_url = call.recording_url;
          if (call.transcript) sessionUpdate.transcript = call.transcript;
          if (call.end_timestamp) sessionUpdate.ended_at = new Date(call.end_timestamp).toISOString();

          const { error: updErr } = await supabase
            .from('web_call_sessions')
            .update(sessionUpdate)
            .eq('id', sessionId);

          if (updErr) {
            console.error('Error updating web_call_sessions (ended):', updErr);
          } else {
            console.log(`✅ Updated web_call_session ${sessionId} to ${finalStatus}`);
          }

          // Deduct credits if any
          if (retellCostCents > 0 && session?.user_id) {
            console.log(`Web call cost - Retell: $${(retellCostCents / 100).toFixed(2)}, User charged: $${(userCostCents / 100).toFixed(2)}`);
            const { data: rpcResult } = await supabase.rpc('atomic_deduct_web_call_cost', {
              p_user_id: session.user_id,
              p_cost_cents: userCostCents,
              p_web_call_id: sessionId,
              p_call_metadata: {
                call_id: call.call_id,
                agent_id: session.agent_id,
                web_call_session_id: sessionId,
                duration_seconds: durationSeconds,
                retell_cost_cents: retellCostCents,
                markup_multiplier: 1.667,
                cost_breakdown: call.call_cost,
                description: `Web call (${durationSeconds || 0}s)`
              }
            });

            if (rpcResult?.success) {
              console.log(`💳 Deducted $${(userCostCents / 100).toFixed(2)} from user ${session.user_id}`);
              console.log(`🧾 Transaction ID: ${rpcResult.transaction_id}`);
            } else {
              console.error(`❌ Credit deduction failed for web call: ${rpcResult?.error}`);
            }
          } else if (retellCostCents === 0) {
            console.log('ℹ️ Zero cost web call - no credit deduction needed');
          }

          // Extract appointment info (if any) and save it
          const appt = extractAppointment(call);
          if (appt) {
            const { error: apptErr } = await supabase
              .from('web_call_sessions')
              .update({ appointment_data: appt })
              .eq('id', sessionId);
            if (apptErr) {
              console.error('Error updating appointment_data for web_call_session:', apptErr);
            } else {
              console.log('✅ Appointment data saved for web_call_session', sessionId, appt);
            }
          }
        }

        break;
      }
        
      case 'call_analyzed': {
        const analyzedCall = payload.call;
        const analyzedMetadata = analyzedCall.metadata || {};
        
        console.log('Call analyzed:', analyzedCall.call_id);
        console.log('Call analysis data:', analyzedCall.call_analysis);

        if (analyzedMetadata.attempt_id && analyzedCall.call_analysis) {
          // Update with analysis data
          const analysisUpdate = {
            call_summary: analyzedCall.call_analysis.call_summary || null,
            call_successful: analyzedCall.call_analysis.call_successful || null,
            custom_analysis: analyzedCall.call_analysis.custom_analysis_data || null,
            retell_call_data: analyzedCall // Update with full data including analysis
          };

          console.log('📊 Analysis update data:', JSON.stringify(analysisUpdate, null, 2));

          const { error } = await supabase
            .from('campaign_contact_attempts')
            .update(analysisUpdate)
            .eq('id', analyzedMetadata.attempt_id);

          if (error) {
            console.error('Error updating analysis:', error);
          } else {
            console.log(`✅ Updated analysis for attempt ${analyzedMetadata.attempt_id}`);
            if (analyzedCall.call_analysis.call_summary) {
              console.log(`📝 Call summary: ${analyzedCall.call_analysis.call_summary}`);
            }
            // Extract appointment info from analyzed payload too (more reliable)
            const appt = extractAppointment(analyzedCall);
            if (appt) {
              const { error: apptErr } = await supabase
                .from('campaign_contact_attempts')
                .update({ appointment_data: appt })
                .eq('id', analyzedMetadata.attempt_id);
              if (apptErr) {
                console.error('Error updating appointment_data (analyzed):', apptErr);
              } else {
                console.log('✅ Appointment data saved from analyzed payload for attempt', analyzedMetadata.attempt_id, appt);
              }
            }
          }
        } else {
          console.log('No attempt_id or call_analysis in analyzed webhook, skipping update');
        }

        // New flow: web calls analysis
        if (analyzedMetadata.web_call_session_id && analyzedCall.call_analysis) {
          const sessionId = analyzedMetadata.web_call_session_id as string;
          const analysisUpdate: any = {
            call_summary: analyzedCall.call_analysis.call_summary || null,
            call_successful: analyzedCall.call_analysis.call_successful || null,
            custom_analysis: analyzedCall.call_analysis.custom_analysis_data || null,
          };
          if (analyzedCall.transcript) analysisUpdate.transcript = analyzedCall.transcript;

          console.log('📊 Web call analysis update data:', JSON.stringify(analysisUpdate, null, 2));

          const { error: wcsAnalysisErr } = await supabase
            .from('web_call_sessions')
            .update(analysisUpdate)
            .eq('id', sessionId);

          if (wcsAnalysisErr) {
            console.error('Error updating web_call_sessions analysis:', wcsAnalysisErr);
          } else {
            console.log(`✅ Updated analysis for web_call_session ${sessionId}`);
          }

          // Extract appointment info here as well
          const appt = extractAppointment(analyzedCall);
          if (appt) {
            const { error: apptErr } = await supabase
              .from('web_call_sessions')
              .update({ appointment_data: appt })
              .eq('id', sessionId);
            if (apptErr) {
              console.error('Error updating appointment_data (web call analyzed):', apptErr);
            } else {
              console.log('✅ Appointment data saved from analyzed payload for web_call_session', sessionId, appt);
            }
          }
        }

        break;
      }
        
      default:
        console.log('Unhandled webhook event:', payload.event);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
