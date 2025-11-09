// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { Phone, Play, Pause, Stop as Square, Plus, Target, Calendar, Users, TrendUp as TrendingUp, DotsThreeOutline as MoreHorizontal, Trash as Trash2, CreditCard, WarningCircle as AlertCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CampaignCreationWizard } from "@/components/CampaignCreationWizard";
import ResultsView from "@/components/ResultsView";
import { useNavigate, useParams } from "react-router-dom";
import { useTimezone } from "@/hooks/useTimezone";
import { getUserCredits, formatCredits } from "@/lib/credits";
import { validateCampaignTransition, type CampaignStatus } from "@/lib/campaign-state-machine";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { withTimeout, TIMEOUT_DURATIONS } from "@/lib/timeout";
import { CreditStatusIndicator } from "@/components/CreditStatusIndicator";

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  concurrent_calls: number;
  max_retry_days: number;
  calling_hours: any;
  active_days: string[];
  field_mappings: any;
  timezone?: string;
  paused_reason?: string | null;
  user_agents?: { name: string; phone_numbers?: { phone_number: string } };
  contact_groups?: { name: string; contacts?: unknown[] };
  total_contacts?: number;
  completed_contacts?: number; // This now represents "contacts called"
  in_progress_calls?: number; // This now represents "active calls"
  success_rate?: number;
  pickups?: number;
  no_answers?: number;
  failed_calls?: number;
}

interface CampaignCardProps {
  campaign: Campaign;
  onPause: (campaignId: string) => void;
  onResume: (campaignId: string) => void;
  onDelete: (campaignId: string) => void;
  onNavigateResults: (campaignId: string) => void;
  getPausedReasonDisplay: (reason: string | null | undefined) => string;
  getNextCallingTime: (campaign: Campaign) => string;
}

