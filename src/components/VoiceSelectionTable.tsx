
import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SpeakerHigh } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Voice {
  voice_id: string;
  voice_name: string;
  provider: string;
  accent: string;
  gender: string;
  age: string;
  preview_audio_url?: string;
}

interface VoiceSelectionTableProps {
  voices: Voice[];
  selectedVoiceId: string;
  onVoiceSelect: (voiceId: string) => void;
  userPlan: 'basic' | 'professional' | 'summit';
}

export function VoiceSelectionTable({ voices, selectedVoiceId, onVoiceSelect, userPlan }: VoiceSelectionTableProps) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayPause = (voice: Voice) => {
    if (playingVoiceId === voice.voice_id) {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceId(null);
    } else {
      // Start new audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      if (voice.preview_audio_url) {
        const audio = new Audio(voice.preview_audio_url);
        audioRef.current = audio;
        
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => setPlayingVoiceId(null);
        
        audio.play().catch(console.error);
        setPlayingVoiceId(voice.voice_id);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const canAddCustomVoice = userPlan === 'professional' || userPlan === 'summit';

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-border">
          <div className="grid grid-cols-[40px_1fr_120px_100px_100px_80px_60px] gap-4 p-4 text-sm font-medium text-muted-foreground">
            <div></div>
            <div>Voice</div>
            <div>Gender</div>
            <div>Accent</div>
            <div>Age</div>
            <div>Provider</div>
            <div>Preview</div>
          </div>
        </div>

        <div className="divide-y divide-border">
          {voices.map((voice) => (
            <div
              key={voice.voice_id}
              className={`grid grid-cols-[40px_1fr_120px_100px_100px_80px_60px] gap-4 p-4 items-center hover:bg-muted/50 cursor-pointer transition-colors ${
                selectedVoiceId === voice.voice_id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
              }`}
              onClick={() => onVoiceSelect(voice.voice_id)}
            >
              <div className="flex items-center justify-center">
                <div className={`w-3 h-3 rounded-full border-2 ${
                  selectedVoiceId === voice.voice_id 
                    ? 'border-primary bg-primary' 
                    : 'border-muted-foreground'
                }`}>
                  {selectedVoiceId === voice.voice_id && (
                    <div className="w-1 h-1 rounded-full bg-primary-foreground m-auto mt-0.5"></div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                  {voice.voice_name.charAt(0)}
                </div>
                <div>
                  <div className="font-medium">{voice.voice_name}</div>
                  <div className="text-sm text-muted-foreground">{voice.voice_id}</div>
                </div>
              </div>

              <div>
                <Badge variant="secondary" className="text-xs">
                  {voice.gender}
                </Badge>
              </div>

              <div className="text-sm text-muted-foreground">
                {voice.accent}
              </div>

              <div className="text-sm text-muted-foreground">
                {voice.age}
              </div>

              <div className="text-xs text-muted-foreground">
                {voice.provider}
              </div>

              <div onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handlePlayPause(voice)}
                  disabled={!voice.preview_audio_url}
                >
                  {playingVoiceId === voice.voice_id ? (
                    <Pause className="h-4 w-4" />
                  ) : voice.preview_audio_url ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <SpeakerHigh className="h-4 w-4 opacity-30" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {canAddCustomVoice && (
        <div className="text-center p-4 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">
            Want to use your own custom voice?
          </p>
          <Button variant="outline" size="sm">
            + Add Custom Voice
          </Button>
        </div>
      )}

      {!canAddCustomVoice && (
        <div className="text-center p-4 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">
            Want to use your own custom voice?
          </p>
          <Button variant="outline" size="sm">
            Upgrade to Professional
          </Button>
        </div>
      )}
    </div>
  );
}
