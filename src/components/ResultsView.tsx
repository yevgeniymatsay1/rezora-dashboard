// @ts-nocheck
import { useState, useEffect, memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Phone, Clock, Funnel as Filter, DownloadSimple as Download, DotsThreeOutline as MoreHorizontal, Eye, User, Archive, ArrowLeft } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { useParams, useNavigate } from "react-router-dom";
import { CallDetailsModal } from "./CallDetailsModal";

interface CallResult {
  id: string;
  campaign_id: string;
  contact_id: string;
  phone_number: string;
  call_status: string;
  call_duration: number | null;
  call_summary: any;
  appointment_data: any;
  custom_analysis: any;
  follow_up_potential: string | null;
  follow_up_reason: string | null;
  transcript: string | null;
  recording_url: string | null;
  created_at: string;
  ended_at: string | null;
  call_successful: boolean | null;
  // Contact data
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  // Campaign data
  campaign_name?: string;
  agent_customizations?: any;
  // Cost data
  call_costs?: { user_cost_cents: number };
}

interface ResultsViewProps {
  selectedCampaignId?: string;
}

function ResultsView({ selectedCampaignId }: ResultsViewProps) {
  const { id: urlCampaignId } = useParams();
  const navigate = useNavigate();
  const campaignId = selectedCampaignId || urlCampaignId;
  
  const [results, setResults] = useState<CallResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaignName, setCampaignName] = useState<string>('');
  const [filters, setFilters] = useState({
    search: '',
    outcome: 'all',
    followUp: 'all',
    dateRange: '7'
  });
  const [agentConfig, setAgentConfig] = useState<unknown>(null);
  const [selectedCall, setSelectedCall] = useState<CallResult | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchResults();
  }, [campaignId, filters]);

  const fetchResults = async () => {
    try {
      let query = supabase
        .from('campaign_contact_attempts')
        .select(`
          *,
          contacts!inner(
            first_name,
            last_name,
            email
          ),
          campaigns!inner(
            name,
            user_agents(customizations)
          ),
          call_costs(user_cost_cents)
        `)
        .order('created_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      // Date filter
      if (filters.dateRange !== 'all') {
        const days = parseInt(filters.dateRange);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = query.gte('created_at', cutoffDate.toISOString());
      }

      // Follow-up filter
      if (filters.followUp !== 'all') {
        query = query.eq('follow_up_potential', filters.followUp);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      const transformedResults = data?.map(result => ({
        ...result,
        contact_first_name: result.contacts?.first_name,
        contact_last_name: result.contacts?.last_name,
        contact_email: result.contacts?.email,
        campaign_name: result.campaigns?.name,
        agent_customizations: result.campaigns?.user_agents?.customizations,
        call_costs: result.call_costs?.[0] || null
      })) || [];

      // Get agent config and campaign name from first result
      if (transformedResults.length > 0) {
        if (transformedResults[0].agent_customizations) {
          setAgentConfig(transformedResults[0].agent_customizations);
        }
        if (transformedResults[0].campaign_name) {
          setCampaignName(transformedResults[0].campaign_name);
        }
      }

      // Client-side search filter
      let filteredResults = transformedResults;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredResults = transformedResults.filter(result =>
          result.contact_first_name?.toLowerCase().includes(searchLower) ||
          result.contact_last_name?.toLowerCase().includes(searchLower) ||
          result.phone_number?.includes(searchLower) ||
          result.campaign_name?.toLowerCase().includes(searchLower)
        );
      }

      setResults(filteredResults);
    } catch (error) {
      console.error('Error fetching results:', error);
      toast({
        title: "Error",
        description: "Failed to load results. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getOutcomeBadge = (result: CallResult) => {
    if (result.appointment_data?.booked) {
      return <Badge variant="success">Appointment Booked</Badge>;
    }

    if (result.call_successful === true) {
      return <Badge variant="success">Successful</Badge>;
    }

    // Treat both false and null as unsuccessful
    if (result.call_successful === false || result.call_successful === null) {
      return <Badge variant="destructive">Unsuccessful</Badge>;
    }

    if (result.custom_analysis && Object.keys(result.custom_analysis).length > 0) {
      return <Badge variant="info">Data Extracted</Badge>;
    }

    if (result.follow_up_potential === 'high') {
      return <Badge variant="warning">High Follow-up</Badge>;
    }

    if (result.follow_up_potential === 'medium') {
      return <Badge variant="warning">Medium Follow-up</Badge>;
    }

    return <Badge variant="outline">Completed</Badge>;
  };

  const getFollowUpBadge = (potential: string | null, reason: string | null) => {
    if (!potential || potential === 'none') return null;

    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge className={colors[potential as keyof typeof colors]}>
        {potential.charAt(0).toUpperCase() + potential.slice(1)}
        {reason && ` - ${reason.replace(/_/g, ' ')}`}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatCost = (cents: number | null) => {
    if (!cents) return '-';
    return `$${(cents / 100).toFixed(3)}`;
  };

  const exportResults = () => {
    const csvContent = [
      ['Name', 'Phone', 'Campaign', 'Outcome', 'Duration', 'Cost', 'Follow-up', 'Date'],
      ...results.map(result => [
        `${result.contact_first_name || ''} ${result.contact_last_name || ''}`.trim(),
        result.phone_number,
        result.campaign_name,
        result.appointment_data?.booked ? 'Appointment' : result.custom_analysis ? 'Data' : 'Call',
        formatDuration(result.call_duration),
        formatCost(result.call_costs?.user_cost_cents || null),
        result.follow_up_potential || 'None',
        format(new Date(result.created_at), 'MM/dd/yyyy')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'call-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate metrics
  const totalResults = results.length;
  const appointmentCount = results.filter(r => r.appointment_data?.booked).length;
  const highFollowUpCount = results.filter(r => r.follow_up_potential === 'high').length;
  const customDataCount = results.filter(r => r.custom_analysis && Object.keys(r.custom_analysis).length > 0).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-8 bg-muted rounded animate-pulse mb-2"></div>
                <div className="h-4 bg-muted rounded animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button for single campaign view */}
      {campaignId && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Results</h1>
            {campaignName && (
              <p className="text-muted-foreground mt-1">
                Campaign: {campaignName}
              </p>
            )}
          </div>
        </div>
      )}
      
      {/* Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalResults}</p>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {agentConfig?.enableCalendarBooking && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-600">{appointmentCount}</p>
                  <p className="text-sm text-muted-foreground">Appointments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{highFollowUpCount}</p>
                <p className="text-sm text-muted-foreground">High Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {customDataCount > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Archive className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-600">{customDataCount}</p>
                  <p className="text-sm text-muted-foreground">Data Extracted</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Call Results</CardTitle>
              <CardDescription>
                View and manage results from your campaigns
              </CardDescription>
            </div>
            <Button onClick={exportResults} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-6">
            <Input
              placeholder="Search contacts..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="max-w-xs"
              aria-label="Search contacts in campaign results"
            />
            
            <select
              value={filters.followUp}
              onChange={(e) => setFilters(prev => ({ ...prev, followUp: e.target.value }))}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Follow-ups</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
              <option value="none">No Follow-up</option>
            </select>

            <select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
              className="px-3 py-2 border rounded-md"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          {/* Results Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>Contact</TableHead>
                   <TableHead>Phone</TableHead>
                   <TableHead>Campaign</TableHead>
                   <TableHead>Outcome</TableHead>
                   {customDataCount > 0 && (
                     <TableHead>Custom Analysis</TableHead>
                   )}
                   <TableHead>Duration</TableHead>
                   <TableHead>Cost</TableHead>
                   <TableHead>Called</TableHead>
                   <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={customDataCount > 0 ? 9 : 8} className="text-center py-8 text-muted-foreground">
                       No results found. Start a campaign to see call results here.
                     </TableCell>
                  </TableRow>
                ) : (
                  results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {result.contact_first_name} {result.contact_last_name}
                          </p>
                          {result.contact_email && (
                            <p className="text-sm text-muted-foreground">{result.contact_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {result.phone_number}
                      </TableCell>
                       <TableCell>{result.campaign_name}</TableCell>
                       <TableCell>{getOutcomeBadge(result)}</TableCell>
                       {customDataCount > 0 && (
                         <TableCell>
                           {result.custom_analysis ? (
                             <div className="space-y-1">
                               {Object.entries(result.custom_analysis).map(([key, value]) => (
                                 <div key={key} className="text-sm">
                                   <span className="font-medium text-muted-foreground">
                                     {key.replace(/_/g, ' ')}: 
                                   </span>
                                   <span className="ml-1 font-semibold">
                                     {String(value)}
                                   </span>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <span className="text-muted-foreground text-sm">No data</span>
                           )}
                         </TableCell>
                       )}
                       <TableCell>
                         <div className="flex items-center space-x-1">
                           <Clock className="h-3 w-3 text-muted-foreground" />
                           <span className="text-sm">{formatDuration(result.call_duration)}</span>
                         </div>
                       </TableCell>
                       <TableCell>
                         <span className="text-sm font-mono">
                           {formatCost(result.call_costs?.user_cost_cents || null)}
                         </span>
                       </TableCell>
                       <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                             <DropdownMenuItem 
                               onClick={() => {
                                 setSelectedCall(result);
                                 setIsModalOpen(true);
                               }}
                             >
                               <Eye className="h-4 w-4 mr-2" />
                               View Call Details
                             </DropdownMenuItem>
                             {result.appointment_data?.booked && (
                               <DropdownMenuItem>
                                 <Calendar className="h-4 w-4 mr-2" />
                                 View Appointment
                               </DropdownMenuItem>
                             )}
                           </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
}

export default memo(ResultsView);