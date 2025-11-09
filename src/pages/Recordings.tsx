// @ts-nocheck
import { Play, DownloadSimple as Download, FileText, Funnel as Filter } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CallRecord {
  id: string;
  call_status: string | null;
  call_duration: number | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  transcript: string | null;
  recording_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  retell_call_id: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  appointment_data: any;
  contacts?: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
  } | null;
  campaigns?: {
    name: string;
    user_agents?: {
      name: string;
    } | null;
  } | null;
}

export default function Recordings() {
  const [recordings, setRecordings] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRecordings = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from('campaign_contact_attempts')
        .select(`
          *,
          contacts(first_name, last_name, phone_number),
          campaigns(name, user_agents(name))
        `)
        .eq('user_id', user.id)
        .not('retell_call_id', 'is', null) // Only actual calls
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setRecordings(data || []);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      toast({
        title: "Error",
        description: "Failed to load call recordings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getPhoneNumber = (contact: CallRecord['contacts']) => {
    return contact?.phone_number || 'Unknown';
  };

  const getContactName = (contact: CallRecord['contacts']) => {
    if (!contact) return 'Unknown';
    const firstName = contact.first_name || '';
    const lastName = contact.last_name || '';
    return `${firstName} ${lastName}`.trim() || 'Unknown';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Call History</h1>
            <p className="text-muted-foreground mt-1">Loading call history...</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Call History</h1>
          <p className="text-muted-foreground mt-1">
            View all call history from your AI agents and campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button className="primary-button">
            <Download className="h-4 w-4 mr-2" />
            Export All
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <Input 
          placeholder="Search by contact name..." 
          className="max-w-md" 
          aria-label="Search recordings by contact name"
        />
        <Button variant="outline">This Week</Button>
        <Button variant="outline">All Agents</Button>
        <Button variant="outline">All Sentiments</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call History</CardTitle>
          <CardDescription>
            Complete history of all calls made by your AI agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No call history found. Calls will appear here once your campaigns start making calls.
                  </TableCell>
                </TableRow>
              ) : (
                recordings.map((recording) => (
                  <TableRow key={recording.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {recording.created_at ? new Date(recording.created_at).toLocaleDateString() : 'N/A'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {recording.created_at ? new Date(recording.created_at).toLocaleTimeString() : 'N/A'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{getContactName(recording.contacts)}</TableCell>
                    <TableCell>{getPhoneNumber(recording.contacts)}</TableCell>
                    <TableCell>{recording.campaigns?.name || 'Unknown'}</TableCell>
                    <TableCell>{formatDuration(recording.call_duration)}</TableCell>
                    <TableCell>
                      <Badge variant={
                        recording.call_status === "completed" ? "default" :
                        recording.call_status === "appointment_booked" ? "default" :
                        recording.call_status === "failed" ? "destructive" : "secondary"
                      }>
                        {recording.call_status?.replace(/_/g, ' ') || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {recording.recording_url && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(recording.recording_url!, '_blank')}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {recording.transcript && (
                          <Button variant="ghost" size="sm">
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {recording.recording_url && (
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}