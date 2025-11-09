
import { Robot as Bot, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AgentSelectionModal } from "@/components/AgentSelectionModal";
import { DeployedAgentCard } from "@/components/DeployedAgentCard";

interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  base_prompt: string;
  default_settings: any;
  is_active: boolean;
}

interface DeployedAgent {
  id: string;
  name: string;
  status: string;
  created_at: string;
  retell_agent_id?: string;
  retell_llm_id?: string;
  agent_templates?: {
    name: string;
    template_type: string;
  };
  phone_numbers?: {
    phone_number: string;
  };
}

export default function Agents() {
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [deployedAgents, setDeployedAgents] = useState<DeployedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPhoneNumber, setHasPhoneNumber] = useState(false);
  const [checkingPhoneNumber, setCheckingPhoneNumber] = useState(true);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkUserPhoneNumber();
    fetchAgentTemplates();
    fetchDeployedAgents();
  }, []);

  const checkUserPhoneNumber = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);

      if (error) throw error;
      setHasPhoneNumber(data && data.length > 0);
    } catch (error) {
      console.error('Error checking phone numbers:', error);
    } finally {
      setCheckingPhoneNumber(false);
    }
  };

  const fetchAgentTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_templates')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setAgentTemplates(data || []);
    } catch (error) {
      console.error('Error fetching agent templates:', error);
      toast({
        title: "Error",
        description: "Failed to load agent templates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDeployedAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('user_agents')
        .select(`
          id,
          name,
          status,
          created_at,
          retell_agent_id,
          retell_llm_id,
          agent_templates (
            name,
            template_type
          ),
          phone_numbers (
            phone_number
          )
        `)
        .eq('status', 'deployed')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeployedAgents(data || []);
    } catch (error) {
      console.error('Error fetching deployed agents:', error);
      toast({
        title: "Error",
        description: "Failed to load deployed agents. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePhoneNumberPurchased = () => {
    setHasPhoneNumber(true);
  };

  const handleAgentDeleted = () => {
    fetchDeployedAgents();
  };

  if (loading || checkingPhoneNumber) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Agents</h1>
            <p className="text-muted-foreground mt-1">
              {checkingPhoneNumber ? "Checking account setup..." : "Loading..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Agents</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage your AI calling agents
            </p>
          </div>
          {deployedAgents.length > 0 && (
            <Button 
              onClick={() => setShowAgentModal(true)}
              className="primary-button"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Agent
            </Button>
          )}
        </div>

        {deployedAgents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deployedAgents.map((agent) => (
              <DeployedAgentCard
                key={agent.id}
                agent={agent}
                onAgentDeleted={handleAgentDeleted}
              />
            ))}
          </div>
        ) : (
          /* Null State */
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <Bot className="h-20 w-20 text-muted-foreground mb-6" />
            <h2 className="text-2xl font-semibold mb-2">No AI Agents Yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Get started by browsing our collection of specialized real estate AI agents. 
              Choose from templates designed for different types of real estate outreach.
            </p>
            <Button 
              size="lg"
              onClick={() => setShowAgentModal(true)}
              className="primary-button"
            >
              <Bot className="h-5 w-5 mr-2" />
              Browse AI Agents
            </Button>
          </div>
        )}
      </div>

      <AgentSelectionModal 
        isOpen={showAgentModal}
        onClose={() => setShowAgentModal(false)}
        agentTemplates={agentTemplates || []}
        hasPhoneNumber={!!hasPhoneNumber}
        onPhoneNumberPurchased={handlePhoneNumberPurchased}
      />
    </>
  );
}
