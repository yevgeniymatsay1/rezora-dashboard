import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, PhoneSlash, Microphone, MicrophoneSlash, CircleNotch } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";
import { RetellWebClient } from "retell-client-js-sdk";

interface VoiceChatProps {
  accessToken: string;
  onCallEnd: () => void;
}

type CallStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function VoiceChat({ accessToken, onCallEnd }: VoiceChatProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const retellClient = useRef<RetellWebClient | null>(null);
  const hasShownConnectedToast = useRef(false);
  const callStatusRef = useRef<CallStatus>('connecting');
  const isMountedRef = useRef(true);
  const { toast } = useToast();

  useEffect(() => {
    isMountedRef.current = true;
    let isInitialized = false;

    const initializeCall = async () => {
      if (isInitialized || !isMountedRef.current) return;
      isInitialized = true;

      try {
        console.log('Initializing Retell Web Client with access token:', accessToken);

        // Reset the toast flag for new calls
        hasShownConnectedToast.current = false;
        callStatusRef.current = 'connecting';

        retellClient.current = new RetellWebClient();
        
        // Set up event listeners with correct event names
        retellClient.current.on('call_started', () => {
          console.log('Call started');
          if (isMountedRef.current) {
            setCallStatus('connected');
            callStatusRef.current = 'connected';

            if (!hasShownConnectedToast.current) {
              hasShownConnectedToast.current = true;
              toast({
                title: "Call Connected",
                description: "You can now speak with your AI agent",
              });
            }
          }
        });

        retellClient.current.on('call_ended', ({ code, reason } = {}) => {
          console.log('Call ended:', code, reason);
          if (isMountedRef.current) {
            setCallStatus('disconnected');
            callStatusRef.current = 'disconnected';
            handleCallEnd();
          }
        });

        retellClient.current.on('error', (error) => {
          console.error('Retell client error:', error);
          if (isMountedRef.current) {
            setCallStatus('error');
            callStatusRef.current = 'error';
            toast({
              title: "Call Error",
              description: "There was an error with the voice call",
              variant: "destructive",
            });
          }
        });

        retellClient.current.on('update', (update) => {
          console.log('Call update:', update);

          // Fallback: If we receive transcript updates and still showing connecting,
          // assume we're connected
          if (callStatusRef.current === 'connecting' && (update.transcript || update.audio) && !hasShownConnectedToast.current) {
            console.log('Setting status to connected based on transcript/audio update');
            if (isMountedRef.current) {
              setCallStatus('connected');
              callStatusRef.current = 'connected';
              hasShownConnectedToast.current = true;
              toast({
                title: "Call Connected",
                description: "You can now speak with your AI agent",
              });
            }
          }
        });

        // Start the call
        await retellClient.current.startCall({
          accessToken: accessToken,
          sampleRate: 24000,
        });

      } catch (error) {
        console.error('Error initializing voice call:', error);
        if (isMountedRef.current) {
          setCallStatus('error');
          callStatusRef.current = 'error';
          toast({
            title: "Connection Failed",
            description: error instanceof Error ? error.message : "Failed to connect to voice call",
            variant: "destructive",
          });
        }
      }
    };

    initializeCall();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (retellClient.current) {
        try {
          retellClient.current.stopCall();
        } catch (error) {
          console.error('Cleanup error:', error);
        }
      }
    };
  }, [accessToken]); // Removed toast from dependencies to prevent re-initialization

  const handleCallEnd = () => {
    if (retellClient.current) {
      retellClient.current.stopCall();
    }
    onCallEnd();
  };

  const toggleMute = async () => {
    if (retellClient.current) {
      try {
        if (isMuted) {
          await retellClient.current.unmute();
        } else {
          await retellClient.current.mute();
        }
        setIsMuted(!isMuted);
      } catch (error) {
        console.error('Error toggling mute:', error);
        toast({
          title: "Mute Error",
          description: "Failed to toggle microphone",
          variant: "destructive",
        });
      }
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case 'connecting':
        return 'text-yellow-500';
      case 'connected':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Connected - Speak now';
      case 'disconnected':
        return 'Call ended';
      case 'error':
        return 'Connection failed';
      default:
        return 'Unknown status';
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6">
        <div className="text-center space-y-4">
          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              callStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              callStatus === 'connected' ? 'bg-green-500' :
              callStatus === 'error' ? 'bg-red-500' :
              'bg-gray-500'
            }`} />
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>

          {/* Call controls */}
          <div className="flex justify-center gap-3">
            {callStatus === 'connected' && (
              <Button
                variant={isMuted ? "destructive" : "outline"}
                size="lg"
                onClick={toggleMute}
                className="w-12 h-12 rounded-full p-0"
              >
                {isMuted ? <MicrophoneSlash className="h-5 w-5" /> : <Microphone className="h-5 w-5" />}
              </Button>
            )}
            
            <Button
              variant="destructive"
              size="lg"
              onClick={handleCallEnd}
              disabled={callStatus === 'disconnected'}
              className="w-12 h-12 rounded-full p-0"
            >
              {callStatus === 'connecting' ? (
                <CircleNotch className="h-5 w-5 animate-spin" />
              ) : (
                <PhoneSlash className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Instructions */}
          {callStatus === 'connected' && (
            <p className="text-sm text-muted-foreground">
              Speak naturally with your AI agent. The conversation will flow automatically.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