const CampaignCard = ({
  campaign,
  onPause,
  onResume,
  onDelete,
  onNavigateResults,
  getPausedReasonDisplay,
  getNextCallingTime
}: CampaignCardProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {campaign.name}
            <Badge variant={
              campaign.status === 'active' ? 'default' :
              campaign.status === 'paused' ? 'secondary' :
              campaign.status === 'completed' ? 'outline' : 'secondary'
            }>
              {campaign.status}
            </Badge>
            {campaign.status === 'paused' && campaign.paused_reason && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-4 w-4 mr-1" />
                {getPausedReasonDisplay(campaign.paused_reason)}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Agent: {campaign.user_agents?.name || 'Not assigned'} •
            Contacts: {campaign.contact_groups?.name || 'Not assigned'}
          </CardDescription>
          {campaign.status === 'paused' && (campaign.paused_reason === 'user has no credits' || campaign.paused_reason === 'insufficient_credits') && (
            <div className="mt-2 p-2 bg-destructive/10 rounded-md">
              <p className="text-sm text-destructive font-medium">
                Campaign paused due to insufficient credits. Add credits to resume.
              </p>
            </div>
          )}
          {campaign.status === 'paused' && campaign.paused_reason === 'outside_calling_hours' && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700 font-medium">
                Campaign paused - outside calling hours
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Will resume at {getNextCallingTime(campaign)}
              </p>
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {campaign.status === 'active' && (
              <DropdownMenuItem onClick={() => onPause(campaign.id)}>
                <Pause className="h-4 w-4 mr-2" />
                Pause Campaign
              </DropdownMenuItem>
            )}
            {campaign.status === 'paused' && (
              <DropdownMenuItem onClick={() => onResume(campaign.id)}>
                <Play className="h-4 w-4 mr-2" />
                Resume Campaign
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onDelete(campaign.id)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Campaign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardHeader>

    <CardContent className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Contacts Called</span>
          <span>{campaign.completed_contacts || 0} / {campaign.total_contacts || 0}</span>
        </div>
        <Progress
          value={campaign.total_contacts ? (campaign.completed_contacts || 0) / campaign.total_contacts * 100 : 0}
        />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Live calls:</span>
          <span className="text-sm font-medium">
            {campaign.in_progress_calls || 0} / {campaign.concurrent_calls} concurrent
          </span>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Pickups: {campaign.pickups || 0}</span>
          <span className="text-muted-foreground">No answer: {campaign.no_answers || 0}</span>
          {(campaign.failed_calls || 0) > 0 && (
            <span className="text-muted-foreground">Failed: {campaign.failed_calls}</span>
          )}
        </div>

      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>{campaign.concurrent_calls} concurrent calls</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>{campaign.calling_hours?.start || '09:00'} - {campaign.calling_hours?.end || '17:00'}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigateResults(campaign.id)}>
          <Target className="h-4 w-4 mr-1" />
          Results
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreationWizard, setShowCreationWizard] = useState(false);
  const [userCredits, setUserCredits] = useState<number>(0);
  const { toast } = useToast();
  const navigate = useNavigate();
  const timezone = useTimezone();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  

  const fetchCampaignMetrics = useCallback(async (campaignId: string) => {
    // Get campaign data with contact group info
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select(`
        *,
        contact_groups(total_contacts)
      `)
      .eq('id', campaignId)
      .single();

    // Get call attempts
    const { data: attempts } = await supabase
      .from('campaign_contact_attempts')
      .select('*')
      .eq('campaign_id', campaignId);

    const total_contacts = campaignData?.contact_groups?.total_contacts || 0;
    
    // Count actual calls made (those with retell_call_id)
    const actual_calls_made = attempts?.filter((a: any) => a.retell_call_id !== null).length || 0;
    
    // Count call results
    const pickups = attempts?.filter((a: any) => a.call_status === 'completed').length || 0;
    const no_answers = attempts?.filter((a: any) => a.call_status === 'no-answer').length || 0;
    const failed_calls = attempts?.filter((a: any) => a.call_status === 'failed').length || 0;
    
    // Count active calls (only for active campaigns, recent in-progress calls with retell_call_id)
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    let active_calls = 0;
    if (campaignData?.status === 'active') {
      active_calls = attempts?.filter((a: any) => 
        a.call_status === 'in-progress' && 
        a.retell_call_id !== null &&
        new Date(a.created_at) > fiveMinutesAgo
      ).length || 0;
    }
    
    const success_rate = actual_calls_made > 0 ? (pickups / actual_calls_made) * 100 : 0;

    return {
      total_contacts,
      completed_contacts: actual_calls_made, // This is now "contacts called"
      in_progress_calls: active_calls, // This is now "active calls"
      success_rate: Math.round(success_rate),
      pickups,
      no_answers,
      failed_calls,
      totalContacts: total_contacts,
      completedCalls: pickups,
      successRate: Math.round(success_rate)
    };
  }, []);

  const fetchUserCredits = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const credits = await getUserCredits(user.id);
        setUserCredits(credits);
      }
    } catch (error) {
      console.error('Error fetching user credits:', error);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('campaigns')
          .select(`
            *,
            user_agents(name, phone_numbers(phone_number)),
            contact_groups(name, contacts(count))
          `)
          .order('created_at', { ascending: false }),
        TIMEOUT_DURATIONS.LONG,
        'Failed to fetch campaigns. Please try again.'
      );

      if (error) throw error;

      const campaignsWithMetrics = await withTimeout(
        Promise.all(
          (data || []).map(async (campaign: any) => {
            const metrics = await fetchCampaignMetrics(campaign.id);
            return { ...campaign, ...metrics } as Campaign;
          })
        ),
        TIMEOUT_DURATIONS.LONG,
        'Failed to fetch campaign metrics. Please try again.'
      );

      setCampaigns(campaignsWithMetrics);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast({
        title: "Error",
        description: "Failed to load campaigns. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [fetchCampaignMetrics, toast]);

  useEffect(() => {
    fetchCampaigns();
    fetchUserCredits();
    const subscription = supabase
      .channel('campaigns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, () => {
        fetchCampaigns();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchCampaigns, fetchUserCredits]);


  const handlePauseCampaign = async (campaignId: string) => {
    try {
      // Find the campaign to validate transition
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Validate state transition
      const validation = validateCampaignTransition(campaign, 'paused');
      if (!validation.valid) {
        toast({
          title: "Invalid Operation",
          description: validation.error,
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign paused successfully",
      });

      fetchCampaigns();
    } catch (error) {
      console.error('Error pausing campaign:', error);
      toast({
        title: "Error",
        description: "Failed to pause campaign",
        variant: "destructive"
      });
    }
  };

  const checkCreditsBeforeStart = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: creditCheck } = await supabase.rpc('check_and_reserve_credits', {
        p_user_id: user.id,
        p_estimated_cost_cents: 100 // Minimum estimated cost per call
      });

      const creditResult = creditCheck as any;

      if (!creditResult?.success) {
        toast({
          title: "Credit Check Failed",
          description: "Unable to verify credits. Please try again.",
          variant: "destructive",
        });
        return false;
      }

      if (creditResult.current_balance <= 0) {
        toast({
          title: "Insufficient Credits",
          description: `You have ${formatCredits(creditResult.current_balance)} credits. Add credits to start campaigns.`,
          variant: "destructive",
        });
        return false;
      }

      if (creditResult.current_balance < 500) { // Less than $5
        toast({
          title: "Low Credits Warning",
          description: `You have ${formatCredits(creditResult.current_balance)} credits remaining. Consider adding more credits soon.`,
          variant: "default",
        });
      }

      return true;
    } catch (error) {
      console.error('Error checking credits:', error);
      toast({
        title: "Error",
        description: "Failed to check credits. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    // Check credits before resuming
    const hasCredits = await checkCreditsBeforeStart();
    if (!hasCredits) return;

    try {
      // Find the campaign to validate transition
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Validate state transition
      const validation = validateCampaignTransition(campaign, 'active');
      if (!validation.valid) {
        toast({
          title: "Invalid Operation",
          description: validation.error,
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('campaigns')
        .update({ 
          status: 'active',
          paused_reason: null 
        })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success", 
        description: "Campaign resumed successfully",
      });

      fetchCampaigns();
      fetchUserCredits(); // Refresh credits display
    } catch (error) {
      console.error('Error resuming campaign:', error);
      toast({
        title: "Error",
        description: "Failed to resume campaign",
        variant: "destructive"
      });
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const confirmed = await confirm(
      'Delete Campaign',
      'Are you sure you want to delete this campaign? This action cannot be undone.',
      'destructive'
    );
    
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign deleted successfully",
      });

      fetchCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        title: "Error",
        description: "Failed to delete campaign",
        variant: "destructive"
      });
    }
  };

  const getPausedReasonDisplay = (reason: string | null | undefined): string => {
    if (!reason) return '';
    
    switch (reason) {
      case 'user has no credits':
      case 'insufficient_credits':
        return 'Insufficient Credits';
      case 'no eligible contacts':
        return 'No contacts to call';
      case 'outside_calling_hours':
        return 'Outside calling hours';
      default:
        return reason;
    }
  };

  const getNextCallingTime = (campaign: Campaign): string => {
    if (!campaign.calling_hours || !campaign.active_days) return 'Unknown';
    
    const timezone = campaign.timezone || 'America/New_York';
    const now = new Date();
    const currentTimeInTimezone = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
    const currentDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][currentTimeInTimezone.getDay()];
    
    const [startHour, startMin] = campaign.calling_hours.start.split(':').map(Number);
    
    // If today is an active day and we haven't passed today's start time yet
    if (campaign.active_days.includes(currentDay)) {
      const currentTime = currentTimeInTimezone.getHours() * 60 + currentTimeInTimezone.getMinutes();
      const startMinutes = startHour * 60 + startMin;
      
      if (currentTime < startMinutes) {
        // Return today's start time
        const nextStart = new Date(currentTimeInTimezone);
        nextStart.setHours(startHour, startMin, 0, 0);
        return nextStart.toLocaleString("en-US", {
          timeZone: timezone,
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
    }
    
    // Find next active day
    const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    let daysToAdd = 1;
    let nextDay = (currentTimeInTimezone.getDay() + daysToAdd) % 7;
    
    while (!campaign.active_days.includes(daysOfWeek[nextDay]) && daysToAdd < 7) {
      daysToAdd++;
      nextDay = (currentTimeInTimezone.getDay() + daysToAdd) % 7;
    }
    
    const nextStart = new Date(currentTimeInTimezone);
    nextStart.setDate(nextStart.getDate() + daysToAdd);
    nextStart.setHours(startHour, startMin, 0, 0);
    
    return nextStart.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // CampaignCard component has been moved outside

  if (loading) {
    return <div>Loading campaigns...</div>;
  }

  return (
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            Manage your AI calling campaigns and track performance
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <CreditStatusIndicator variant="compact" />
          <Button 
            onClick={() => setShowCreationWizard(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Launch New Campaign
          </Button>
        </div>
      </div>

      <CreditStatusIndicator variant="alert" />

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="active">Active Campaigns</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-6">
            {campaigns
              .filter(c => ['active', 'paused', 'scheduled'].includes(c.status))
              .map(campaign => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onPause={handlePauseCampaign}
                  onResume={handleResumeCampaign}
                  onDelete={handleDeleteCampaign}
                  onNavigateResults={(id) => navigate(`/campaigns/${id}/results`)}
                  getPausedReasonDisplay={getPausedReasonDisplay}
                  getNextCallingTime={getNextCallingTime}
                />
              ))}
          </div>
          
          {campaigns.filter(c => ['active', 'paused', 'scheduled'].includes(c.status)).length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Campaigns</h3>
                <p className="text-muted-foreground mb-4">
                  Launch your first campaign to start making AI calls
                </p>
                <Button onClick={() => setShowCreationWizard(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Launch Campaign
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="completed">
          <div className="grid grid-cols-1 gap-4">
            {campaigns
              .filter(c => c.status === 'completed')
              .map(campaign => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onPause={handlePauseCampaign}
                  onResume={handleResumeCampaign}
                  onDelete={handleDeleteCampaign}
                  onNavigateResults={(id) => navigate(`/campaigns/${id}/results`)}
                  getPausedReasonDisplay={getPausedReasonDisplay}
                  getNextCallingTime={getNextCallingTime}
                />
              ))}
          </div>
        </TabsContent>
        
        <TabsContent value="drafts">
          <div className="grid grid-cols-1 gap-4">
            {campaigns
              .filter(c => c.status === 'draft')
              .map(campaign => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onPause={handlePauseCampaign}
                  onResume={handleResumeCampaign}
                  onDelete={handleDeleteCampaign}
                  onNavigateResults={(id) => navigate(`/campaigns/${id}/results`)}
                  getPausedReasonDisplay={getPausedReasonDisplay}
                  getNextCallingTime={getNextCallingTime}
                />
              ))}
          </div>
        </TabsContent>

        <TabsContent value="results">
          <ResultsView />
        </TabsContent>
      </Tabs>

      {showCreationWizard && (
        <CampaignCreationWizard 
          onClose={() => setShowCreationWizard(false)}
          onSuccess={() => {
            setShowCreationWizard(false);
            fetchCampaigns();
          }}
          userTimezone={timezone}
        />
      )}
      
      <ConfirmDialog />
    </div>
  );
}