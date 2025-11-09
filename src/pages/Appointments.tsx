import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CallDetailsModal } from "@/components/CallDetailsModal";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

interface AppointmentData {
  booked?: boolean;
  time_text?: string | null;
  name?: string | null;
  email?: string | null;
  execution_message?: string | null;
  tool_call_id?: string | null;
  source?: string | null;
}

interface AppointmentAttempt {
  id: string;
  contact_id: string | null;
  campaign_id: string | null;
  phone_number: string;
  created_at: string;
  appointment_data: AppointmentData | null;
}

interface ContactInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface CampaignInfo {
  id: string;
  name: string;
}

interface CallDetails {
  id: string;
  contact_id: string | null;
  phone_number: string;
  call_status: string | null;
  call_duration: number | null;
  recording_url: string | null;
  call_summary: string | Record<string, unknown> | null;
  custom_analysis: Record<string, unknown> | null;
  appointment_data: AppointmentData | null;
  follow_up_potential: string | null;
  follow_up_reason: string | null;
}

interface SelectedCallData {
  contact_first_name: string;
  contact_last_name: string;
  phone_number: string;
  recording_url?: string;
  call_summary?: string;
  call_duration?: number;
  call_status?: string;
  follow_up_potential?: string;
  follow_up_reason?: string;
  appointment_data?: AppointmentData;
  custom_analysis?: Record<string, unknown>;
}

