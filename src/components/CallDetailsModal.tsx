import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Phone, Clock, ChatCircle as MessageSquare, Calendar, User, Envelope as Mail } from "@phosphor-icons/react";
import { format, parseISO, isValid } from "date-fns";

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  callData: {
    contact_first_name?: string;
    contact_last_name?: string;
    phone_number: string;
    recording_url?: string;
    call_summary?: any;
    call_duration?: number;
    call_status?: string;
    follow_up_potential?: string;
    follow_up_reason?: string;
    appointment_data?: any;
    custom_analysis?: any;
  } | null;
}

export function CallDetailsModal({ isOpen, onClose, callData }: CallDetailsModalProps) {
  if (!callData) return null;

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatAppointmentTime = (appointment: any): string => {
    if (!appointment) return 'Not specified';
    const raw = appointment.normalized_time_utc || appointment.time_utc || appointment.time || null;
    if (raw) {
      try {
        const d = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
        const dateObj = isValid(d) ? d : new Date(raw);
        if (isValid(dateObj)) {
          return format(dateObj, 'PPpp');
        }
      } catch (_) {}
    }
    return appointment.time_text || 'Not specified';
  };

  const getOutcomeBadge = (result: any) => {
    if (result.appointment_data?.booked) {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Appointment Booked</Badge>;
    }
    if (result.custom_analysis) {
      return <Badge className="bg-blue-600 text-white hover:bg-blue-700">Data Extracted</Badge>;
    }
    if (result.call_status === 'completed') {
      return <Badge className="bg-gray-600 text-white hover:bg-gray-700">Completed</Badge>;
    }
    return <Badge variant="secondary">Call Made</Badge>;
  };

  const getFollowUpBadge = (potential: string | null, reason: string | null) => {
    if (!potential) return <Badge variant="outline">None</Badge>;
    
    const colorMap: Record<string, string> = {
      'high': 'bg-red-600 text-white hover:bg-red-700',
      'medium': 'bg-yellow-600 text-white hover:bg-yellow-700',
      'low': 'bg-green-600 text-white hover:bg-green-700'
    };
    
    return (
      <div className="flex flex-col gap-1">
        <Badge className={colorMap[potential.toLowerCase()] || 'bg-gray-600 text-white hover:bg-gray-700'}>
          {potential.charAt(0).toUpperCase() + potential.slice(1)} Follow-up
        </Badge>
        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Details - {callData.contact_first_name} {callData.contact_last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Audio Player */}
          {callData.recording_url ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Call Recording
                </CardTitle>
              </CardHeader>
              <CardContent>
                <audio 
                  controls 
                  className="w-full"
                  preload="metadata"
                >
                  <source src={callData.recording_url} type="audio/mpeg" />
                  <source src={callData.recording_url} type="audio/wav" />
                  Your browser does not support the audio element.
                </audio>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No recording available for this call
              </CardContent>
            </Card>
          )}

          {/* Call Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Call Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Basic Call Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Contact</label>
                  <p className="text-sm">{callData.contact_first_name} {callData.contact_last_name}</p>
                  <p className="text-xs text-muted-foreground">{callData.phone_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Duration</label>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">{formatDuration(callData.call_duration)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Call Outcome */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Outcome</label>
                <div className="mt-1">
                  {getOutcomeBadge(callData)}
                </div>
              </div>

              {/* Follow-up Potential */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Follow-up Potential</label>
                <div className="mt-1">
                  {getFollowUpBadge(callData.follow_up_potential, callData.follow_up_reason)}
                </div>
              </div>

              {callData.appointment_data?.booked && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Appointment Details</label>
                  <div className="mt-2 rounded-lg border bg-muted/50 p-4">
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <dt className="text-xs text-muted-foreground">When</dt>
                          <dd className="text-sm">{formatAppointmentTime(callData.appointment_data)}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <dt className="text-xs text-muted-foreground">With</dt>
                          <dd className="text-sm">
                            {callData.appointment_data?.attendee_name || callData.appointment_data?.name || `${(callData.contact_first_name || '')} ${(callData.contact_last_name || '')}`.trim() || 'Not specified'}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 sm:col-span-2">
                        <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <dt className="text-xs text-muted-foreground">Email</dt>
                          <dd className="text-sm">
                            {callData.appointment_data?.email ? (
                              <a href={`mailto:${callData.appointment_data.email}`} className="underline underline-offset-2">
                                {callData.appointment_data.email}
                              </a>
                            ) : (
                              'Not provided'
                            )}
                          </dd>
                        </div>
                      </div>
                      {callData.appointment_data?.execution_message && (
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">Notes</dt>
                          <dd className="mt-1 text-sm leading-relaxed">
                            {callData.appointment_data.execution_message}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              )}

              {/* Custom Analysis */}
              {callData.custom_analysis && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Data Extracted</label>
                  <div className="mt-1 p-3 bg-blue-50 rounded-lg">
                    <pre className="text-xs text-blue-800 whitespace-pre-wrap">
                      {JSON.stringify(callData.custom_analysis, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Full Call Summary */}
              {callData.call_summary && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Detailed Summary</label>
                  <div className="mt-1 p-3 bg-muted rounded-lg">
                    <p className="text-sm leading-relaxed">
                      {callData.call_summary || "No summary available"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}