
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CircleNotch } from '@phosphor-icons/react';
import { VoiceSelectionTable } from './VoiceSelectionTable';

interface Voice {
  voice_id: string;
  voice_name: string;
  provider: string;
  accent: string;
  gender: string;
  age: string;
  preview_audio_url?: string;
}

interface VoiceSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voices: Voice[];
  selectedVoiceId: string;
  onVoiceSelect: (voiceId: string) => void;
  userPlan: 'basic' | 'professional' | 'summit';
  loading?: boolean;
}

export function VoiceSelectionModal({
  open,
  onOpenChange,
  voices,
  selectedVoiceId,
  onVoiceSelect,
  userPlan,
  loading = false
}: VoiceSelectionModalProps) {
  const [tempSelectedVoice, setTempSelectedVoice] = useState(selectedVoiceId);

  const handleVoiceSelect = (voiceId: string) => {
    setTempSelectedVoice(voiceId);
  };

  const handleConfirm = () => {
    onVoiceSelect(tempSelectedVoice);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTempSelectedVoice(selectedVoiceId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Voice</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <CircleNotch className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading voices...</span>
            </div>
          ) : (
            <VoiceSelectionTable
              voices={voices}
              selectedVoiceId={tempSelectedVoice}
              onVoiceSelect={handleVoiceSelect}
              userPlan={userPlan}
            />
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Select Voice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
