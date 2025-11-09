import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts'
import { parseRetellError, validateCalComCredentials } from '../_shared/retell-error-parser.ts'
import {
  getUserFriendlyError,
  logError,
  validateRequiredFields,
  retryWithBackoff,
  createErrorResponse
} from '../_shared/error-handler.ts'
import {
  resolvePlaceholders,
  applyReplacements
} from '../_shared/placeholder-resolver.ts'
import {
  validatePlaceholderScopes,
  validateRequiredPlaceholders,
  formatValidationErrors
} from '../_shared/placeholder-validator.ts'
import type { PlaceholderSchema } from '../_shared/placeholder-types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildBusinessHoursString(identity: any, conversationFlow: any): string {
  if (conversationFlow?.BusinessHours) {
    return conversationFlow.BusinessHours
  }

  const businessHours = identity?.businessHours
  if (
    businessHours &&
    businessHours.startDay &&
    businessHours.endDay &&
    businessHours.startTime &&
    businessHours.endTime
  ) {
    return `${businessHours.startDay} to ${businessHours.endDay} ${businessHours.startTime}-${businessHours.endTime}`
  }

  return ''
}

/**
 * DEPRECATED: Use resolvePlaceholders() with template's placeholderMap instead.
 * This function is kept for backward compatibility with templates that haven't been migrated yet.
 */
function buildWholesalerReplacementMap(
  identity: any,
  realtorProfile: any,
  conversationFlow: any,
  keyValuePoints: any,
  voiceStyle: any
) {
  console.warn('Using deprecated buildWholesalerReplacementMap. Please migrate template to use placeholderMap.');

  const conversation = conversationFlow || {}
  const keyPoints = keyValuePoints || {}
  const businessHours = buildBusinessHoursString(identity, conversation)

  const voiceSample =
    voiceStyle?.styleSample ||
    conversation.VoiceStyleSample ||
    ''

  return {
    CompanyName:
      conversation.CompanyName || identity?.brokerageName || '',
    CompanyLocation:
      conversation.CompanyLocation || realtorProfile?.brokerageLocation || '',
    InvestorTitle: conversation.InvestorTitle || '',
    InvestorName: conversation.InvestorName || '',
    CashOfferTimeframe: conversation.CashOfferTimeframe || '',
    OfferDeliveryTimeframe: conversation.OfferDeliveryTimeframe || '',
    TypicalClosingTimeframe: conversation.TypicalClosingTimeframe || '',
    YearsInBusiness: conversation.YearsInBusiness || '',
    PropertiesPurchased: conversation.PropertiesPurchased || '',
    ServiceAreas: conversation.ServiceAreas || realtorProfile?.areasServiced || '',
    CashOfferBenefit1: conversation.CashOfferBenefit1 || keyPoints.valuePoint1 || '',
    CashOfferBenefit2: conversation.CashOfferBenefit2 || keyPoints.valuePoint2 || '',
    CashOfferBenefit3: conversation.CashOfferBenefit3 || keyPoints.valuePoint3 || '',
    CashOfferBenefit4: conversation.CashOfferBenefit4 || keyPoints.valuePoint4 || '',
    ProofOfFundsStatement: conversation.ProofOfFundsStatement || '',
    SpecialtySituation1: conversation.SpecialtySituation1 || '',
    SpecialtySituation2: conversation.SpecialtySituation2 || '',
    SpecialtySituation3: conversation.SpecialtySituation3 || '',
    SpecialtySituation4: conversation.SpecialtySituation4 || '',
    SpecialtySituation5: conversation.SpecialtySituation5 || '',
    MarketConditionStatement: conversation.MarketConditionStatement || '',
    SimilarSituationExample: conversation.SimilarSituationExample || '',
    ThinkAboutItResponse: conversation.ThinkAboutItResponse || '',
    VoiceStyleSample: voiceSample,
    BusinessHours: businessHours
  }
}