export default function Appointments() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AppointmentAttempt[]>([]);
  const [contactsById, setContactsById] = useState<Record<string, ContactInfo>>({});
  const [campaignsById, setCampaignsById] = useState<Record<string, CampaignInfo>>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCallData, setSelectedCallData] = useState<SelectedCallData | null>(null);

  // Use React pattern for document metadata
  useDocumentMeta({
    title: "Upcoming Appointments | Rezora",
    description: "View upcoming appointments booked by your AI agents with leads.",
    keywords: "appointments, AI agents, leads, scheduling"
  });

  useEffect(() => {
    const fetchData = async () => {
      console.log("Starting fetchData for appointments...");
      try {
        setLoading(true);
        // Get current user from session
        console.log("Getting session...");
        const { data: { session } } = await supabase.auth.getSession();
        console.log("Session fetched:", session?.user?.id);
        if (!session?.user) throw new Error("User not authenticated");
        const user = session.user;

        // Try primary query with contains
        console.log("Starting primary query...");
        let { data: attempts, error } = await supabase
          .from("campaign_contact_attempts")
          .select("id, contact_id, campaign_id, phone_number, created_at, appointment_data, user_id")
          .eq("user_id", user.id)  // Filter by current user
          .contains("appointment_data", { booked: true })
          .order("created_at", { ascending: true })
          .limit(200);

        // If contains fails, fallback to simpler query
        if (error) {
          console.log("Primary appointments query failed, trying fallback:", error.message);
          const fallbackResult = await supabase
            .from("campaign_contact_attempts")
            .select("id, contact_id, campaign_id, phone_number, created_at, appointment_data, user_id")
            .eq("user_id", user.id)
            .not("appointment_data", "is", null)
            .order("created_at", { ascending: true })
            .limit(200);

          if (!fallbackResult.error) {
            // Filter for booked appointments in JavaScript
            attempts = fallbackResult.data?.filter(a => a.appointment_data?.booked === true) || [];
            error = null;
            console.log(`Fallback query succeeded, found ${attempts?.length || 0} appointments`);
          } else {
            error = fallbackResult.error;
          }
        }

        if (error) throw error;

        console.log("Primary query successful, found:", attempts?.length, "appointments");
        const attemptsData = (attempts || []) as AppointmentAttempt[];
        setRows(attemptsData);

        const contactIds = Array.from(new Set(attemptsData.map(a => a.contact_id).filter(Boolean))) as string[];
        const campaignIds = Array.from(new Set(attemptsData.map(a => a.campaign_id).filter(Boolean))) as string[];

        if (contactIds.length) {
          const { data: contacts, error: cErr } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, email")
            .in("id", contactIds);
          if (cErr) throw cErr;
          const map: Record<string, ContactInfo> = {};
          (contacts || []).forEach((c) => { map[c.id] = c as ContactInfo; });
          setContactsById(map);
        } else {
          setContactsById({});
        }

        if (campaignIds.length) {
          const { data: campaigns, error: camErr } = await supabase
            .from("campaigns")
            .select("id, name")
            .in("id", campaignIds);
          if (camErr) throw camErr;
          const cmap: Record<string, CampaignInfo> = {};
          (campaigns || []).forEach((c) => { cmap[c.id] = c as CampaignInfo; });
          setCampaignsById(cmap);
        } else {
          setCampaignsById({});
        }
      } catch (e) {
        const error = e as Error;
        console.error("Error loading appointments:", error);
        toast({
          title: "Failed to load appointments",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      } finally {
        console.log("Setting loading to false");
        setLoading(false);
      }
    };

    console.log("Calling fetchData...");
    fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => {
      const contact = r.contact_id ? contactsById[r.contact_id] : undefined;
      const name = contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() : "";
      return (
        name.toLowerCase().includes(q) ||
        (r.appointment_data?.time_text || "").toLowerCase().includes(q) ||
        (campaignsById[r.campaign_id || ""]?.name || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, contactsById, campaignsById]);

  const handleOpenDetails = async (attempt: AppointmentAttempt) => {
    try {
      const { data, error } = await supabase
        .from("campaign_contact_attempts")
        .select("id, contact_id, phone_number, call_status, call_duration, recording_url, call_summary, custom_analysis, appointment_data, follow_up_potential, follow_up_reason")
        .eq("id", attempt.id)
        .maybeSingle() as { data: CallDetails | null; error: Error | null };

      if (error) throw error;
      if (!data) throw new Error("Call details not found");

      const contact = attempt.contact_id ? contactsById[attempt.contact_id] : undefined;
      const summary =
        typeof data.call_summary === "object"
          ? ((data.call_summary as Record<string, unknown>)?.call_summary as string ?? JSON.stringify(data.call_summary))
          : data.call_summary as string;

      setSelectedCallData({
        contact_first_name: contact?.first_name ?? "",
        contact_last_name: contact?.last_name ?? "",
        phone_number: data.phone_number,
        recording_url: data.recording_url ?? undefined,
        call_summary: summary ?? undefined,
        call_duration: data.call_duration ?? undefined,
        call_status: data.call_status ?? undefined,
        follow_up_potential: data.follow_up_potential ?? undefined,
        follow_up_reason: data.follow_up_reason ?? undefined,
        appointment_data: data.appointment_data ?? undefined,
        custom_analysis: data.custom_analysis ?? undefined,
      });
      setDetailsOpen(true);
    } catch (e) {
      const error = e as Error;
      console.error("Failed loading call details:", error);
      toast({
        title: "Unable to open call details",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Upcoming Appointments</h1>
          <p className="text-muted-foreground mt-1">Loading appointments…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Upcoming Appointments</h1>
        <p className="text-muted-foreground mt-1">All booked appointments detected from calls</p>
      </header>

      <div className="flex gap-3 items-center">
        <Input
          placeholder="Search by lead, time, or campaign…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
          aria-label="Search appointments by lead, time, or campaign"
        />
        <Button variant="outline" onClick={() => setQuery("")}>Clear</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No appointments found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r) => {
                  const contact = r.contact_id ? contactsById[r.contact_id] : undefined;
                  const leadName = contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Unknown" : "Unknown";
                  const campaignName = r.campaign_id 
                    ? (campaignsById[r.campaign_id]?.name || "Deleted Campaign") 
                    : "Deleted Campaign";
                  return (
                    <TableRow key={r.id} onClick={() => handleOpenDetails(r)} className="cursor-pointer hover:bg-accent/50">
                      <TableCell className="font-medium">
                        {(() => {
                          const t = r.appointment_data?.time_text || "";
                          if (!t) return "—";
                          const parts = t.split(" at ");
                          return parts.length === 2 ? (
                            <div>
                              <div>{parts[0]}</div>
                              <div className="text-xs text-muted-foreground">{parts[1]}</div>
                            </div>
                          ) : (
                            t
                          );
                        })()}
                      </TableCell>
                      <TableCell>{leadName}</TableCell>
                      <TableCell>{campaignName}</TableCell>
                      <TableCell>{r.phone_number}</TableCell>
                      <TableCell>
                        {r.appointment_data?.booked ? (
                          <Badge>Booked</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{new Date(r.created_at).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CallDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        callData={selectedCallData}
      />
    </div>
  );
}
