// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { showErrorToast, withRetry, parseApiError } from '@/lib/error-handler';
import { buildWholesalerConversationFlow } from '../utils/wholesaler';

interface DraftAgent {
  id: string;
  user_id: string;
  template_id: string;
  name: string;
  status: string;
  retell_agent_id?: string;
  retell_llm_id?: string;
  customizations?: Record<string, any>;
  settings?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export function useDraftAgent(templateId?: string, agentId?: string) {
  const [draftAgent, setDraftAgent] = useState<DraftAgent | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    console.log('useDraftAgent effect triggered - templateId:', templateId, 'agentId:', agentId);
    if (templateId && !agentId) {
      loadOrCreateDraftAgent();
    }
  }, [templateId, agentId]);

  const loadOrCreateDraftAgent = async () => {
    if (!templateId) return;
    
    try {
      setIsDraftLoading(true);
      
      // ALWAYS call create-draft-agent - the edge function handles checking for existing drafts
      // and validates they have Retell resources (LLM and Agent IDs)
      console.log('Calling create-draft-agent with template_id:', templateId);
      const { data: functionResponse, error: functionError } = await supabase.functions.invoke('create-draft-agent', {
        body: { template_id: templateId }
      });

      if (functionError || functionResponse?.error) {
        throw new Error(functionResponse?.error || functionError?.message || 'Failed to create draft agent');
      }

      const createdDraft = functionResponse?.data;
      const createError = !createdDraft ? new Error('No data returned from create-draft-agent') : null;

      if (createError) throw createError;
      
      setDraftAgent(createdDraft);
      return createdDraft;
    } catch (error) {
      toast({
        title: "Error managing draft",
        description: "Failed to load or create draft agent",
        variant: "destructive"
      });
    } finally {
      setIsDraftLoading(false);
    }
  };

  const updateDraftAgent = async (updates: Partial<DraftAgent>) => {
    if (!draftAgent?.id) return;

    try {
      // Get the formData from updates (passed as customizations/settings)
      const formData = updates.customizations || updates.settings || updates;
      
      // Format configuration properly for edge function
      const configuration = {
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
        conversationFlow: {
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
          reasonForCalling: formData.reasonForCalling || '',
          vacancyTimeframe: formData.vacancyTimeframe || '',
          propertyDetailsToGather: formData.propertyDetailsToGather || '',
          closingMessage: formData.closingMessage || '',
          ...buildWholesalerConversationFlow(formData)
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
        callSettings: {
          reminderTriggerMs: formData.reminderTriggerMs !== undefined ? formData.reminderTriggerMs : 10000,
          reminderMaxCount: formData.reminderMaxCount !== undefined ? formData.reminderMaxCount : 2,
          beginMessageDelayMs: formData.beginMessageDelayMs !== undefined ? formData.beginMessageDelayMs : 1000,
          endCallAfterSilenceMs: formData.endCallAfterSilenceMs !== undefined ? formData.endCallAfterSilenceMs : 600000,
          maxCallDurationMs: formData.maxCallDurationMs !== undefined ? formData.maxCallDurationMs : 3600000,
          voicemailDetection: formData.voicemailDetection !== undefined ? formData.voicemailDetection : false,
          voicemailAction: formData.voicemailAction || 'hangup',
          voicemailMessage: formData.voicemailMessage || ''
        },
        advanced: {
          beginMessage: formData.beginMessage || ''
        },
        postCallAnalysis: formData.postCallAnalysis || [],
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
        }
      };
      
      // Call the edge function to update both database and Retell with retry logic
      console.log('Calling update-draft-agent with formatted configuration');
      
      const { data: functionResponse, error: functionError } = await withRetry(
        async () => {
          const result = await supabase.functions.invoke('update-draft-agent', {
            body: {
              agent_id: draftAgent.id,
              configuration: configuration
            }
          });
          
          if (result.error || result.data?.error) {
            const errorInfo = parseApiError(result.error || result.data);
            throw new Error(errorInfo.userMessage || errorInfo.message);
          }
          
          return result;
        },
        {
          maxRetries: 2,
          retryDelay: 1000,
          onRetry: (attempt, error) => {
            console.log(`Retry attempt ${attempt} for draft update:`, error);
          }
        }
      );

      if (functionError || functionResponse?.error) {
        const errorInfo = parseApiError(functionError || functionResponse);
        throw new Error(errorInfo.userMessage || 'Failed to update draft agent');
      }
      
      // Update local state with the response
      if (functionResponse?.data) {
        setDraftAgent(functionResponse.data);
        return functionResponse.data;
      }
      
      // Fallback: if no data returned, just update local state
      setDraftAgent({ ...draftAgent, ...updates });
      return { ...draftAgent, ...updates };
    } catch (error) {
      console.error('Error updating draft:', error);
      // Use improved error handling
      showErrorToast(error, 'Failed to update agent');
      throw error; // Re-throw to allow parent components to handle if needed
    }
  };

  return {
    draftAgent,
    isDraftLoading,
    updateDraftAgent,
    refreshDraft: loadOrCreateDraftAgent
  };
}
