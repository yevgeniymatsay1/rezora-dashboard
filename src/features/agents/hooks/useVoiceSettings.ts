import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useVoiceSettings() {
  const [voices, setVoices] = useState<any[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceModalLoading, setVoiceModalLoading] = useState(false);
  const [voiceSettingsModalOpen, setVoiceSettingsModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      setVoicesLoading(true);
      const { data, error } = await supabase.functions.invoke('get-retell-voices');

      if (error) throw error;
      
      if (data?.voices) {
        setVoices(data.voices);
      }
    } catch (error) {
      toast({
        title: "Failed to load voices",
        description: "Unable to fetch available voices. Using defaults.",
        variant: "destructive"
      });
      // Set default voices as fallback
      setVoices([
        { voice_id: "11labs-Adrian", voice_name: "Adrian" },
        { voice_id: "11labs-Aria", voice_name: "Aria" },
        { voice_id: "11labs-Bill", voice_name: "Bill" },
        { voice_id: "11labs-Brian", voice_name: "Brian" },
        { voice_id: "11labs-Bruce", voice_name: "Bruce" }
      ]);
    } finally {
      setVoicesLoading(false);
    }
  };

  return {
    voices,
    voicesLoading,
    voiceModalOpen,
    setVoiceModalOpen,
    voiceModalLoading,
    setVoiceModalLoading,
    voiceSettingsModalOpen,
    setVoiceSettingsModalOpen,
    refreshVoices: loadVoices
  };
}