// @ts-nocheck
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LabelWithRequired, RequiredFieldsNote } from "@/components/form/RequiredFieldIndicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ArrowLeft, CircleNotch, CaretDown, Users } from "@phosphor-icons/react";
import { STANDARD_VARIABLES, findVariableMatch, getVariablesByCategory } from "@/lib/constants/contact-variables";
import { formatCredits } from "@/lib/credits";
import { useActiveAgents } from "@/hooks/queries/useAgentQueries";
import { contactsService } from "@/services/contacts.service";
import { campaignsService } from "@/services/campaigns.service";
import { billingService } from "@/services/billing.service";

interface CampaignCreationWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  userTimezone?: string;
}

interface Agent {
  id: string;
  name: string;
  phone_numbers?: {
    phone_number: string;
  };
}

interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  total_contacts?: number;
  csv_headers?: string[];
  status?: string;
}

interface StandardVariableMapping {
  variableKey: string;
  isSelected: boolean;
  csvHeader: string | null; // null means "Not available"
  autoMapped: boolean;
}

interface CampaignFormData {
  name: string;
  description: string;
  agent_id: string;
  contact_group_id: string;
  concurrent_calls: number;
  max_retry_days: number;
  calling_hours: {
    start: string;
    end: string;
  };
  active_days: string[];
  selectedVariables: StandardVariableMapping[];
}

const DAYS_OF_WEEK = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

const FIELD_NAME_SUGGESTIONS: Record<string, string> = {
  'first_name': 'firstName',
  'last_name': 'lastName',
  'phone': 'phoneNumber',
  'phone_number': 'phoneNumber',
  'address': 'propertyAddress',
  'email': 'emailAddress',
  'company': 'companyName',
  'city': 'city',
  'state': 'state',
  'zip': 'zipCode',
  'property_type': 'propertyType',
  'listing_price': 'listingPrice',
  'days_on_market': 'daysOnMarket',
};