// Helper function to clean states for Retell API
function cleanStatesForRetell(states: any[]): any[] {
  if (!Array.isArray(states)) return []
  
  return states.map(state => {
    // Remove properties that shouldn't be sent to Retell API
    const { edges, tools, ...cleanState } = state
    return cleanState
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { agent_id, configuration } = await req.json()
    
    // Get the agent with template (draft or deployed)
    const { data: agent } = await supabase
      .from('user_agents')
      .select('*, agent_templates!inner(*)')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .single()
      
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id)
    if (!retellApiKey) {
      return new Response(JSON.stringify({ error: 'Retell API key not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if agent is used in active/paused/scheduled campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, status, name')
      .eq('agent_id', agent_id)
      .in('status', ['active', 'paused', 'scheduled'])
    
    const hasActiveCampaigns = campaigns && campaigns.length > 0
    
    // Block updates if agent is in use by active campaigns
    if (hasActiveCampaigns) {
      console.log(`Agent ${agent_id} cannot be edited - used in ${campaigns.length} active campaign(s)`)
      
      const campaignNames = campaigns.map(c => c.name).join(', ')
      
      return new Response(JSON.stringify({ 
        error: 'Cannot edit agent while it is being used in active campaigns',
        message: `This agent is currently being used in ${campaigns.length} campaign(s): ${campaignNames}. Please pause or stop all campaigns before making changes.`,
        activeCampaigns: campaigns.length,
        campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status }))
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    // Determine which prompt to use for LLM update
    let promptForLLM: string
    if (agent.dynamic_prompt) {
      // Use existing dynamic prompt if available
      console.log('Using existing dynamic prompt')
      promptForLLM = agent.dynamic_prompt
    } else {
      // Process the prompt with user customizations using base_prompt
      console.log('No active campaigns or no dynamic prompt, using base_prompt')
      promptForLLM = processPromptWithCustomizations(
        agent.agent_templates.base_prompt,
        configuration.identity,
        configuration.realtorProfile,
        configuration.conversationFlow,
        configuration.keyValuePoints,
        configuration.personalityTraits || [],
        configuration.voiceStyle || {},
        agent.agent_templates.template_type,
        agent.agent_templates.default_settings,
        configuration
      )
    }
    
    // Always save the user's customizations to configured_prompt for future template usage
    const configuredPrompt = processPromptWithCustomizations(
      agent.agent_templates.base_prompt,
      configuration.identity,
      configuration.realtorProfile,
      configuration.conversationFlow,
      configuration.keyValuePoints,
      configuration.personalityTraits || [],
      configuration.voiceStyle || {},
      agent.agent_templates.template_type,
      agent.agent_templates.default_settings,
      configuration
    )

    // Validate Cal.com credentials before updating (support both field name formats)
    const calEnabled = configuration.integrations?.enableCalCom || 
                      configuration.integrations?.enableCalIntegration;
    const calApiKey = configuration.integrations?.calComApiKey || 
                     configuration.integrations?.calApiKey;
    const calEventId = configuration.integrations?.calComEventTypeId || 
                      configuration.integrations?.calEventId;
    
    if (calEnabled || calApiKey) {
      const calValidationError = validateCalComCredentials(calApiKey, calEventId);
      if (calValidationError) {
        return new Response(JSON.stringify({ error: calValidationError }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Update LLM with states from template
    const llmUpdateData: any = {
      general_prompt: promptForLLM,
      general_tools: buildGeneralTools(configuration.integrations)
    }
    
    // Only set begin_message if it's provided
    if (configuration.advanced?.beginMessage) {
      llmUpdateData.begin_message = configuration.advanced.beginMessage
    }
    
    // Add post-call analysis to LLM as well (some Retell configs require it here)
    if (configuration.postCallAnalysis !== undefined && Array.isArray(configuration.postCallAnalysis)) {
      if (configuration.postCallAnalysis.length > 0) {
        llmUpdateData.post_call_analysis_data = configuration.postCallAnalysis.map((item: any) => ({
          type: 'string',
          name: item.name || '',
          description: item.description || ''
        }))
      }
    }

    // Include states and starting_state from template if they exist
    const templateSettings = agent.agent_templates.default_settings || {}
    if (templateSettings.states && Array.isArray(templateSettings.states)) {
      console.log('Original template states:', JSON.stringify(templateSettings.states, null, 2))
      console.log('Configuration conversationFlow:', JSON.stringify(configuration.conversationFlow, null, 2))
      console.log('Template type:', agent.agent_templates.template_type)
      
      // Process state prompts with user customizations before sending to Retell
      const processedStates = processStatePrompts(
        templateSettings.states,
        configuration.identity,
        configuration.realtorProfile,
        configuration.conversationFlow,
        configuration.keyValuePoints,
        configuration.personalityTraits || [],
        configuration.voiceStyle || {},
        agent.agent_templates.template_type,
        templateSettings,
        configuration
      )
      
      console.log('Processed states after variable replacement:', JSON.stringify(processedStates, null, 2))
      llmUpdateData.states = cleanStatesForRetell(processedStates)
      
      // Set starting_state if it exists in template
      if (templateSettings.starting_state) {
        llmUpdateData.starting_state = templateSettings.starting_state
      } else if (templateSettings.states.length > 0) {
        // Default to first state if no starting_state specified
        llmUpdateData.starting_state = templateSettings.states[0].name
      }
    }

    console.log('Updating LLM with data:', JSON.stringify(llmUpdateData, null, 2))

    const llmResponse = await fetch(`https://api.retellai.com/update-retell-llm/${agent.retell_llm_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(llmUpdateData)
    })

    if (!llmResponse.ok) {
      const error = await llmResponse.text()
      console.error('Failed to update LLM:', error)
      const userFriendlyError = parseRetellError(error, 'LLM update');
      return new Response(JSON.stringify({ error: userFriendlyError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update Agent - use actual values from configuration without overriding with defaults
    const agentUpdateData: any = {
      language: 'en-US'
    }
    
    console.log('Voice configuration received:', JSON.stringify(configuration.voice, null, 2))
    
    // Only set voice fields if they're explicitly provided
    if (configuration.voice?.selectedVoice !== undefined) {
      agentUpdateData.voice_id = configuration.voice.selectedVoice
      console.log('Setting voice_id:', configuration.voice.selectedVoice)
    }
    
    // IMPORTANT: voice_model must be set when voice_id is an ElevenLabs voice
    if (configuration.voice?.voiceModel !== undefined) {
      agentUpdateData.voice_model = configuration.voice.voiceModel
      console.log('Setting voice_model from config:', configuration.voice.voiceModel)
    } else if (configuration.voice?.selectedVoice?.startsWith('11labs-')) {
      // Default to eleven_turbo_v2 for ElevenLabs voices if not specified
      agentUpdateData.voice_model = 'eleven_turbo_v2'
      console.log('Setting default voice_model for ElevenLabs voice')
    }
    
    if (configuration.voice?.temperature !== undefined) {
      agentUpdateData.voice_temperature = configuration.voice.temperature
    }
    
    // Retell API uses 'voice_speed' not just 'speed'
    if (configuration.voice?.speed !== undefined) {
      agentUpdateData.voice_speed = configuration.voice.speed
    }
    
    // Retell API uses 'volume' for voice volume
    if (configuration.voice?.volume !== undefined) {
      agentUpdateData.volume = configuration.voice.volume
    }
    
    if (configuration.voice?.responsiveness !== undefined) {
      agentUpdateData.responsiveness = configuration.voice.responsiveness
    }
    
    if (configuration.voice?.interruptionSensitivity !== undefined) {
      agentUpdateData.interruption_sensitivity = configuration.voice.interruptionSensitivity
    }
    
    // Only send enable_backchannel once, prefer from voice config
    if (configuration.voice?.enableBackchannel !== undefined) {
      agentUpdateData.enable_backchannel = configuration.voice.enableBackchannel
    }

    // Add settings from speech configuration
    if (configuration.speech) {
      if (configuration.speech.ambientSound && configuration.speech.ambientSound !== "none") {
        agentUpdateData.ambient_sound = configuration.speech.ambientSound
      }
      if (configuration.speech.ambientVolume !== undefined) {
        agentUpdateData.ambient_sound_volume = configuration.speech.ambientVolume
      }
      if (configuration.speech.normalizeForSpeech !== undefined) {
        agentUpdateData.normalize_for_speech = configuration.speech.normalizeForSpeech
      }
      // Only use speech responsiveness if not already set from voice
      if (configuration.speech.responsiveness !== undefined && agentUpdateData.responsiveness === undefined) {
        agentUpdateData.responsiveness = configuration.speech.responsiveness
      }
      // Only use speech interruption_sensitivity if not already set from voice
      if (configuration.speech.interruptionSensitivity !== undefined && agentUpdateData.interruption_sensitivity === undefined) {
        agentUpdateData.interruption_sensitivity = configuration.speech.interruptionSensitivity
      }
      // Only use speech enable_backchannel if not already set from voice
      if (configuration.speech.enableBackchannel !== undefined && agentUpdateData.enable_backchannel === undefined) {
        agentUpdateData.enable_backchannel = configuration.speech.enableBackchannel
      }
    }

    // Add settings from call configuration
    if (configuration.callSettings) {
      if (configuration.callSettings.reminderTriggerMs) {
        agentUpdateData.reminder_trigger_ms = configuration.callSettings.reminderTriggerMs
      }
      if (configuration.callSettings.reminderMaxCount !== undefined) {
        agentUpdateData.reminder_max_count = configuration.callSettings.reminderMaxCount
      }
      if (configuration.callSettings.endCallAfterSilenceMs) {
        agentUpdateData.end_call_after_silence_ms = configuration.callSettings.endCallAfterSilenceMs
      }
      if (configuration.callSettings.maxCallDurationMs) {
        agentUpdateData.max_call_duration_ms = configuration.callSettings.maxCallDurationMs
      }
      if (configuration.callSettings.beginMessageDelayMs !== undefined) {
        agentUpdateData.begin_message_delay_ms = configuration.callSettings.beginMessageDelayMs
      }
      // Handle voicemail settings from callSettings
      if (configuration.callSettings?.voicemailDetection === true) {
        if (configuration.callSettings.voicemailAction === 'hangup') {
          agentUpdateData.voicemail_option = {
            action: {
              type: 'hangup'
            }
          };
        } else if (configuration.callSettings.voicemailAction === 'leave_message' && configuration.callSettings.voicemailMessage) {
          agentUpdateData.voicemail_option = {
            action: {
              type: 'static_text',
              text: configuration.callSettings.voicemailMessage
            }
          };
        }
      } else {
        // Explicitly set to null to disable voicemail detection
        agentUpdateData.voicemail_option = null;
      }
    }

    // Legacy support for advanced configuration (fallback)
    if (configuration.advanced) {
      if (configuration.advanced.reminderTriggerMs && !configuration.callSettings?.reminderTriggerMs) {
        agentUpdateData.reminder_trigger_ms = configuration.advanced.reminderTriggerMs
      }
      if (configuration.advanced.reminderMaxCount !== undefined && configuration.callSettings?.reminderMaxCount === undefined) {
        agentUpdateData.reminder_max_count = configuration.advanced.reminderMaxCount
      }
      if (configuration.advanced.ambientSound && configuration.advanced.ambientSound !== "none" && !configuration.speech?.ambientSound) {
        agentUpdateData.ambient_sound = configuration.advanced.ambientSound
      }
      if (configuration.advanced.ambientSoundVolume !== undefined && configuration.speech?.ambientVolume === undefined) {
        agentUpdateData.ambient_sound_volume = configuration.advanced.ambientSoundVolume
      }
      if (configuration.advanced.endCallAfterSilenceMs && !configuration.callSettings?.endCallAfterSilenceMs) {
        agentUpdateData.end_call_after_silence_ms = configuration.advanced.endCallAfterSilenceMs
      }
      if (configuration.advanced.maxCallDurationMs && !configuration.callSettings?.maxCallDurationMs) {
        agentUpdateData.max_call_duration_ms = configuration.advanced.maxCallDurationMs
      }
      if (configuration.advanced.beginMessageDelayMs !== undefined && configuration.callSettings?.beginMessageDelayMs === undefined) {
        agentUpdateData.begin_message_delay_ms = configuration.advanced.beginMessageDelayMs
      }
      // Legacy voicemail support removed - now handled by callSettings.voicemailDetection logic above
    }

    // Add post-call analysis if provided (including empty arrays to clear existing data)
    if (configuration.postCallAnalysis !== undefined && Array.isArray(configuration.postCallAnalysis)) {
      // If array is empty, explicitly set to empty array to clear existing data
      if (configuration.postCallAnalysis.length === 0) {
        agentUpdateData.post_call_analysis_data = []
      } else {
        agentUpdateData.post_call_analysis_data = configuration.postCallAnalysis.map((item: any) => ({
          type: 'string',
          name: item.name || '',
          description: item.description || ''
        }))
      }
    }

    console.log('Payload being sent to Retell:', JSON.stringify(agentUpdateData, null, 2));
    
    const agentResponse = await fetch(`https://api.retellai.com/update-agent/${agent.retell_agent_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentUpdateData)
    })

    if (!agentResponse.ok) {
      const error = await agentResponse.text()
      console.error('Failed to update agent:', error)
      const userFriendlyError = parseRetellError(error, 'agent update');
      return new Response(JSON.stringify({ error: userFriendlyError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log the configuration being saved for debugging
    console.log('Full configuration being saved to database:', JSON.stringify(configuration, null, 2))
    
    // Update draft agent in database with configured prompt
    const { data: updatedAgent, error: dbError } = await supabase
      .from('user_agents')
      .update({
        name: configuration.identity?.agentName || agent.name,
        customizations: configuration,
        configured_prompt: configuredPrompt, // Save the user's fully configured prompt
        settings: configuration,
        updated_at: new Date().toISOString()
      })
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(JSON.stringify({ error: 'Failed to update draft agent' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle phone number binding if agent has a phone number
    let phoneBindingWarning = null
    console.log('🔍 DEBUG - Phone binding check:')
    console.log('  - updatedAgent.phone_number_id:', updatedAgent.phone_number_id)
    console.log('  - updatedAgent.retell_agent_id:', updatedAgent.retell_agent_id)
    console.log('  - API key being used:', retellApiKey ? `${retellApiKey.substring(0, 10)}...` : 'NO KEY')
    
    if (updatedAgent.phone_number_id && updatedAgent.retell_agent_id) {
      console.log('📞 Attempting to bind phone number to agent...')
      const bindingResult = await bindPhoneNumberToAgent(updatedAgent.phone_number_id, updatedAgent.retell_agent_id, retellApiKey)
      if (!bindingResult.success) {
        phoneBindingWarning = bindingResult.error || 'Phone number binding failed. You may need to sync phone numbers or reassign the phone number.'
        console.warn('⚠️ Phone binding failed:', phoneBindingWarning)
      } else {
        console.log('✅ Phone binding successful!')
      }
    } else {
      console.log('⏭️ Skipping phone binding - missing phone_number_id or retell_agent_id')
    }

    const response: any = { 
      success: true, 
      data: updatedAgent 
    }
    
    if (phoneBindingWarning) {
      response.warning = phoneBindingWarning
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function processPromptWithCustomizations(
  basePrompt: string,
  identity: any,
  realtorProfile: any,
  conversationFlow: any,
  keyValuePoints: any,
  personalityTraits: string[] = [],
  voiceStyle: any = {},
  templateType?: string,
  templateSettings?: any,
  configuration?: any
): string {
  let prompt = basePrompt

  // ============================================================================
  // NEW: Use placeholderMap if available (data-driven resolution)
  // ============================================================================
  const placeholderMap: PlaceholderSchema[] | undefined = templateSettings?.placeholderMap;

  let resolvedWithPlaceholderMap = false;

  if (placeholderMap && Array.isArray(placeholderMap)) {
    console.log(`Using placeholderMap for template (${placeholderMap.length} placeholders)`);

    // Build customizations object from all config sections
    const customizations = {
      identity,
      realtorProfile,
      conversationFlow,
      keyValuePoints,
      voiceStyle,
      // Add any other top-level config sections
      ...configuration
    };

    try {
      // Validate placeholder scopes in the base prompt
      const scopeErrors = validatePlaceholderScopes(
        basePrompt,
        placeholderMap,
        'config_time'
      );

      if (scopeErrors.length > 0) {
        console.warn('Placeholder scope validation warnings:', formatValidationErrors(scopeErrors));
        // Don't fail - just warn. Some templates may have intentional scope mixing.
      }

      // Validate required placeholders
      const requiredErrors = validateRequiredPlaceholders(
        placeholderMap,
        customizations,
        'config_time'
      );

      if (requiredErrors.length > 0) {
        console.warn('Missing required placeholders:', formatValidationErrors(requiredErrors));
        // Don't fail - use default values instead
      }

      // Resolve config-time placeholders using the generic resolver
      const replacements = resolvePlaceholders(
        placeholderMap,
        customizations,
        'config_time'
      );

      // Apply replacements
      prompt = applyReplacements(prompt, replacements);

      console.log(`Applied ${Object.keys(replacements).length} placeholder replacements`);

      resolvedWithPlaceholderMap = true;
    } catch (error) {
      console.error('Error using placeholderMap, falling back to legacy logic:', error);
      // Fall through to legacy logic below
    }
  }

  // ============================================================================
  // LEGACY: Hardcoded placeholder resolution (for templates without placeholderMap)
  // ============================================================================
  if (resolvedWithPlaceholderMap) {
    console.log('Applying legacy placeholder resolution for compatibility');
  } else {
    console.log('Using legacy hardcoded placeholder resolution');
  }

  // Replace identity variables (using single braces)
  if (identity) {
    prompt = prompt.replace(/{AIAgentName}/g, identity.agentName || 'AI Agent')
    // Only replace company name for non-landlord templates
    if (templateType !== 'landlord-qualification') {
      prompt = prompt.replace(/{Brokerage\/Company Name}/g, identity.brokerageName || 'Company')
    }
  }

  // Replace personality traits (join with commas)
  if (personalityTraits && personalityTraits.length > 0) {
    prompt = prompt.replace(/{personalitytraits}/g, personalityTraits.join(', '))
  }

  // Template-specific variable replacements
  if (templateType === 'landlord-qualification') {
    // Replace landlord-specific variables
    if (identity) {
      prompt = prompt.replace(/{current_location}/g, identity.currentLocation || 'currently living with roommates downtown')
      prompt = prompt.replace(/{reason_for_moving}/g, identity.reasonForMoving || 'looking for my own place')
      prompt = prompt.replace(/{move_timeline}/g, identity.moveTimeline || 'next month or two')
      prompt = prompt.replace(/{job_field}/g, identity.jobField || 'marketing')
    }
    
    // Replace landlord conversation flow variables  
    if (conversationFlow) {
      prompt = prompt.replace(/{reason_for_calling}/g, conversationFlow.reasonForCalling || "I'm looking for an apartment in the area and wanted to see if you might have anything coming available")
      prompt = prompt.replace(/{vacancy_timeframe}/g, conversationFlow.vacancyTimeframe || 'next month or two')
      prompt = prompt.replace(/{property_details_to_gather}/g, conversationFlow.propertyDetailsToGather || 'Monthly rent amount, Number of bedrooms and bathrooms, Anticipated availability date')
      prompt = prompt.replace(/{closing_message}/g, conversationFlow.closingMessage || "Mention that you'll be reaching out again shortly")
    }
  } else {
    // Replace realtor profile variables for real estate templates
    if (realtorProfile) {
      prompt = prompt.replace(/{Realtor'sName}/g, realtorProfile.realtorName || 'John Smith')
      prompt = prompt.replace(/{BrokerageName}/g, realtorProfile.brokerageName || 'Real Estate Company')
      prompt = prompt.replace(/{BrokerageLocation}/g, realtorProfile.brokerageLocation || 'Local Area')
      prompt = prompt.replace(/{YearsofExperience}/g, realtorProfile.yearsExperience || '5')
      prompt = prompt.replace(/{NumberofHomes Sold}/g, realtorProfile.homesSold || '50')
      prompt = prompt.replace(/{AreasServiced}/g, realtorProfile.areasServiced || 'Local Area')
    }
  }

  // Replace conversation flow variables with defensive normalization
  if (conversationFlow) {
    // Normalize legacy follow-up text to templated variable if missing or legacy "John" is present
    const legacyFollowUp = 'Offer to have John call when in their area'
    const normalizedFollowUp =
      !conversationFlow.followUpOffer ||
      conversationFlow.followUpOffer.trim() === '' ||
      conversationFlow.followUpOffer === legacyFollowUp
        ? "Offer to have {Realtor'sName} call when in their area"
        : conversationFlow.followUpOffer

    prompt = prompt.replace(/{Introduction Line}/g, conversationFlow.introductionLine || 'State only your name')
    prompt = prompt.replace(/{Opening Permission Line}/g, conversationFlow.permissionLine || 'State that you were wondering to ask them a quick question, if that\'s okay')
    prompt = prompt.replace(/{Market Insight Line}/g, conversationFlow.marketInsights || 'Share briefly current market insight about buyers we are working with in their area')
    prompt = prompt.replace(/\{\{Offer Pitch Line\}\}/g, conversationFlow.offerPresentation || 'Present the possibility of showing our buyers their home and bringing them an offer within 30 days from one of them')
    prompt = prompt.replace(/\{\{Revival Line For Not Interested\}\}/g, conversationFlow.revivalAttempt || 'Make one revival attempt by stating how we have worked with many people in their situation and asking about their main concern regarding selling')
    prompt = prompt.replace(/{Pain Point Question}/g, conversationFlow.previousExperience || 'Ask about their biggest challenge during the previous listing')
    prompt = prompt.replace(/{Meeting Transition Line}/g, 'Smoothly introduce the idea of connecting further by framing it as the natural next step')
    prompt = prompt.replace(/{Trust Building Line}/g, 'Position a brief meeting as the best way to provide personalized insights specific to their situation')
    prompt = prompt.replace(/{No Obligation Reassurance Line}/g, conversationFlow.hesitationHandling || 'Emphasize no-obligation nature of meeting')
    prompt = prompt.replace(/{Value Reassurance Line}/g, conversationFlow.alternativeApproach || 'Focus on valuable market insights they\'ll receive')
    prompt = prompt.replace(/{Scarcity Line}/g, conversationFlow.scarcityLine || 'Limited availability this week')
    prompt = prompt.replace(/{Follow Up Offer Line}/g, normalizedFollowUp)
  }

  const promptFactoryGuidelines = templateSettings?.prompt_factory?.guidelines;
  if (promptFactoryGuidelines && typeof promptFactoryGuidelines === 'object') {
    const overrides = configuration?.promptFactoryGuidelines || configuration?.conversationFlow || {};
    for (const [semanticKey, meta] of Object.entries(promptFactoryGuidelines)) {
      const guideline = meta as { placeholder?: string; default_instruction?: string };
      if (!guideline?.placeholder) continue;
      const rawValue = overrides?.[semanticKey] ?? guideline.default_instruction ?? '';
      if (!rawValue || typeof rawValue !== 'string') continue;
      const escaped = guideline.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      prompt = prompt.replace(regex, rawValue);
    }
  }

  // Final pass for realtor variables in case conversation flow introduced them
  if (templateType !== 'landlord-qualification' && realtorProfile) {
    prompt = prompt.replace(/{Realtor'sName}/g, realtorProfile.realtorName || 'John Smith')
    prompt = prompt.replace(/{BrokerageName}/g, realtorProfile.brokerageName || 'Real Estate Company')
    prompt = prompt.replace(/{BrokerageLocation}/g, realtorProfile.brokerageLocation || 'Local Area')
    prompt = prompt.replace(/{YearsofExperience}/g, realtorProfile.yearsExperience || '5')
    prompt = prompt.replace(/{NumberofHomes Sold}/g, realtorProfile.homesSold || '50')
    prompt = prompt.replace(/{AreasServiced}/g, realtorProfile.areasServiced || 'Local Area')
  }

  // Replace key value points
  if (keyValuePoints) {
    for (let i = 1; i <= 4; i++) {
      const key = `valuePoint${i}`
      if (keyValuePoints[key]) {
        prompt = prompt.replace(new RegExp(`\\{Key Value Point ${i}\\}`, 'g'), keyValuePoints[key])
      }
    }
  }

  const explicitVoiceSample = voiceStyle?.styleSample || null
  if (explicitVoiceSample) {
    prompt = prompt.replace(/{Voice Style Sample}/g, explicitVoiceSample)
    prompt = prompt.replace(/{VoiceStyleSample}/g, explicitVoiceSample)
  }

  if (templateType === 'wholesaler') {
    const replacements = buildWholesalerReplacementMap(
      identity,
      realtorProfile,
      conversationFlow,
      keyValuePoints,
      voiceStyle
    )

    for (const [token, value] of Object.entries(replacements)) {
      if (value === undefined || value === null) continue
      const regex = new RegExp(`\\{${token}\\}`, 'g')
      prompt = prompt.replace(regex, `${value}`)
    }

    if (!explicitVoiceSample) {
      const fallbackVoiceSample = replacements.VoiceStyleSample || ''
      prompt = prompt.replace(/{Voice Style Sample}/g, fallbackVoiceSample)
      prompt = prompt.replace(/{VoiceStyleSample}/g, fallbackVoiceSample)
    }
  }

  // Timezone handling: replace current_time variable with selected timezone token
  try {
    const selectedTz = identity?.agentTimezone && typeof identity.agentTimezone === 'string' && identity.agentTimezone.length > 0
      ? identity.agentTimezone
      : 'America/New_York';
    const tzToken = `{{current_time_${selectedTz}}}`;

    // Replace any current_time (generic or with a prior suffix) with the selected timezone token
    prompt = prompt.replace(/\{\{current_time(?:_[^}]+)?\}\}/g, tzToken);

    // Remove explicit conversion instruction phrases if present
    // Example: ", convert this time into Eastern Standard Time when used in conversation"
    prompt = prompt.replace(/,\s*convert this time into [^.\n]+(?: when used in conversation)?\.?/gi, '');
  } catch (_) {
    // no-op: keep prompt as-is if anything fails
  }

  return prompt
}

function processStatePrompts(
  states: any[],
  identity: any,
  realtorProfile: any,
  conversationFlow: any,
  keyValuePoints: any,
  personalityTraits: string[] = [],
  voiceStyle: any = {},
  templateType?: string,
  templateSettings?: any,
  configuration?: any
): any[] {
  console.log('processStatePrompts called with:')
  console.log('- states length:', states?.length)
  console.log('- conversationFlow:', JSON.stringify(conversationFlow, null, 2))
  console.log('- templateType:', templateType)
  
  if (!Array.isArray(states)) return []
  
  return states.map((state, index) => {
    console.log(`Processing state ${index}: ${state.name}`)
    if (state.state_prompt) {
      console.log('Original state_prompt:', state.state_prompt.substring(0, 200) + '...')
      
      // Process state_prompt using the same logic as general prompt
      let processedStatePrompt = processPromptWithCustomizations(
        state.state_prompt,
        identity,
        realtorProfile,
        conversationFlow,
        keyValuePoints,
        personalityTraits,
        voiceStyle,
        templateType,
        templateSettings,
        configuration
      )

      // Apply Business Hours override without timezone abbreviations
      try {
        const bh = identity?.businessHours || {}
        const startDay = bh.startDay || 'Monday'
        const endDay = bh.endDay || 'Friday'
        const startTime = bh.startTime || '9am'
        const endTime = bh.endTime || '5pm'
        const hoursString = `Business Hours: ${startDay} to ${endDay} ${startTime}-${endTime}.`
        console.log('Computed Business Hours string:', hoursString)

        const businessHoursRegex = /Business Hours?:[^\n]*\./gi
        if (businessHoursRegex.test(processedStatePrompt)) {
          processedStatePrompt = processedStatePrompt.replace(businessHoursRegex, hoursString)
        }
      } catch (_) {
        // no-op
      }
      
      console.log('Processed state_prompt:', processedStatePrompt.substring(0, 200) + '...')
      console.log('Variables replaced in state prompt?', state.state_prompt !== processedStatePrompt)
      
      return {
        ...state,
        state_prompt: processedStatePrompt
      }
    }
    
    return state
  })
}

function buildGeneralTools(integrations: any): any[] {
  console.log('Building general tools with integrations:', JSON.stringify(integrations, null, 2))
  
  const tools = [
    {
      type: 'end_call',
      name: 'end_call',
      description: ''
    }
  ]

  // Support both field name formats for backwards compatibility
  const enableTransfer = integrations?.enableTransfer || integrations?.enableCallTransfer;
  const enableCalCom = integrations?.enableCalCom || integrations?.enableCalIntegration;
  const calApiKey = integrations?.calComApiKey || integrations?.calApiKey;
  const calEventId = integrations?.calComEventTypeId || integrations?.calEventId;
  const calTimezone = integrations?.calComTimezone || integrations?.calTimezone || 'America/New_York';

  if (enableTransfer && integrations.transferPhoneNumber) {
    console.log('Adding transfer call tool')
    tools.push({
      type: 'transfer_call',
      name: 'transfer_call',
      transfer_destination: {
        type: 'predefined',
        number: integrations.transferPhoneNumber
      },
      transfer_option: {
        type: 'cold_transfer'
      }
    })
  }

  if (enableCalCom && calApiKey && calEventId) {
    console.log('Adding Cal.com tools with API key:', calApiKey, 'Event ID:', calEventId)
    
    tools.push({
      type: 'check_availability_cal',
      name: 'check_availability_cal',
      description: 'Check availability for appointment booking',
      cal_api_key: calApiKey,
      event_type_id: parseInt(calEventId),
      timezone: calTimezone
    })

    tools.push({
      type: 'book_appointment_cal',
      name: 'book_appointment_cal',
      description: 'Book an appointment for the user',
      cal_api_key: calApiKey,
      event_type_id: parseInt(calEventId),
      timezone: calTimezone
    })
  }

  console.log('Generated tools:', JSON.stringify(tools, null, 2))
  return tools
}

// Bind phone number to agent via Retell API
async function bindPhoneNumberToAgent(phoneNumberId: string, retellAgentId: string, retellApiKey: string): Promise<{ success: boolean; error?: string }> {
  console.log('🔄 Starting bindPhoneNumberToAgent function')
  console.log('  - phoneNumberId (DB UUID):', phoneNumberId)
  console.log('  - retellAgentId:', retellAgentId)
  console.log('  - API key:', retellApiKey ? `${retellApiKey.substring(0, 10)}...` : 'NO KEY')
  
  try {
    // Get phone number details from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    console.log('📱 Fetching phone number from database...')
    const { data: phoneData, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('phone_number, retell_phone_id')
      .eq('id', phoneNumberId)
      .single()

    if (phoneError || !phoneData) {
      console.error('❌ Error fetching phone number for binding:', phoneError)
      return { success: false, error: 'Phone number not found in database' }
    }

    console.log('📱 Phone data retrieved:')
    console.log('  - phone_number:', phoneData.phone_number)
    console.log('  - retell_phone_id:', phoneData.retell_phone_id)
    console.log('  - retell_phone_id type:', typeof phoneData.retell_phone_id)
    console.log('  - retell_phone_id length:', phoneData.retell_phone_id?.length)

    if (!phoneData.retell_phone_id) {
      console.error('❌ Phone number missing retell_phone_id, cannot bind')
      return { success: false, error: 'Phone number not synced with Retell. Please sync phone numbers first.' }
    }

    console.log(`🔗 Attempting to bind phone ${phoneData.phone_number} (ID: ${phoneData.retell_phone_id}) to agent ${retellAgentId}`)

    // Get the user agent record to get the actual agent ID
    console.log('🤖 Fetching agent data from database...')
    const { data: agentData, error: agentError } = await supabase
      .from('user_agents')
      .select('id')
      .eq('retell_agent_id', retellAgentId)
      .single()

    if (agentError || !agentData) {
      console.error('❌ Error fetching agent data for binding:', agentError)
      return { success: false, error: 'Agent not found in database' }
    }

    console.log('🤖 Agent found in DB with id:', agentData.id)

    // First, verify the agent exists in Retell
    console.log('🔍 Verifying agent exists in Retell...')
    const agentCheckUrl = `https://api.retellai.com/get-agent/${retellAgentId}`
    console.log('  - Checking URL:', agentCheckUrl)
    
    const agentCheckResponse = await fetch(agentCheckUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      }
    })
    
    if (!agentCheckResponse.ok) {
      const agentCheckError = await agentCheckResponse.text()
      console.error('❌ Agent not found in Retell!')
      console.error('  - Status:', agentCheckResponse.status)
      console.error('  - Error:', agentCheckError)
      return { success: false, error: `Agent ${retellAgentId} not found in Retell. Agent may have been deleted or ID is incorrect.` }
    }
    
    const agentDetails = await agentCheckResponse.json()
    console.log('✅ Agent found in Retell:')
    console.log('  - Agent ID:', agentDetails.agent_id)
    console.log('  - Agent Name:', agentDetails.agent_name)

    // Prepare the API call
    // IMPORTANT: Retell ALWAYS uses the phone number itself as the ID
    // We ignore retell_phone_id because it might be wrong from old syncs
    const phoneIdToUse = phoneData.phone_number
    const url = `https://api.retellai.com/update-phone-number/${phoneIdToUse}`
    const requestBody = {
      outbound_agent_id: retellAgentId
    }
    
    console.log('🌐 Making Retell API call to bind phone:')
    console.log('  - URL:', url)
    console.log('  - Phone ID being used:', phoneIdToUse)
    console.log('  - Is using retell_phone_id?:', phoneIdToUse === phoneData.retell_phone_id)
    console.log('  - Is using phone_number?:', phoneIdToUse === phoneData.phone_number)
    console.log('  - Method: PATCH')
    console.log('  - Body:', JSON.stringify(requestBody))
    console.log('  - Authorization:', `Bearer ${retellApiKey ? retellApiKey.substring(0, 10) : 'NO KEY'}...`)

    // Call Retell API to bind phone number to agent
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    console.log('📡 Response status:', response.status)
    console.log('📡 Response statusText:', response.statusText)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Retell API error response:')
      console.error('  - Status:', response.status)
      console.error('  - Status Text:', response.statusText)
      console.error('  - Response Body:', errorText)
      console.error('  - Full URL that failed:', url)
      console.error('  - Agent ID sent:', retellAgentId)
      console.error('  - Phone ID sent:', phoneData.retell_phone_id)
      
      // Check if it's a Not Found error
      if (response.status === 404 || errorText.includes('Not Found')) {
        console.error('🔍 404 Error - Either phone or agent not found in Retell')
        return { success: false, error: 'Phone number not found in Retell. Please sync phone numbers or purchase a new phone number.' }
      }
      
      return { success: false, error: `Failed to bind phone number: ${errorText}` }
    }

    const responseData = await response.json()
    console.log('✅ Retell API success response:', JSON.stringify(responseData, null, 2))

    // Update phone_numbers table to reference the agent
    console.log('💾 Updating phone_numbers table...')
    await supabase
      .from('phone_numbers')
      .update({ agent_id: agentData.id })
      .eq('id', phoneNumberId)

    console.log('✅ Phone number successfully bound to agent via Retell API')
    return { success: true }
  } catch (error) {
    console.error('💥 Unexpected error in bindPhoneNumberToAgent:', error)
    console.error('  - Error message:', error.message)
    console.error('  - Error stack:', error.stack)
    return { success: false, error: `Unexpected error: ${error.message}` }
  }
}
