import { useState, memo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Phone as PhoneIcon,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  Clock as ClockIcon,
  TrendUp as TrendUpIcon,
  TrendDown as TrendDownIcon,
  Play as PlayIcon,
  Warning as WarningIcon,
  WarningCircle as AlertCircle,
  Pause as PauseIcon,
  ArrowsClockwise as RefreshIcon,
  Robot as RobotIcon,
  Pulse as ActivityIcon,
  CreditCard as CreditCardIcon,
  CircleNotch as LoaderIcon,
  PhoneCall as PhoneCallIcon,
  PhoneX as PhoneOffIcon,
  PhoneDisconnect as PhoneMissedIcon,
  Headset as HeadsetIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAuth } from "@/contexts/AuthContext";
import { formatCredits } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CallDetailsModal } from "./CallDetailsModal";

const Dashboard = memo(function Dashboard() {
  const [timePeriod, setTimePeriod] = useState("today");
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { 
    metrics, 
    campaigns, 
    activity, 
    performance, 
    appointments,
    isLoading, 
    error,
    refetch 
  } = useDashboardData(timePeriod);

  // Get user's first name from email or profile
  const userName = user?.email?.split('@')[0] || 'there';

  // Format trend indicator
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendUpIcon weight="duotone" className="h-3 w-3 mr-1" />;
    if (trend < 0) return <TrendDownIcon weight="duotone" className="h-3 w-3 mr-1" />;
    return null;
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-success';
    if (trend < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  // Handle campaign pause/resume
  const handleCampaignToggle = async (campaignId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      
      const { error } = await supabase
        .from('campaigns')
        .update({ status: newStatus })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: newStatus === 'active' ? "Campaign Resumed" : "Campaign Paused",
        description: `Campaign has been ${newStatus === 'active' ? 'resumed' : 'paused'} successfully.`,
      });

      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update campaign status",
        variant: "destructive",
      });
    }
  };

  // Format time ago
  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - timestamp.getTime()) / 1000); // seconds
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Handle opening call details modal
  const handleViewCallDetails = async (call: any) => {
    // Fetch full call details including contact info
    try {
      const { data: fullCallData, error } = await supabase
        .from('campaign_contact_attempts')
        .select(`
          *,
          contacts!inner(
            first_name,
            last_name,
            email,
            phone_number
          )
        `)
        .eq('id', call.id)
        .single();

      if (error) throw error;

      // Format the data for the modal
      const formattedData = {
        ...fullCallData,
        contact_first_name: fullCallData.contacts?.first_name,
        contact_last_name: fullCallData.contacts?.last_name,
        phone_number: fullCallData.contacts?.phone_number || call.phone_number,
        contact_email: fullCallData.contacts?.email
      };

      setSelectedCall(formattedData);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error fetching call details:', error);
      toast({
        title: "Error",
        description: "Failed to load call details",
        variant: "destructive",
      });
    }
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return { variant: 'default' as const, icon: PhoneCallIcon, label: 'Completed' };
      case 'failed':
        return { variant: 'destructive' as const, icon: PhoneOffIcon, label: 'Failed' };
      case 'no-answer':
        return { variant: 'secondary' as const, icon: PhoneMissedIcon, label: 'No Answer' };
      case 'in-progress':
        return { variant: 'outline' as const, icon: PhoneIcon, label: 'In Progress' };
      default:
        return { variant: 'secondary' as const, icon: PhoneIcon, label: status };
    }
  };

  // Loading state
  if (isLoading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <WarningIcon className="h-4 w-4" />
        <AlertDescription>
          Failed to load dashboard data. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Refined */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
            Welcome back, {userName}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <RobotIcon weight="duotone" className="h-3 w-3" />
              {metrics?.activeCampaigns || 0} campaigns running
            </span>
            <span className="text-gray-400">•</span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon weight="duotone" className="h-3 w-3" />
              {metrics?.totalContacts || 0} contacts remaining
            </span>
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-40" aria-label="Select time period">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            className="primary-button"
            onClick={() => navigate('/campaigns')}
          >
            <PlayIcon className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => refetch()}
            aria-label="Refresh dashboard"
          >
            <RefreshIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Low Balance Alert */}
      {metrics?.creditsLowBalance && (
        <Alert className="border-warning bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="flex items-center justify-between">
            <span>Your credit balance is low. Add credits to continue running campaigns.</span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/billing')}
              className="ml-4"
            >
              <CreditCardIcon weight="duotone" className="h-4 w-4 mr-2" />
              Add Credits
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics - Premium Stats Bar */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Credits */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CreditCardIcon weight="duotone" className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Credits</p>
              <p className={cn(
                "text-2xl font-bold",
                metrics?.creditsLowBalance ? "text-warning" : "text-foreground"
              )}>
                {formatCredits(metrics?.creditsRemaining || 0)}
              </p>
            </div>
          </div>

          {/* Calls Today */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <PhoneIcon weight="duotone" className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Calls Today</p>
              <p className="text-2xl font-bold text-foreground">
                {metrics?.callsToday || 0}
              </p>
            </div>
          </div>

          {/* Appointments */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CalendarIcon weight="duotone" className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Appointments</p>
              <p className="text-2xl font-bold text-foreground">
                {metrics?.appointmentsBooked || 0}
              </p>
            </div>
          </div>

          {/* Success Rate */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ActivityIcon weight="duotone" className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold text-foreground">
                {metrics?.callsToday > 0 && metrics?.appointmentsBooked > 0 
                  ? `${Math.round((metrics.appointmentsBooked / metrics.callsToday) * 100)}%`
                  : '0%'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Appointments - Featured Section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon weight="duotone" className="h-5 w-5 text-green-600" />
            <h2 className="text-xl font-semibold">Upcoming Appointments</h2>
            {appointments && appointments.length > 0 && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {appointments.length} scheduled
              </Badge>
            )}
          </div>
          {appointments && appointments.length > 3 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/appointments')}
            >
              View all →
            </Button>
          )}
        </div>

        {!appointments || appointments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                  <CalendarIcon weight="duotone" className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">No appointments yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  When your AI agents book appointments, they'll appear here
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {appointments.slice(0, 3).map((appointment) => (
              <Card 
                key={appointment.id}
                className="group hover:shadow-lg transition-all duration-200 border-green-200/50 bg-gradient-to-br from-green-50/50 to-green-100/30 hover:from-green-50 hover:to-green-100/50 hover:scale-[1.02] cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <span className="text-sm font-semibold text-green-700">
                          {appointment.contactName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">
                          {appointment.contactName}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {appointment.contactEmail || 'No email'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 bg-green-100/50 rounded-md px-2 py-1">
                      <ClockIcon weight="duotone" className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        {appointment.scheduledTime}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Campaign: {appointment.campaignName || 'Unknown'}</span>
                      <span>{formatTimeAgo(appointment.bookedAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Campaigns - Enhanced Design */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <RobotIcon weight="duotone" className="h-5 w-5 text-purple-600" />
                  Active Campaigns
                </CardTitle>
                <CardDescription className="mt-1">
                  Your AI agents are working on {campaigns.length || 0} {campaigns.length === 1 ? 'campaign' : 'campaigns'}
                </CardDescription>
              </div>
              {campaigns.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => navigate('/campaigns')}
                  className="text-purple-600 hover:text-purple-700"
                >
                  View all →
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {campaigns.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/20">
                  <RobotIcon weight="duotone" className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">No active campaigns</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                  Start a campaign to let your AI agents reach out to contacts automatically
                </p>
                <Button 
                  className="mt-6 bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => navigate('/campaigns')}
                >
                  <PlayIcon className="h-4 w-4 mr-2" />
                  Start Your First Campaign
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {campaigns.slice(0, 3).map((campaign) => {
                  const isActive = campaign.status === 'active';
                  const progressPercentage = campaign.percentComplete || 0;
                  const remainingContacts = campaign.totalContacts - campaign.contactsReached;
                  
                  return (
                    <div key={campaign.id} className="p-6 hover:bg-muted/30 transition-colors">
                      {/* Campaign Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-base">{campaign.name}</h4>
                            <Badge 
                              variant={isActive ? 'default' : 'secondary'}
                              className={cn(
                                "text-xs",
                                isActive && "bg-green-100 text-green-700 border-green-200"
                              )}
                            >
                              <ActivityIcon weight="duotone" className="h-3 w-3 mr-1" />
                              {campaign.status}
                            </Badge>
                          </div>
                          
                          {/* Campaign Stats Row */}
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <UsersIcon weight="duotone" className="h-3 w-3" />
                              <span>{campaign.contactsReached} contacted</span>
                            </div>
                            {campaign.callsLastHour > 0 && (
                              <div className="flex items-center gap-1">
                                <PhoneIcon weight="duotone" className="h-3 w-3" />
                                <span>{campaign.callsLastHour} calls/hr</span>
                              </div>
                            )}
                            {remainingContacts > 0 && (
                              <div className="flex items-center gap-1">
                                <ClockIcon weight="duotone" className="h-3 w-3" />
                                <span>{remainingContacts} remaining</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Control Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCampaignToggle(campaign.id, campaign.status)}
                          className={cn(
                            "ml-4",
                            isActive ? "hover:bg-red-50 hover:text-red-600 hover:border-red-200" : "hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                          )}
                        >
                          {isActive ? (
                            <>
                              <PauseIcon className="h-4 w-4 mr-1" />
                              Pause
                            </>
                          ) : (
                            <>
                              <PlayIcon className="h-4 w-4 mr-1" />
                              Resume
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* Progress Section */}
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm font-medium">
                            <span>Campaign Progress</span>
                            <span className="text-purple-600">{progressPercentage}%</span>
                          </div>
                          <Progress 
                            value={progressPercentage} 
                            className="h-2 bg-gray-100"
                          />
                        </div>
                        
                        {/* Bottom Stats */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4 text-muted-foreground">
                            <span>
                              {campaign.contactsReached}/{campaign.totalContacts} contacts
                            </span>
                            {campaign.estimatedCompletion && (
                              <span className="flex items-center gap-1">
                                <ClockIcon weight="duotone" className="h-3 w-3" />
                                Est. {campaign.estimatedCompletion}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {campaigns.length > 3 && (
                  <Button 
                    variant="ghost" 
                    className="w-full"
                    onClick={() => navigate('/campaigns')}
                  >
                    View All Campaigns
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Calls - Clean Table View */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Call Activity</CardTitle>
                <CardDescription className="text-xs">
                  Recent calls from your campaigns
                </CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/recordings')}
              >
                View all →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <div className="text-center py-8 px-4">
                <PhoneOffIcon weight="duotone" className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No recent calls. Activity will appear once campaigns start.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activity.slice(0, 5).map((item) => {
                  const statusInfo = getStatusBadge(item.outcome || item.type);
                  const StatusIcon = statusInfo.icon;
                  const hasAppointment = item.appointment_data?.booked === true;
                  
                  return (
                    <div 
                      key={item.id} 
                      className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleViewCallDetails(item)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Contact Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            item.outcome === 'completed' ? "bg-green-500" :
                            item.outcome === 'failed' ? "bg-red-500" :
                            item.outcome === 'no-answer' ? "bg-gray-400" : "bg-blue-500"
                          )} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.contactName || 'Unknown Contact'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.campaignName || 'Unknown Campaign'}
                            </p>
                          </div>
                        </div>

                        {/* Status & Duration */}
                        <div className="flex items-center gap-4 text-sm">
                          {hasAppointment && (
                            <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                              <CalendarIcon weight="duotone" className="h-3 w-3 mr-1" />
                              Booked
                            </Badge>
                          )}
                          <div className="text-right">
                            <p className="font-medium">{item.duration || '0:00'}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimeAgo(item.timestamp)}
                            </p>
                          </div>
                          {item.recording_url && (
                            <HeadsetIcon weight="duotone" className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights - Refined Analytics */}
      {performance && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Call Volume Trend - Simplified Chart */}
          <Card className="lg:col-span-2 overflow-hidden hover:shadow-lg transition-all duration-200">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ActivityIcon weight="duotone" className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">Performance Analytics</CardTitle>
                </div>
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                  {timePeriod}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Call volume and success metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {performance.hourlyCallVolume.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={performance.hourlyCallVolume} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="hsl(var(--border))" 
                        strokeOpacity={0.3}
                        vertical={false}
                      />
                      <XAxis 
                        dataKey="hour" 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="calls" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2.5}
                        fill="url(#colorCalls)"
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  
                  {/* Quick Stats Bar */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{metrics?.callsToday || 0}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total Calls</p>
                    </div>
                    <div className="text-center border-x border-border">
                      <p className="text-2xl font-bold text-green-600">{metrics?.appointmentsBooked || 0}</p>
                      <p className="text-xs text-muted-foreground mt-1">Appointments</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-600">
                        {metrics?.callsToday > 0 ? Math.round(metrics.appointmentsBooked / metrics.callsToday * 100) : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Success Rate</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[280px]">
                  <ActivityIcon weight="duotone" className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No call data for {timePeriod}</p>
                  <p className="text-xs text-muted-foreground mt-1">Start a campaign to see analytics</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Metrics Card */}
          <Card className="overflow-hidden hover:shadow-lg transition-all duration-200">
            <CardHeader className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClockIcon weight="duotone" className="h-4 w-4 text-purple-600" />
                Call Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Average Duration */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                  <span className="text-2xl font-bold text-purple-600">
                    {performance.averageCallDuration}
                  </span>
                </div>
                <p className="text-sm font-medium">Avg Call Duration</p>
                <p className="text-xs text-muted-foreground mt-1">minutes per call</p>
              </div>
              
              {/* Stats List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <PhoneCallIcon weight="duotone" className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Completed</span>
                  </div>
                  <span className="text-sm font-semibold">{metrics?.callsToday || 0}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <CalendarIcon weight="duotone" className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">Booked</span>
                  </div>
                  <span className="text-sm font-semibold">{metrics?.appointmentsBooked || 0}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-2">
                    <TrendUpIcon weight="duotone" className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Success Rate</span>
                  </div>
                  <span className="text-sm font-bold text-green-600">
                    {metrics?.callsToday > 0 && metrics?.appointmentsBooked > 0 
                      ? `${Math.round((metrics.appointmentsBooked / metrics.callsToday) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Call Details Modal */}
      <CallDetailsModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedCall(null);
        }}
        callData={selectedCall}
      />
    </div>
  );
});

export { Dashboard };
