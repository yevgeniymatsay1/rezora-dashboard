import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dashboardService } from '@/services/dashboard.service';
import { useToast } from '@/hooks/use-toast';

// Refresh intervals
const METRICS_REFRESH_INTERVAL = 30000; // 30 seconds
const CAMPAIGNS_REFRESH_INTERVAL = 30000; // 30 seconds
const ACTIVITY_REFRESH_INTERVAL = 10000; // 10 seconds for live activity
const PERFORMANCE_REFRESH_INTERVAL = 60000; // 1 minute

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: dashboardService.getDashboardMetrics,
    refetchInterval: METRICS_REFRESH_INTERVAL,
    staleTime: METRICS_REFRESH_INTERVAL / 2,
  });
}

export function useActiveCampaigns() {
  return useQuery({
    queryKey: ['dashboard', 'campaigns'],
    queryFn: dashboardService.getActiveCampaigns,
    refetchInterval: CAMPAIGNS_REFRESH_INTERVAL,
    staleTime: CAMPAIGNS_REFRESH_INTERVAL / 2,
  });
}

export function useLiveActivity() {
  const query = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardService.getLiveActivity(5),
    refetchInterval: ACTIVITY_REFRESH_INTERVAL,
    staleTime: ACTIVITY_REFRESH_INTERVAL / 2,
  });

  // Set up real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-activity')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_records'
        },
        () => {
          // Refetch activity when call_records table changes
          query.refetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments'
        },
        () => {
          // Refetch when new appointment is created
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function usePerformanceMetrics(timeRange: string) {
  return useQuery({
    queryKey: ['dashboard', 'performance', timeRange],
    queryFn: () => dashboardService.getPerformanceMetrics(timeRange),
    refetchInterval: PERFORMANCE_REFRESH_INTERVAL,
    staleTime: PERFORMANCE_REFRESH_INTERVAL / 2,
  });
}

export function useRecentAppointments() {
  return useQuery({
    queryKey: ['dashboard', 'appointments'],
    queryFn: () => dashboardService.getRecentAppointments(5),
    refetchInterval: ACTIVITY_REFRESH_INTERVAL,
    staleTime: ACTIVITY_REFRESH_INTERVAL / 2,
  });
}

// Hook to show toast notifications for important events
export function useDashboardNotifications() {
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments'
        },
        (payload) => {
          toast({
            title: "🎉 New Appointment Booked!",
            description: "Your AI agent just booked a new appointment.",
            duration: 5000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaigns',
          filter: 'status=eq.completed'
        },
        (payload) => {
          toast({
            title: "✅ Campaign Completed",
            description: "A campaign has finished processing all contacts.",
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
}

// Combined hook for all dashboard data
export function useDashboardData(timeRange: string = 'today') {
  const metrics = useDashboardMetrics();
  const campaigns = useActiveCampaigns();
  const activity = useLiveActivity();
  const performance = usePerformanceMetrics(timeRange);
  const appointments = useRecentAppointments();

  // Set up notifications
  useDashboardNotifications();

  const isLoading = 
    metrics.isLoading || 
    campaigns.isLoading || 
    activity.isLoading || 
    performance.isLoading ||
    appointments.isLoading;

  const error = 
    metrics.error || 
    campaigns.error || 
    activity.error || 
    performance.error ||
    appointments.error;

  return {
    metrics: metrics.data,
    campaigns: campaigns.data || [],
    activity: activity.data || [],
    performance: performance.data,
    appointments: appointments.data || [],
    isLoading,
    error,
    refetch: () => {
      metrics.refetch();
      campaigns.refetch();
      activity.refetch();
      performance.refetch();
      appointments.refetch();
    }
  };
}