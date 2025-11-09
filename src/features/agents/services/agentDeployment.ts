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

const getNestedDefault = (obj: any, path: string) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc: any, key: string) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
};

export async function deployAgent(
  formData: AgentIdentityForm,
  template: AgentTemplate | null,
  phoneNumberId: string,
  draftAgentId?: string
): Promise<string> {
  if (!draftAgentId) {
    throw new Error('Draft agent ID is required for deployment');
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('User not authenticated');

  const placeholderMap = Array.isArray(template?.default_settings?.placeholderMap)
    ? (template?.default_settings?.placeholderMap as Array<any>)
    : [];

  const templateDefaults = template?.default_settings?.defaults
    ? cloneDeep(template.default_settings.defaults)
    : {};

  // Format configuration properly for update-draft-agent
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
      // Expired listing (default)
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
    voiceStyle: {
      styleSample: formData.voiceStyleSample || ''
    },
    voice: {
      selectedVoice: formData.voiceId || '11labs-Adrian',
      voiceModel: formData.voiceModel || 'eleven_turbo_v2',
      speed: formData.voiceSpeed || 0.92,
      temperature: formData.voiceTemperature || 1,
      volume: formData.volume || 1
    },
    speech: {
      ambientSound: formData.ambientSound,
      ambientVolume: formData.ambientVolume,
      normalizeForSpeech: formData.normalizeForSpeech,
      responsiveness: formData.responsiveness,
      interruptionSensitivity: formData.interruptionSensitivity,
      enableBackchannel: formData.enableBackchannel
    },
    callSettings: {
      reminderTriggerMs: formData.reminderTriggerMs,
      reminderMaxCount: formData.reminderMaxCount,
      endCallAfterSilenceMs: formData.endCallAfterSilenceMs,
      maxCallDurationMs: formData.maxCallDurationMs,
      beginMessageDelayMs: formData.beginMessageDelayMs,
      voicemailDetection: formData.voicemailDetection,
      voicemailAction: formData.voicemailAction,
      voicemailMessage: formData.voicemailMessage
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
    advanced: {
      beginMessage: formData.beginMessage
    },
    postCallAnalysis: formData.postCallAnalysis
  };

  let configuration = deepMerge(templateDefaults, manualConfiguration);

  // CRITICAL: Preserve the dynamic structure for edit mode
  // This allows buildDynamicDefaults to load saved values directly
  if (formData.dynamic && typeof formData.dynamic === 'object') {
    configuration.dynamic = formData.dynamic;
  }

  if (placeholderMap.length > 0) {
    placeholderMap.forEach((entry) => {
      if (entry?.scope !== 'config_time' || !entry?.source_path) {
        return;
      }

      const sectionId = entry?.ui?.section_id ?? entry?.ui_group;
      const alias = entry?.alias;
      if (!sectionId || !alias) return;

      const rawDynamicValue = (formData.dynamic as Record<string, Record<string, string | undefined>> | undefined)?.[sectionId]?.[alias];
      let processedDynamic: any = rawDynamicValue;

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

      const currentValue = getNestedDefault(configuration, entry.source_path);

      let valueToUse = currentValue;

      if (processedDynamic !== undefined && processedDynamic !== null && processedDynamic !== '') {
        valueToUse = processedDynamic;
      } else if (currentValue === undefined || currentValue === null || currentValue === '') {
        valueToUse = entry?.default_value ?? getNestedDefault(templateDefaults, entry.source_path) ?? '';
      }

      setValueAtPath(configuration, entry.source_path, valueToUse);
    });
  }

  // First update the draft agent with latest configuration
  const updateResponse = await supabase.functions.invoke('update-draft-agent', {
    body: {
      agent_id: draftAgentId,
      configuration: configuration
    }
  });

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message || 'Failed to update agent configuration');
  }

  // Deploy the agent (this will bind the phone number too)
  const deployResponse = await supabase.functions.invoke('deploy-agent', {
    body: {
      agent_id: draftAgentId,
      phone_number_id: phoneNumberId
    }
  });

  if (deployResponse.error) {
    throw new Error(deployResponse.error.message || 'Failed to deploy agent');
  }

  // The deploy-agent edge function has already updated the database
  // Just return the draft agent ID which is now deployed
  return draftAgentId;
}