export function CampaignCreationWizard({ onClose, onSuccess, userTimezone = 'America/New_York' }: CampaignCreationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedContactGroup, setSelectedContactGroup] = useState<ContactGroup | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  
  // Use React Query hook for agents
  const { data: agents = [], isLoading: agentsLoading } = useActiveAgents();

  const [formData, setFormData] = useState<CampaignFormData>({
    name: '',
    description: '',
    agent_id: '',
    contact_group_id: '',
    concurrent_calls: 5,
    max_retry_days: 3,
    calling_hours: {
      start: '09:00',
      end: '17:00',
    },
    active_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    selectedVariables: []
  });

  useEffect(() => {
    fetchContactGroups();
  }, []);

  useEffect(() => {
    if (formData.contact_group_id) {
      fetchContactGroupDetails(formData.contact_group_id);
    }
  }, [formData.contact_group_id]);

  const fetchContactGroups = async () => {
    try {
      const groups = await contactsService.getActiveGroups();
      setContactGroups(groups || []);
    } catch (error) {
      console.error('Error fetching contact groups:', error);
      toast({
        title: "Failed to Load Contact Groups",
        description: "Could not load your contact groups. Please try again.",
        variant: "destructive",
      });
    }
  };

  const fetchContactGroupDetails = async (groupId: string) => {
    try {
      // Get contact group details with CSV headers
      const contactGroup = await contactsService.getGroupById(groupId);

      if (contactGroup) {
        setSelectedContactGroup(contactGroup);
        setCsvHeaders(contactGroup.csv_headers || []);
        
        // Initialize standard variable mappings with auto-mapping
        const variableMappings: StandardVariableMapping[] = STANDARD_VARIABLES.map(variable => {
          const matchedHeader = findVariableMatch(contactGroup.csv_headers?.find((header: string) => 
            findVariableMatch(header) === variable.key
          ) || '');
          
          const csvHeader = contactGroup.csv_headers?.find((header: string) => 
            findVariableMatch(header) === variable.key
          ) || null;

          return {
            variableKey: variable.key,
            isSelected: matchedHeader === variable.key || variable.required,
            csvHeader: csvHeader,
            autoMapped: matchedHeader === variable.key
          };
        });

        setFormData(prev => ({
          ...prev,
          selectedVariables: variableMappings
        }));

        // Initialize open categories with Contact Information open
        const categories = getVariablesByCategory();
        const initialOpenState: Record<string, boolean> = {};
        Object.keys(categories).forEach(category => {
          initialOpenState[category] = category === 'Contact Information';
        });
        setOpenCategories(initialOpenState);
      }
    } catch (error) {
      console.error('Error fetching contact group details:', error);
    }
  };

  const updateVariableMapping = (variableKey: string, updates: Partial<StandardVariableMapping>) => {
    setFormData(prev => ({
      ...prev,
      selectedVariables: prev.selectedVariables.map(mapping =>
        mapping.variableKey === variableKey ? { ...mapping, ...updates } : mapping
      )
    }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!formData.name || !formData.agent_id || !formData.contact_group_id) {
          toast({
            title: "Missing Information",
            description: "Please fill in all required fields.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 2:
        if (formData.active_days.length === 0) {
          toast({
            title: "No Active Days",
            description: "Please select at least one day for calling.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 3:
        const phoneNumberMapping = formData.selectedVariables.find(v => v.variableKey === 'phone_number');
        if (!phoneNumberMapping?.isSelected || !phoneNumberMapping?.csvHeader) {
          toast({
            title: "Phone Number Required",
            description: "Phone number must be mapped and selected for AI calling.",
            variant: "destructive",
          });
          return false;
        }
        
        const hasSelectedFields = formData.selectedVariables.some(v => v.isSelected && v.csvHeader);
        if (!hasSelectedFields) {
          toast({
            title: "No Fields Selected",
            description: "Please select at least one field to share with the AI.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleLaunch = async () => {
    setLoading(true);
    try {
      // Check credits before launching campaign
      const creditCheck = await billingService.checkAndReserveCredits(100);

      if (!creditCheck.canProceed) {
        toast({
          title: "Insufficient Credits",
          description: `You have ${formatCredits(creditCheck.currentBalance)} credits. Add credits before launching campaigns.`,
          variant: "destructive",
        });
        return;
      }

      // Check if agent is already linked to another active campaign
      const { data: existingCampaigns, error: campaignCheckError } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('agent_id', formData.agent_id)
        .in('status', ['scheduled', 'active']);

      if (campaignCheckError) {
        console.error('Error checking existing campaigns:', campaignCheckError);
        toast({
          title: "Validation Error",
          description: "Failed to validate agent availability.",
          variant: "destructive",
        });
        return;
      }

      if (existingCampaigns && existingCampaigns.length > 0) {
        toast({
          title: "Agent Already in Use",
          description: `This agent is already linked to campaign "${existingCampaigns[0].name}". Each agent can only be used in one active campaign at a time.`,
          variant: "destructive",
        });
        return;
      }

      // Prepare field mappings and selected fields
      const selectedFields = formData.selectedVariables
        .filter(v => v.isSelected && v.csvHeader)
        .map(v => v.variableKey);
      
      const fieldMappings = formData.selectedVariables
        .filter(v => v.isSelected && v.csvHeader)
        .reduce((acc, v) => ({ ...acc, [v.variableKey]: v.csvHeader }), {});

      // Build dynamic prompt with selected fields and update Retell LLM
      try {
        const { data: promptData, error: promptError } = await supabase.functions.invoke('build-prompt', {
          body: {
            agentId: formData.agent_id,
            selectedFields,
            fieldMappings
          }
        });

        if (promptError) {
          console.error('Failed to build dynamic prompt:', promptError);
          toast({
            title: "Prompt Update Failed",
            description: "Failed to update AI agent prompt. Campaign may not work correctly.",
            variant: "destructive",
          });
          // Don't continue with campaign creation if prompt building fails
          return;
        } else {
          console.log('Dynamic prompt built successfully:', promptData?.cached ? 'from cache' : 'freshly built');
          
          // Check if LLM was updated successfully
          if (!promptData?.llm_updated) {
            console.warn('LLM update failed:', promptData?.llm_error);
            toast({
              title: "AI Agent Update Warning",
              description: promptData?.llm_error || "Failed to update AI agent. Campaign may not work correctly.",
              variant: "destructive",
            });
            // Don't continue if LLM update failed
            return;
          }
          
          toast({
            title: "AI Agent Updated",
            description: "Agent prompt updated successfully with campaign data.",
          });
        }
      } catch (promptBuildError) {
        console.error('Error building dynamic prompt:', promptBuildError);
        toast({
          title: "Update Failed",
          description: "Failed to update AI agent. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Create campaign
      const campaignData = await campaignsService.create({
        name: formData.name,
        description: formData.description,
        agent_id: formData.agent_id,
        contact_group_id: formData.contact_group_id,
        concurrent_calls: formData.concurrent_calls,
        max_retry_days: formData.max_retry_days,
        calling_hours: formData.calling_hours,
        active_days: formData.active_days,
        timezone: userTimezone,
        status: 'active',
        started_at: new Date().toISOString()
      });

      const { error: contactsError } = await supabase
        .from('campaign_contacts')
        .insert({
          campaign_id: campaignData.id,
          contact_group_id: formData.contact_group_id,
          selected_fields: selectedFields,
          field_mappings: fieldMappings
        });

      if (contactsError) throw contactsError;

      toast({
        title: "Campaign Launched!",
        description: "Your campaign has been started successfully.",
      });
      onSuccess();
    } catch (error) {
      console.error('Error launching campaign:', error);
      toast({
        title: "Launch Failed",
        description: "Failed to launch campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <LabelWithRequired htmlFor="campaign-name" required>Campaign Name</LabelWithRequired>
              <Input
                id="campaign-name"
                placeholder="e.g., Q4 Expired Listings Outreach"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the goal of this campaign..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <LabelWithRequired htmlFor="agent" required>Select AI Agent</LabelWithRequired>
              <Select
                value={formData.agent_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, agent_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} ({agent.phone_numbers?.phone_number || 'No phone'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-lg font-medium flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Select Contacts
                </Label>
                <Select
                  value={formData.contact_group_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, contact_group_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a contact group" />
                  </SelectTrigger>
                  <SelectContent>
                    {contactGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedContactGroup && (
                <Card className="border-l-4 border-l-primary">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{selectedContactGroup.name}</h4>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {selectedContactGroup.total_contacts} contacts available
                        </Badge>
                      </div>
                      {selectedContactGroup.description && (
                        <p className="text-sm text-muted-foreground">{selectedContactGroup.description}</p>
                      )}
                      {csvHeaders.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {csvHeaders.slice(0, 5).map((header: string) => (
                            <Badge key={header} variant="outline" className="text-xs">
                              {header}
                            </Badge>
                          ))}
                          {csvHeaders.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{csvHeaders.length - 5} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Concurrent Calls</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[formData.concurrent_calls]}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, concurrent_calls: value[0] }))}
                  min={1}
                  max={20}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-center font-medium">{formData.concurrent_calls}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Number of calls that can be made simultaneously
              </p>
            </div>

            <div className="space-y-2">
              <Label>Max Retry Days</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[formData.max_retry_days]}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, max_retry_days: value[0] }))}
                  min={0}
                  max={7}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-center font-medium">{formData.max_retry_days}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Number of additional days to retry unanswered calls. Each retry will be at a different time within your calling hours.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={formData.calling_hours.start}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    calling_hours: { ...prev.calling_hours, start: e.target.value }
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={formData.calling_hours.end}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    calling_hours: { ...prev.calling_hours, end: e.target.value }
                  }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Active Days</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DAYS_OF_WEEK.map(day => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={day.value}
                      checked={formData.active_days.includes(day.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData(prev => ({
                            ...prev,
                            active_days: [...prev.active_days, day.value]
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            active_days: prev.active_days.filter(d => d !== day.value)
                          }));
                        }
                      }}
                    />
                    <Label htmlFor={day.value} className="cursor-pointer">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        const categories = getVariablesByCategory();
        
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Contact Information for AI</h3>
              <p className="text-sm text-muted-foreground">
                Choose which information your AI agent will know about each contact
              </p>
            </div>

            <div className="space-y-4">
              {Object.entries(categories).map(([categoryName, variables]) => (
                <Collapsible
                  key={categoryName}
                  open={openCategories[categoryName]}
                  onOpenChange={(isOpen) => 
                    setOpenCategories(prev => ({ ...prev, [categoryName]: isOpen }))
                  }
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between p-4 h-auto border rounded-lg hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-expanded={openCategories[categoryName] || false}
                      aria-controls={`category-content-${categoryName.replace(/\s+/g, '-')}`}
                    >
                      <span className="font-medium">{categoryName}</span>
                      <CaretDown className={`h-4 w-4 transition-transform ${
                        openCategories[categoryName] ? 'rotate-180' : ''
                      }`} />
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent id={`category-content-${categoryName.replace(/\s+/g, '-')}`}>
                    <div className="space-y-3 mt-3 ml-4">
                      {variables.map(variable => {
                        const mapping = formData.selectedVariables.find(v => v.variableKey === variable.key);
                        if (!mapping) return null;

                        return (
                          <div key={variable.key} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id={`checkbox-${variable.key}`}
                                checked={mapping.isSelected}
                                onCheckedChange={(checked) => 
                                  updateVariableMapping(variable.key, { isSelected: !!checked })
                                }
                                aria-label={`Include ${variable.label} in campaign`}
                                aria-describedby={variable.description ? `desc-${variable.key}` : undefined}
                              />
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`checkbox-${variable.key}`} className="font-medium">{variable.label}</Label>
                                  {variable.required && (
                                    <Badge variant="destructive" className="text-xs">Required</Badge>
                                  )}
                                  {mapping.autoMapped && (
                                    <Badge variant="secondary" className="text-xs">Auto-mapped</Badge>
                                  )}
                                </div>
                                {mapping.csvHeader ? (
                                  <p className="text-sm text-muted-foreground">from: {mapping.csvHeader}</p>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={mapping.csvHeader || "not_available"}
                                      onValueChange={(value) => 
                                        updateVariableMapping(variable.key, { 
                                          csvHeader: value === "not_available" ? null : value 
                                        })
                                      }
                                    >
                                      <SelectTrigger className="w-48 h-8">
                                        <SelectValue placeholder="Not available" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="not_available">Not available</SelectItem>
                                        {csvHeaders.map((header: string) => (
                                          <SelectItem key={header} value={header}>
                                            {header}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>

            {/* Preview */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-sm">Preview - Available to AI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-1">
                  {formData.selectedVariables
                    .filter(v => v.isSelected && v.csvHeader)
                    .map(v => {
                      const variable = STANDARD_VARIABLES.find(sv => sv.key === v.variableKey);
                      return (
                        <div key={v.variableKey}>
                          <span className="font-mono">{`{{${v.variableKey}}}`}</span>: {variable?.label} from {v.csvHeader}
                        </div>
                      );
                    })}
                  {formData.selectedVariables.filter(v => v.isSelected && v.csvHeader).length === 0 && (
                    <div className="text-muted-foreground">No fields selected</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Review & Launch</h3>
            
            <Card>
              <CardHeader>
                <CardTitle>Campaign Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><strong>Name:</strong> {formData.name}</div>
                <div><strong>Agent:</strong> {agents.find(a => a.id === formData.agent_id)?.name}</div>
                <div><strong>Contact Group:</strong> {contactGroups.find(g => g.id === formData.contact_group_id)?.name}</div>
                <div><strong>Selected Fields:</strong> {formData.selectedVariables.filter(v => v.isSelected && v.csvHeader).length} fields</div>
                <div><strong>Concurrent Calls:</strong> {formData.concurrent_calls}</div>
                <div><strong>Retry Days:</strong> {formData.max_retry_days}</div>
                <div><strong>Calling Hours:</strong> {formData.calling_hours.start} - {formData.calling_hours.end}</div>
                <div><strong>Active Days:</strong> {formData.active_days.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join(', ')}</div>
              </CardContent>
            </Card>
            
            <div className="bg-warning/10 border border-warning p-4 rounded-lg">
              <p className="text-sm">
                <strong>Important:</strong> Once launched, your campaign will begin calling contacts immediately during the specified hours.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Campaign - Step {currentStep} of 4</DialogTitle>
        </DialogHeader>
        
        <div className="py-6">
          {renderStep()}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={currentStep === 1 ? onClose : handleBack}
            disabled={loading}
          >
            {currentStep === 1 ? 'Cancel' : (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </>
            )}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={loading}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleLaunch} disabled={loading}>
              {loading ? (
                <>
                  <CircleNotch className="h-4 w-4 mr-2 animate-spin" />
                  Launching...
                </>
              ) : (
                'Launch Campaign'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}