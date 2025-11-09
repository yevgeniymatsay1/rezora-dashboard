
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Phone, House, ClipboardText, Coins, Buildings, Robot } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { PhoneNumberPurchaseModal } from "@/components/PhoneNumberPurchaseModal";
import { useNavigate } from "react-router-dom";

interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  base_prompt: string;
  default_settings: any;
  is_active: boolean;
}

interface AgentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentTemplates: AgentTemplate[];
  hasPhoneNumber: boolean;
  onPhoneNumberPurchased: () => void;
}

const templateIconMap: Record<string, Icon> = {
  "real-estate-general": House,
  "expired-listing": ClipboardText,
  "fsbo": House,
  "investor": Coins,
  "wholesaler": Buildings,
};

export function AgentSelectionModal({ 
  isOpen, 
  onClose, 
  agentTemplates, 
  hasPhoneNumber,
  onPhoneNumberPurchased 
}: AgentSelectionModalProps) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAgentSelect = (template: AgentTemplate) => {
    console.log('Template selected:', template.id);
    
    // Close modal and navigate to configuration page
    onClose();
    navigate(`/agent/configure/${template.id}`);
  };

  const handlePurchaseSuccess = () => {
    setShowPurchaseModal(false);
    onPhoneNumberPurchased();
    toast({
      title: "Ready to Create Agents",
      description: "You can now select and customize AI agent templates.",
    });
  };

  return (
    <>
      <Dialog open={isOpen && !showPurchaseModal} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">Choose Your AI Agent</DialogTitle>
              <p className="text-muted-foreground mt-1">
                Select from our specialized real estate agent templates
              </p>
            </div>
            <Button 
              onClick={() => setShowPurchaseModal(true)}
              variant="outline"
              className="ml-4"
            >
              <Phone className="h-4 w-4 mr-2" />
              Purchase Phone Number
            </Button>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {agentTemplates.map((template) => {
              const templateType = template.template_type?.trim() ?? "";
              const hasPlaceholderMap =
                Array.isArray(template.default_settings?.placeholderMap) &&
                template.default_settings.placeholderMap.length > 0;
              const canConfigure = template.is_active && hasPlaceholderMap;

              return (
                <Card
                  key={template.id}
                  className={`group transition-shadow ${
                    canConfigure ? "cursor-pointer hover:shadow-md" : "cursor-not-allowed opacity-50"
                  }`}
                  onClick={() => {
                    if (canConfigure) {
                      handleAgentSelect(template);
                    }
                  }}
                  aria-disabled={!canConfigure}
                >
                  <CardHeader className="text-center pb-3">
                    {(() => {
                      const TemplateIcon = templateIconMap[templateType] || Robot;
                      return <TemplateIcon className="h-8 w-8 mx-auto mb-2 text-primary" aria-hidden="true" />;
                    })()}
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">
                      {template.name}
                    </CardTitle>
                    <CardDescription className="text-sm">{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      variant="outline"
                      size="sm"
                      disabled={!canConfigure || !hasPhoneNumber}
                    >
                      {!hasPhoneNumber
                        ? "Phone Number Required"
                        : canConfigure
                        ? "Configure Agent"
                        : "Coming Soon"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <PhoneNumberPurchaseModal 
        isOpen={showPurchaseModal}
        onSuccess={handlePurchaseSuccess}
        onClose={() => setShowPurchaseModal(false)}
      />
    </>
  );
}
