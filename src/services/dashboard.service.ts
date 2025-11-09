// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { authService } from './auth.service';
import { baseService } from './base.service';

interface DashboardMetrics {
  creditsRemaining: number; // in cents
  creditsLowBalance: boolean;
  callsToday: number;
  callsTrend: number; // percentage change from yesterday
  appointmentsBooked: number;
  newAppointments: number; // appointments in last 24 hours
  activeCampaigns: number;
  totalContacts: number;
}

interface CampaignProgress {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'scheduled';
  contactsReached: number;
  totalContacts: number;
  percentComplete: number;
  callsLastHour: number;
  conversionRate: number;
  estimatedCompletion: string | null;
  phoneNumber?: string;
}

interface LiveActivity {
  id: string;
  type: 'calling' | 'completed' | 'booked' | 'failed';
  contactName: string;
  campaignName: string;
  duration?: string;
  outcome?: string;
  timestamp: Date;
  isLive?: boolean;
  contact_id?: string;
  recording_url?: string;
  appointment_data?: {
    booked: boolean;
    time_text?: string;
    name?: string;
    email?: string;
    execution_message?: string;
  };
}

interface PerformanceData {
  hourlyCallVolume: Array<{
    hour: string;
    calls: number;
  }>;
  agentPerformance: Array<{
    agentName: string;
    calls: number;
    appointments: number;
    conversionRate: number;
  }>;
  overallConversionRate: number;
  averageCallDuration: string;
}

