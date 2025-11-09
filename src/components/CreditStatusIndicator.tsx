// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { WarningCircle, Warning, CreditCard, TrendDown } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCredits } from '@/lib/credits';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface CreditStatus {
  balance_cents: number;
  balance_formatted: string;
  warning_threshold: number;
  critical_threshold: number;
  recent_usage_cents: number;
  estimated_runtime_hours: number | null;
  status: 'normal' | 'warning' | 'critical' | 'depleted';
}

interface CreditStatusIndicatorProps {
  variant?: 'compact' | 'full' | 'alert';
  className?: string;
  onCreditDepleted?: () => void;
}

export function CreditStatusIndicator({ 
  variant = 'compact', 
  className,
  onCreditDepleted 
}: CreditStatusIndicatorProps) {
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const fetchCreditStatus = async () => {
      try {
        const { data, error } = await supabase
          .rpc('get_credit_status', { p_user_id: user.id });

        if (error) throw error;

        setCreditStatus(data);
        
        // Notify parent if credits are depleted
        if (data?.status === 'depleted' && onCreditDepleted) {
          onCreditDepleted();
        }
      } catch (error) {
        console.error('Error fetching credit status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCreditStatus();

    // Set up real-time subscription for credit changes
    const subscription = supabase
      .channel('credit-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'credit_transactions',
        filter: `user_id=eq.${user.id}`
      }, () => {
        fetchCreditStatus();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, onCreditDepleted]);

  if (loading || !creditStatus) {
    return null;
  }

  const getStatusColor = () => {
    switch (creditStatus.status) {
      case 'depleted':
        return 'text-destructive';
      case 'critical':
        return 'text-orange-600';
      case 'warning':
        return 'text-yellow-600';
      default:
        return 'text-green-600';
    }
  };

  const getStatusIcon = () => {
    switch (creditStatus.status) {
      case 'depleted':
      case 'critical':
        return <WarningCircle className="h-4 w-4" />;
      case 'warning':
        return <Warning className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  const getProgressPercentage = () => {
    if (creditStatus.balance_cents <= 0) return 0;
    if (creditStatus.balance_cents >= creditStatus.warning_threshold) return 100;
    return (creditStatus.balance_cents / creditStatus.warning_threshold) * 100;
  };

  // Compact variant - for navbar/header
  if (variant === 'compact') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge 
          variant={creditStatus.status === 'normal' ? 'default' : 'destructive'}
          className={cn("cursor-pointer", getStatusColor())}
          onClick={() => navigate('/billing')}
        >
          {getStatusIcon()}
          <span className="ml-1">{creditStatus.balance_formatted}</span>
        </Badge>
        {creditStatus.status !== 'normal' && creditStatus.status !== 'warning' && (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => navigate('/billing')}
          >
            Add Credits
          </Button>
        )}
      </div>
    );
  }

  // Alert variant - for showing warnings
  if (variant === 'alert' && creditStatus.status !== 'normal') {
    return (
      <Alert className={cn(
        "mb-4",
        creditStatus.status === 'depleted' && "border-destructive",
        creditStatus.status === 'critical' && "border-orange-500",
        creditStatus.status === 'warning' && "border-yellow-500",
        className
      )}>
        {getStatusIcon()}
        <AlertTitle>
          {creditStatus.status === 'depleted' && 'Credits Depleted'}
          {creditStatus.status === 'critical' && 'Critical: Low Credits'}
          {creditStatus.status === 'warning' && 'Warning: Credits Running Low'}
        </AlertTitle>
        <AlertDescription className="mt-2">
          <div className="space-y-2">
            <p>
              {creditStatus.status === 'depleted' 
                ? 'Your campaigns will be paused. Please add credits to continue.'
                : `You have ${creditStatus.balance_formatted} remaining.`}
            </p>
            {creditStatus.estimated_runtime_hours && creditStatus.status !== 'depleted' && (
              <p className="text-sm text-muted-foreground">
                Estimated runtime: {creditStatus.estimated_runtime_hours.toFixed(1)} hours
              </p>
            )}
            <Button 
              size="sm"
              onClick={() => navigate('/billing')}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Add Credits Now
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Full variant - for dashboard/billing page
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <h3 className="text-lg font-semibold">Credit Balance</h3>
            </div>
            <span className={cn("text-2xl font-bold", getStatusColor())}>
              {creditStatus.balance_formatted}
            </span>
          </div>

          <Progress value={getProgressPercentage()} className="h-2" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Recent Usage (7 days)</p>
              <p className="font-medium">
                {formatCredits(creditStatus.recent_usage_cents)}
              </p>
            </div>
            {creditStatus.estimated_runtime_hours && (
              <div>
                <p className="text-muted-foreground">Estimated Runtime</p>
                <p className="font-medium">
                  {creditStatus.estimated_runtime_hours.toFixed(1)} hours
                </p>
              </div>
            )}
          </div>

          {creditStatus.status !== 'normal' && (
            <Alert className={cn(
              creditStatus.status === 'depleted' && "border-destructive bg-destructive/10",
              creditStatus.status === 'critical' && "border-orange-500 bg-orange-50",
              creditStatus.status === 'warning' && "border-yellow-500 bg-yellow-50"
            )}>
              <TrendDown className="h-4 w-4" />
              <AlertDescription>
                {creditStatus.status === 'depleted' 
                  ? 'Campaigns paused due to insufficient credits.'
                  : creditStatus.status === 'critical'
                  ? 'Critical: Add credits soon to avoid interruption.'
                  : 'Consider adding credits to maintain campaign operations.'}
              </AlertDescription>
            </Alert>
          )}

          <Button 
            className="w-full"
            onClick={() => navigate('/billing')}
            variant={creditStatus.status === 'normal' ? 'outline' : 'default'}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {creditStatus.status === 'normal' ? 'Manage Credits' : 'Add Credits Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}