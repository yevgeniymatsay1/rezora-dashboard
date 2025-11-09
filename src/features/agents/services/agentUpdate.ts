import { supabase } from '@/integrations/supabase/client';
import { AgentIdentityForm, AgentTemplate } from '../types/agent.types';
import { buildWholesalerConversationFlow } from '../utils/wholesaler';

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? {}));

const setValueAtPath = (target: Record<string, any>, path: string, value: any) => {
  if (!path) return;
  const keys = path.split('.');
  let current = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
    } else {
      current[key] = current[key] ?? {};
      current = current[key];
    }
  });
};

const deepMerge = (target: any, source: any): any => {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return target;
  const output: any = Array.isArray(target) ? [...target] : { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    if (sourceValue === undefined) continue;
    if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
      output[key] = deepMerge(output[key] ?? {}, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  }
  return output;
};

const getNestedValue = (obj: any, path: string) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc: any, key: string) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
};

export async function updateExistingAgent(
  agentId: string,
  formData: AgentIdentityForm,
  phoneNumberId: string,
  template: AgentTemplate | null
): Promise<void> {
  // Get existing agent data
  const { data: existingAgent, error: fetchError } = await supabase
    .from('user_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (fetchError || !existingAgent) {
    throw new Error('Agent not found');
  }

  // Update Retell agent if it exists
  if (existingAgent.retell_agent_id) {
    const placeholderMap = Array.isArray(template?.default_settings?.placeholderMap)
      ? (template?.default_settings?.placeholderMap as Array<any>)
      : [];
    const templateDefaults = template?.default_settings?.defaults
      ? cloneDeep(template.default_settings.defaults)
      : {};

    // Build configuration object matching what update-draft-agent expects
    const manualConfiguration = {
      identity: {
        agentName: formData.agentName || '',
        brokerageName: formData.companyName || '',
        currentLocation: formData.currentLocation || '',
        reasonForMoving: formData.reasonForMoving || '',
        moveTimeline: formData.moveTimeline || '',
        jobField: formData.jobField || '',
        agentTimezone: formData.agentTimezone || 'America/New_York',
        businessHours: {
          startDay: formData.businessStartDay || 'Monday',
          endDay: formData.businessEndDay || 'Friday',
          startTime: formData.businessStartTime || '9am',
          endTime: formData.businessEndTime || '5pm'
        }
      },
      realtorProfile: {
        realtorName: formData.realtorName || '',
        brokerageName: formData.companyName || '',
        brokerageLocation: formData.realtorLocation || '',
        yearsExperience: formData.yearsExperience || '',
        homesSold: formData.homesSold || '',
        areasServiced: formData.areasServiced || ''
      },
      voice: {
        selectedVoice: formData.voiceId || '11labs-Adrian',
        voiceModel: formData.voiceModel || 'eleven_turbo_v2',
        speed: formData.voiceSpeed !== undefined ? formData.voiceSpeed : 0.92,
        temperature: formData.voiceTemperature !== undefined ? formData.voiceTemperature : 1,
        volume: formData.volume !== undefined ? formData.volume : 1,
        responsiveness: formData.responsiveness !== undefined ? formData.responsiveness : 0.8,
        interruptionSensitivity: formData.interruptionSensitivity !== undefined ? formData.interruptionSensitivity : 0.7,
        enableBackchannel: formData.enableBackchannel !== undefined ? formData.enableBackchannel : true
      },
      speech: {
        ambientSound: formData.ambientSound || 'none',
        ambientVolume: formData.ambientVolume !== undefined ? formData.ambientVolume : 0.5,
        normalizeForSpeech: formData.normalizeForSpeech !== undefined ? formData.normalizeForSpeech : true,
        responsiveness: formData.responsiveness !== undefined ? formData.responsiveness : 0.8,
        interruptionSensitivity: formData.interruptionSensitivity !== undefined ? formData.interruptionSensitivity : 0.7,
        enableBackchannel: formData.enableBackchannel !== undefined ? formData.enableBackchannel : true
      },
      conversationFlow: template?.template_type === 'landlord' ? {
        reasonForCalling: formData.reasonForCalling || '',
        vacancyTimeframe: formData.vacancyTimeframe || '',
        propertyDetailsToGather: formData.propertyDetailsToGather || '',
        closingMessage: formData.closingMessage || '',
        businessStartDay: formData.businessStartDay,
        businessEndDay: formData.businessEndDay,
        businessStartTime: formData.businessStartTime,
        businessEndTime: formData.businessEndTime,
        agentTimezone: formData.agentTimezone,
      } : template?.template_type === 'wholesaler' ? {
        ...buildWholesalerConversationFlow(formData)
      } : {
        introductionLine: formData.introductionLine || '',
        permissionLine: formData.permissionLine || '',
        marketInsights: formData.marketInsights || '',
        offerPresentation: formData.offerPresentation || '',
        scarcityLine: formData.scarcityLine || '',
        revivalAttempt: formData.revivalAttempt || '',
        previousExperience: formData.previousExperience || '',
        hesitationHandling: formData.hesitationHandling || '',
        alternativeApproach: formData.alternativeApproach || '',
        followUpOffer: formData.followUpOffer || '',
        businessStartDay: formData.businessStartDay,
        businessEndDay: formData.businessEndDay,
        businessStartTime: formData.businessStartTime,
        businessEndTime: formData.businessEndTime,
        agentTimezone: formData.agentTimezone,
      },
      keyValuePoints: {
        valuePoint1: formData.valuePoint1 || '',
        valuePoint2: formData.valuePoint2 || '',
        valuePoint3: formData.valuePoint3 || '',
        valuePoint4: formData.valuePoint4 || ''
      },
      personalityTraits: formData.personalityTraits || [],
      callSettings: {
        reminderTriggerMs: formData.reminderTriggerMs ?? 10000,
        reminderMaxCount: formData.reminderMaxCount ?? 2,
        beginMessageDelayMs: formData.beginMessageDelayMs ?? 1000,
        endCallAfterSilenceMs: formData.endCallAfterSilenceMs ?? 600000,
        maxCallDurationMs: formData.maxCallDurationMs ?? 3600000,
        voicemailDetection: formData.voicemailDetection,
        voicemailAction: formData.voicemailAction || 'hangup',
        voicemailMessage: formData.voicemailMessage,
      },
      integrations: {
        // Send both field formats for backwards compatibility with live platform
        enableTransfer: formData.enableTransfer || false,
        enableCallTransfer: formData.enableTransfer || false, // Old field name
        
        enableCalCom: formData.enableCalCom || false,
        enableCalIntegration: formData.enableCalCom || false, // Old field name
        
        calComApiKey: formData.calComApiKey || '',
        calApiKey: formData.calComApiKey || '', // Old field name
        
        calComEventTypeId: formData.calComEventTypeId || '',
        calEventId: formData.calComEventTypeId || '', // Old field name
        
        calComTimezone: formData.calComTimezone || 'America/New_York',
        calTimezone: formData.calComTimezone || 'America/New_York', // Old field name
        
        transferPhoneNumber: formData.transferPhoneNumber || ''
      },
      voiceStyle: {
        styleSample: formData.voiceStyleSample || ''
      }
    };

    let configuration = deepMerge(templateDefaults, manualConfiguration);

    // CRITICAL: Preserve the dynamic structure for edit mode
    // This allows buildDynamicDefaults to load saved values directly
    if (formData.dynamic && typeof formData.dynamic === 'object') {
      configuration.dynamic = formData.dynamic;
    }

    if (placeholderMap.length > 0) {
      placeholderMap.forEach((entry) => {
        if (entry?.scope !== 'config_time' || !entry?.source_path) return;

        const sectionId = entry?.ui?.section_id ?? entry?.ui_group;
        const alias = entry?.alias;
        if (!sectionId || !alias) return;

        const rawDynamicValue = (formData.dynamic as Record<string, Record<string, string | undefined>> | undefined)?.[sectionId]?.[alias];
        let processedDynamic: any = rawDynamicValue;

        // Parse trait_selector JSON strings to arrays (same logic as agentDeployment.ts)
        if (typeof rawDynamicValue === 'string' && rawDynamicValue.trim().length > 0) {
          const trimmed = rawDynamicValue.trim();
          if (entry?.ui?.component === 'trait_selector') {
            try {
              const parsed = JSON.parse(trimmed);
              processedDynamic = Array.isArray(parsed)
                ? parsed.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : trimmed.split(',').map((value) => value.trim()).filter(Boolean);
            } catch (_error) {
              processedDynamic = trimmed.split(',').map((value) => value.trim()).filter(Boolean);
            }
          }
        }

        const currentValue = getNestedValue(configuration, entry.source_path);
        let nextValue = currentValue;

        if (processedDynamic !== undefined && processedDynamic !== null && processedDynamic !== '') {
          nextValue = processedDynamic;
        } else if (currentValue === undefined || currentValue === null || currentValue === '') {
          nextValue = entry?.default_value ?? getNestedValue(templateDefaults, entry.source_path) ?? '';
        }

        setValueAtPath(configuration, entry.source_path, nextValue);
      });
    }

    const retellResponse = await supabase.functions.invoke('update-draft-agent', {
      body: {
        agent_id: agentId,
        configuration: configuration
      }
    });

    if (retellResponse.error) {
      throw new Error(retellResponse.error.message || 'Failed to update agent');
    }
  }

  // Update phone number binding if changed
  if (phoneNumberId !== existingAgent.phone_number_id) {
    // Unbind old phone number
    if (existingAgent.phone_number_id) {
      await supabase
        .from('phone_numbers')
        .update({ agent_id: null })
        .eq('id', existingAgent.phone_number_id);
    }

    // Bind new phone number
    if (existingAgent.retell_agent_id) {
      const bindResponse = await supabase.functions.invoke('bind-phone-number', {
        body: {
          phone_number_id: phoneNumberId,
          agent_id: agentId  // Use the database agent ID, not the Retell agent ID
        }
      });

      if (bindResponse.error) {
        throw new Error('Failed to bind phone number to agent');
      }
    }

    // Update phone number with agent assignment
    await supabase
      .from('phone_numbers')
      .update({ agent_id: agentId })
      .eq('id', phoneNumberId);
  }

  // Build complete customizations object with proper structure
  const customizations = {
    ...formData,
    integrations: {
      enableTransfer: formData.enableTransfer || false,
      transferPhoneNumber: formData.transferPhoneNumber || '',
      enableCalCom: formData.enableCalCom || false,
      calComApiKey: formData.calComApiKey || '',
      calComEventTypeId: formData.calComEventTypeId || '',
      calComTimezone: formData.calComTimezone || 'America/New_York',
      // Also store with old field names for backwards compatibility
      enableCallTransfer: formData.enableTransfer || false,
      enableCalIntegration: formData.enableCalCom || false,
      calApiKey: formData.calComApiKey || '',
      calEventId: formData.calComEventTypeId || '',
      calTimezone: formData.calComTimezone || 'America/New_York'
    }
  };

  // Compute agent name from available sources (formData and existingAgent are always in scope)
  const resolvedAgentName = formData.agentName || existingAgent.name || '';
  customizations.agentName = resolvedAgentName;

  // Update agent in database
  const { error: updateError } = await supabase
    .from('user_agents')
    .update({
      name: resolvedAgentName,
      phone_number_id: phoneNumberId,
      customizations: customizations,
      settings: customizations, // Keep both for backwards compatibility
      updated_at: new Date().toISOString()
    })
    .eq('id', agentId);

  if (updateError) {
    throw new Error('Failed to update agent in database');
  }
}

