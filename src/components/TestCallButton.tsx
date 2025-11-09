import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, CircleNotch } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VoiceChat } from "./VoiceChat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TestCallButtonProps {
  draftAgent: any;
  onSaveConfig: () => Promise<boolean>;
  disabled?: boolean;
}

export function TestCallButton({ draftAgent, onSaveConfig, disabled }: TestCallButtonProps) {
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const { toast } = useToast();

  const handleTestCall = async () => {
    console.log('TestCallButton - draftAgent:', draftAgent);
    console.log('TestCallButton - draftAgent.id:', draftAgent?.id);
    console.log('TestCallButton - typeof draftAgent.id:', typeof draftAgent?.id);
    
    if (!draftAgent?.id) {
      toast({
        title: "Agent Not Ready",
        description: "Please configure your agent first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // First save the current configuration
      const saveSuccess = await onSaveConfig();

      if (!saveSuccess) {
        throw new Error('Failed to save agent configuration');
      }

      // Add small delay to ensure Retell has processed the updates
      console.log('Waiting for Retell to process updates...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Create web call using the database agent ID
      console.log('Creating web call after configuration update...');
      console.log('Sending agent_id to edge function:', draftAgent.id);
      const { data, error } = await supabase.functions.invoke('create-web-call', {
        body: { agent_id: draftAgent.id }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to create web call');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to create web call');
      }

      const webCallData = data.data;

      // Extract access token from the response
      if (!webCallData.access_token) {
        throw new Error('No access token received');
      }

      setAccessToken(webCallData.access_token);
      setIsCallActive(true);

      toast({
        title: "Test Call Started",
        description: "Connecting to your AI agent...",
      });

    } catch (error) {
      console.error('Test call error:', error);
      toast({
        title: "Test Call Failed",
        description: error instanceof Error ? error.message : "Failed to start test call",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCallEnd = () => {
    setIsCallActive(false);
    setAccessToken(null);
    toast({
      title: "Test Call Ended",
      description: "Voice test completed",
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        onClick={handleTestCall}
        disabled={disabled || loading || !draftAgent?.id}
      >
        {loading ? (
          <>
            <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
            Starting Test Call...
          </>
        ) : (
          <>
            <Phone className="mr-2 h-4 w-4" />
            Test Voice Call
          </>
        )}
      </Button>

      <Dialog open={isCallActive} onOpenChange={(open) => {
        if (!open) handleCallEnd();
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Voice Test Active
            </DialogTitle>
            <DialogDescription>
              You're now connected to your AI agent. Speak naturally to test the conversation.
            </DialogDescription>
          </DialogHeader>
          
          {accessToken && (
            <VoiceChat 
              accessToken={accessToken}
              onCallEnd={handleCallEnd}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}