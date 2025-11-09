import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AgentTemplate } from '../types/agent.types';

export function useAgentTemplate(templateId?: string) {
  const [template, setTemplate] = useState<AgentTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!templateId) {
      setLoading(false);
      return;
    }

    const loadTemplate = async () => {
      try {
        const { data, error } = await supabase
          .from('agent_templates')
          .select('*')
          .eq('id', templateId)
          .eq('is_active', true)
          .single();

        if (error) throw error;
        setTemplate(data);
      } catch (error) {
        toast({
          title: "Template Not Found",
          description: "The selected agent template could not be loaded.",
          variant: "destructive",
        });
        navigate('/agents');
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]); // Only depend on templateId to avoid refetch loops

  return { template, loading };
}