function generateSystemPrompt(formData: AgentIdentityForm, template: AgentTemplate | null): string {
  const basePrompt = template?.base_prompt || '';
  
  // Replace variables in base prompt
  let prompt = basePrompt
    .replace('{{agent_name}}', formData.agentName || 'the agent')
    .replace('{{company_name}}', formData.companyName || 'our company')
    .replace('{{realtor_name}}', formData.realtorName || 'the realtor')
    .replace('{{realtor_location}}', formData.realtorLocation || 'the area')
    .replace('{{years_experience}}', formData.yearsExperience || 'many')
    .replace('{{homes_sold}}', formData.homesSold || 'numerous')
    .replace('{{areas_serviced}}', formData.areasServiced || 'various neighborhoods');

  // Add personality traits
  if (formData.personalityTraits?.length > 0) {
    prompt += `\n\nPersonality traits: ${formData.personalityTraits.join(', ')}.`;
  }

  // Add value propositions
  const valueProps = [
    formData.valuePoint1,
    formData.valuePoint2,
    formData.valuePoint3,
    formData.valuePoint4
  ].filter(Boolean);

  if (valueProps.length > 0) {
    prompt += '\n\nKey value propositions:\n';
    valueProps.forEach((prop, index) => {
      prompt += `${index + 1}. ${prop}\n`;
    });
  }

  // Add conversation flow elements
  if (formData.introductionLine) {
    prompt += `\n\nIntroduction: ${formData.introductionLine}`;
  }

  if (formData.permissionLine) {
    prompt += `\n\nPermission to continue: ${formData.permissionLine}`;
  }

  // Add business hours
  prompt += `\n\nBusiness hours: ${formData.businessStartDay} to ${formData.businessEndDay}, ${formData.businessStartTime} to ${formData.businessEndTime} ${formData.agentTimezone}.`;

  return prompt;
}
