import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PencilSimple, Trash, Phone, Robot } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

interface DeployedAgentCardProps {
  agent: DeployedAgent;
  onAgentDeleted: () => void;
}

export function DeployedAgentCard({ agent, onAgentDeleted }: DeployedAgentCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const formatPhoneNumber = (phoneNumber: string) => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const number = cleaned.slice(1);
      return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
    }
    return phoneNumber;
  };

  const handleEdit = () => {
    navigate(`/agent/configure/edit/${agent.id}`);
  };

  const handleDelete = async () => {
    if (!agent.retell_agent_id || !agent.retell_llm_id) {
      toast({
        title: "Error",
        description: "Cannot delete agent: Missing Retell IDs",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-agent', {
        body: {
          agentId: agent.id,
          retellAgentId: agent.retell_agent_id,
          retellLlmId: agent.retell_llm_id,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent deleted successfully",
      });
      
      onAgentDeleted();
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast({
        title: "Error",
        description: "Failed to delete agent. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'deployed':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'archived':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Robot className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <CardDescription className="text-sm">
                {agent.agent_templates?.name || 'Custom Agent'}
              </CardDescription>
            </div>
          </div>
          <Badge variant={getStatusVariant(agent.status)} className="capitalize">
            {agent.status}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {agent.phone_numbers?.phone_number && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>{formatPhoneNumber(agent.phone_numbers.phone_number)}</span>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground">
          Created {new Date(agent.created_at).toLocaleDateString()}
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEdit}
            className="flex-1"
          >
            <PencilSimple className="h-4 w-4 mr-1" />
            Edit
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{agent.name}"? This action cannot be undone.
                  The agent will be removed from Retell AI and this application.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete Agent"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}