export const dashboardService = {
  /**
   * Get main dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const user = await authService.requireAuth();
    
    // Get credits remaining using RPC function for consistency
    const { data: creditStatus, error: creditError } = await supabase
      .rpc('get_credit_status', { p_user_id: user.id });
    
    let creditsInCents = 0;
    let creditsLowBalance = false;
    
    if (creditError) {
      console.error('Error fetching credit status:', creditError);
      // Fallback to direct query if RPC fails
      const { data: userCredits } = await supabase
        .from('user_credits')
        .select('balance_cents')
        .eq('user_id', user.id)
        .single();
      
      creditsInCents = userCredits?.balance_cents || 0;
      creditsLowBalance = creditsInCents < 500; // $5.00 threshold
      console.log('Fallback credits from user_credits table:', creditsInCents);
    } else {
      console.log('Credit status from RPC:', creditStatus);
      // RPC returns balance_cents directly, not balance_dollars
      creditsInCents = creditStatus?.balance_cents || 0;
      creditsLowBalance = creditStatus?.status === 'warning' || creditStatus?.status === 'critical';
    }
    
    // Get calls today from campaign_contact_attempts table (only counting actual calls with retell_call_id)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Query calls directly by user_id (works even if campaign is deleted)
    const { data: todayAttempts, error: todayError } = await supabase
      .from('campaign_contact_attempts')
      .select('retell_call_id')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())
      .not('retell_call_id', 'is', null);
    
    let todayCount = 0;
    let yesterdayCount = 0;
    
    if (todayError) {
      console.error('Error fetching today\'s calls:', todayError);
      todayCount = 0;
    } else {
      todayCount = todayAttempts?.length || 0;
    }
    
    // Count yesterday's calls
    const { data: yesterdayAttempts, error: yesterdayError } = await supabase
      .from('campaign_contact_attempts')
      .select('retell_call_id')
      .eq('user_id', user.id)
      .gte('created_at', yesterday.toISOString())
      .lt('created_at', today.toISOString())
      .not('retell_call_id', 'is', null);
    
    if (yesterdayError) {
      console.error('Error fetching yesterday\'s calls:', yesterdayError);
      yesterdayCount = 0;
    } else {
      yesterdayCount = yesterdayAttempts?.length || 0;
    }
    
    const callsTrend = (yesterdayCount || 0) > 0 
      ? (((todayCount || 0) - (yesterdayCount || 0)) / (yesterdayCount || 1)) * 100 
      : 0;
    
    // Get appointments from campaign_contact_attempts table
    // Appointments are stored in the appointment_data JSONB column when Cal.com integration books them
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    // Get total appointments booked
    // First try with user_id, fallback to campaign-based query if it fails
    let totalAppointments = 0;
    let recentAppointments = 0;
    
    // Query appointments directly by user_id (works even if campaign is deleted)
    const { count: userAppointments, error: userApptError } = await supabase
      .from('campaign_contact_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('appointment_data', 'is', null)
      .contains('appointment_data', { booked: true });
    
    if (userApptError) {
      console.error('Error fetching appointments by user_id:', userApptError);
      console.log('Attempting alternative query...');
      
      // Alternative: Try without contains, just check for non-null appointment_data
      const { count: altAppointments, error: altError } = await supabase
        .from('campaign_contact_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('appointment_data', 'is', null);
      
      if (altError) {
        console.error('Alternative query also failed:', altError);
        totalAppointments = 0;
      } else {
        console.log('Alternative query succeeded, found:', altAppointments);
        totalAppointments = altAppointments || 0;
      }
    } else {
      totalAppointments = userAppointments || 0;
    }
    
    // Get new appointments in last 24 hours
    const { count: userRecentAppts, error: recentError } = await supabase
      .from('campaign_contact_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('appointment_data', 'is', null)
      .contains('appointment_data', { booked: true })
      .gte('created_at', twentyFourHoursAgo.toISOString());
    
    if (recentError) {
      console.error('Error fetching recent appointments:', recentError);
      recentAppointments = 0;
    } else {
      recentAppointments = userRecentAppts || 0;
    }
    
    const appointmentsBooked = totalAppointments || 0;
    const newAppointments = recentAppointments || 0;
    
    console.log('Dashboard appointment counts:', {
      totalAppointments: appointmentsBooked,
      newAppointments: newAppointments,
      userIdError: userApptError?.message || 'none'
    });
    
    // Get active campaigns with contact counts
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select(`
        id,
        status,
        contact_group_id
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'paused', 'scheduled']);
    
    const activeCampaigns = campaigns?.length || 0;
    
    // Get total contacts across all active campaigns from contact_groups
    let totalContacts = 0;
    if (campaigns && campaigns.length > 0) {
      const groupIds = [...new Set(campaigns.map(c => c.contact_group_id).filter(Boolean))];
      if (groupIds.length > 0) {
        const { data: contactGroups } = await supabase
          .from('contact_groups')
          .select('total_contacts')
          .in('id', groupIds);
        
        totalContacts = contactGroups?.reduce((sum, group) => sum + (group.total_contacts || 0), 0) || 0;
      }
    }
    
    return {
      creditsRemaining: creditsInCents,
      creditsLowBalance,
      callsToday: todayCount || 0,
      callsTrend,
      appointmentsBooked,
      newAppointments,
      activeCampaigns,
      totalContacts
    };
  },

  /**
   * Get active campaigns with progress
   */
  async getActiveCampaigns(): Promise<CampaignProgress[]> {
    const user = await authService.requireAuth();
    
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select(`
        id,
        name,
        status,
        concurrent_calls,
        contact_group_id,
        agent_id
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'paused', 'scheduled'])
      .order('created_at', { ascending: false });
    
    if (!campaigns) return [];
    
    const hourAgo = new Date();
    hourAgo.setHours(hourAgo.getHours() - 1);
    
    // Get additional data for each campaign
    const campaignProgress = await Promise.all(campaigns.map(async (campaign) => {
      // Get total contacts from contact_groups table
      let totalContacts = 0;
      if (campaign.contact_group_id) {
        const { data: contactGroup } = await supabase
          .from('contact_groups')
          .select('total_contacts')
          .eq('id', campaign.contact_group_id)
          .single();
        totalContacts = contactGroup?.total_contacts || 0;
      }
      
      // Get campaign contact attempts for accurate progress tracking
      const { data: attempts } = await supabase
        .from('campaign_contact_attempts')
        .select('retell_call_id, call_status, created_at')
        .eq('campaign_id', campaign.id);
      
      // Count actual calls made (those with retell_call_id)
      const actualCallsMade = attempts?.filter(a => a.retell_call_id !== null).length || 0;
      
      // Count recent calls for activity
      const recentCalls = attempts?.filter(a => 
        a.retell_call_id !== null && 
        new Date(a.created_at) > hourAgo
      ) || [];
      
      // Count appointments - currently not tracked in call_status enum
      // TODO: Implement appointment tracking
      const appointments = [];
      
      const contactsReached = actualCallsMade;
      const percentComplete = totalContacts > 0 
        ? Math.round((contactsReached / totalContacts) * 100)
        : 0;
      
      const conversionRate = contactsReached > 0
        ? Math.round((appointments.length / contactsReached) * 100)
        : 0;
      
      // Estimate completion based on current rate
      const callsPerHour = recentCalls.length;
      const remainingContacts = totalContacts - contactsReached;
      const hoursToComplete = callsPerHour > 0 
        ? Math.ceil(remainingContacts / callsPerHour)
        : null;
      
      const estimatedCompletion = hoursToComplete 
        ? `~${hoursToComplete} hours`
        : null;
      
      // Get agent phone number if available
      let phoneNumber: string | undefined;
      if (campaign.agent_id) {
        const { data: agent } = await supabase
          .from('user_agents')
          .select('phone_numbers(phone_number)')
          .eq('id', campaign.agent_id)
          .single();
        phoneNumber = agent?.phone_numbers?.[0]?.phone_number;
      }
      
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        contactsReached,
        totalContacts,
        percentComplete,
        callsLastHour: recentCalls.length,
        conversionRate,
        estimatedCompletion,
        phoneNumber
      };
    }));
    
    return campaignProgress;
  },

  /**
   * Get recent call activity (not live, just recent)
   */
  async getLiveActivity(limit: number = 5): Promise<LiveActivity[]> {
    const user = await authService.requireAuth();
    
    // Query campaign_contact_attempts for recent calls with actual call data
    const { data: recentCalls } = await supabase
      .from('campaign_contact_attempts')
      .select(`
        id,
        call_status,
        call_duration,
        created_at,
        ended_at,
        contact_id,
        campaign_id,
        retell_call_id,
        recording_url,
        appointment_data
      `)
      .eq('user_id', user.id)
      .not('retell_call_id', 'is', null) // Only actual calls
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (!recentCalls || recentCalls.length === 0) return [];
    
    return this.processCallActivities(recentCalls);
  },

  async processCallActivities(recentCalls: any[]): Promise<LiveActivity[]> {
    // Get additional data for each call
    const activities = await Promise.all(recentCalls.map(async (call) => {
      // Get contact info if available
      let contactName = 'Unknown Contact';
      if (call.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('first_name, last_name')
          .eq('id', call.contact_id)
          .single();
        
        if (contact) {
          contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown Contact';
        }
      }
      
      // Get campaign name if available
      let campaignName = 'Unknown Campaign';
      if (call.campaign_id) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('name')
          .eq('id', call.campaign_id)
          .single();
        
        if (campaign) {
          campaignName = campaign.name;
        } else {
          // Campaign was deleted but we still have the historical data
          campaignName = 'Deleted Campaign';
        }
      } else if (call.campaign_id === null) {
        // Campaign was deleted (SET NULL from foreign key)
        campaignName = 'Deleted Campaign';
      }
      
      // Determine call type based on status
      let type: LiveActivity['type'] = 'completed';
      let outcome = call.call_status;
      
      if (call.call_status === 'in-progress' && !call.ended_at) {
        type = 'calling';
        outcome = 'In Progress';
      } else if (call.call_status === 'failed') {
        type = 'failed';
        outcome = 'Call Failed';
      } else if (call.call_status === 'no-answer') {
        type = 'failed';
        outcome = 'No Answer';
      } else if (call.call_status === 'completed') {
        type = 'completed';
        outcome = 'Completed';
      }
      
      // Format duration from seconds to MM:SS
      const duration = call.call_duration 
        ? `${Math.floor(call.call_duration / 60)}:${(call.call_duration % 60).toString().padStart(2, '0')}`
        : '0:00';
      
      return {
        id: call.id,
        type,
        contactName,
        campaignName,
        duration,
        outcome,
        timestamp: new Date(call.created_at),
        isLive: false, // No live calls, just recent history
        contact_id: call.contact_id, // Include for click functionality
        recording_url: call.recording_url,
        appointment_data: call.appointment_data // Include appointment booking info
      };
    }));
    
    return activities;
  },

  /**
   * Get recent appointments with details
   */
  async getRecentAppointments(limit: number = 5): Promise<any[]> {
    const user = await authService.requireAuth();
    
    // Query appointments with LEFT JOINS so they work even if campaign is deleted
    const { data: appointments, error } = await supabase
      .from('campaign_contact_attempts')
      .select(`
        id,
        appointment_data,
        created_at,
        contact_id,
        campaign_id,
        contacts(
          first_name,
          last_name,
          email,
          phone_number
        ),
        campaigns(
          name
        )
      `)
      .eq('user_id', user.id)
      .not('appointment_data', 'is', null)
      .contains('appointment_data', { booked: true })
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching recent appointments:', error);
      return [];
    }
    
    if (!appointments || appointments.length === 0) {
      console.log('No appointments found in Recent Appointments query');
      return [];
    }
    
    console.log(`Found ${appointments.length} appointments in Recent Appointments`);
    
    // Format the appointments for display
    return appointments.map(apt => ({
      id: apt.id,
      contactName: `${apt.contacts?.first_name || ''} ${apt.contacts?.last_name || ''}`.trim() || 'Unknown Contact',
      contactEmail: apt.contacts?.email || apt.appointment_data?.email || '',
      campaignName: apt.campaigns?.name || (apt.campaign_id ? 'Deleted Campaign' : 'Unknown Campaign'),
      scheduledTime: apt.appointment_data?.time_text || 'Time not specified',
      bookedAt: new Date(apt.created_at),
      appointmentData: apt.appointment_data
    }));
  },

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(timeRange: string = 'today'): Promise<PerformanceData> {
    const user = await authService.requireAuth();
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
    }
    
    // Query campaign_contact_attempts for actual calls
    const { data: calls } = await supabase
      .from('campaign_contact_attempts')
      .select(`
        id,
        call_status,
        call_duration,
        created_at,
        campaign_id,
        retell_call_id
      `)
      .eq('user_id', user.id)
      .not('retell_call_id', 'is', null) // Only actual calls
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (!calls || calls.length === 0) {
      return {
        hourlyCallVolume: [],
        agentPerformance: [], // Will be removed from UI
        overallConversionRate: 0, // Will be removed from UI
        averageCallDuration: '0:00'
      };
    }
    
    // Calculate hourly volume for the selected time range
    const hourlyVolume: { [hour: string]: number } = {};
    
    // Only show hourly data for "today" view
    if (timeRange === 'today') {
      calls.forEach(call => {
        const hour = new Date(call.created_at).getHours();
        const hourLabel = `${hour}:00`;
        hourlyVolume[hourLabel] = (hourlyVolume[hourLabel] || 0) + 1;
      });
      
      // Fill in missing hours up to current hour
      const currentHour = new Date().getHours();
      for (let i = 0; i <= currentHour; i++) {
        const hourLabel = `${i}:00`;
        if (!hourlyVolume[hourLabel]) {
          hourlyVolume[hourLabel] = 0;
        }
      }
    }
    
    const hourlyCallVolume = Object.entries(hourlyVolume)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([hour, calls]) => ({ hour, calls }));
    
    // Calculate average call duration from call_duration field (in seconds)
    const validDurations = calls.filter(c => c.call_duration && c.call_duration > 0);
    const totalDuration = validDurations.reduce((sum, c) => sum + c.call_duration, 0);
    const avgDuration = validDurations.length > 0 ? totalDuration / validDurations.length : 0;
    const averageCallDuration = `${Math.floor(avgDuration / 60)}:${Math.round(avgDuration % 60).toString().padStart(2, '0')}`;
    
    return {
      hourlyCallVolume,
      agentPerformance: [], // Removed from logic, will be removed from UI
      overallConversionRate: 0, // Removed from logic, will be removed from UI
      averageCallDuration
    };
  }
};