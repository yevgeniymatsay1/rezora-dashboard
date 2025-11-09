import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import {
  CreditCard,
  CircleNotch,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";

interface AutoReloadSettings {
  enabled: boolean;
  threshold_cents: number;
  reload_amount_cents: number;
  has_payment_method: boolean;
  stripe_payment_method_id: string | null;
}

interface ReloadHistoryItem {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  error_message?: string;
}

export function AutoReloadSettings() {
  const [settings, setSettings] = useState<AutoReloadSettings>({
    enabled: false,
    threshold_cents: 1000,
    reload_amount_cents: 5000,
    has_payment_method: false,
    stripe_payment_method_id: null,
  });

  const [thresholdDollars, setThresholdDollars] = useState("10.00");
  const [reloadDollars, setReloadDollars] = useState("50.00");
  const [reloadHistory, setReloadHistory] = useState<ReloadHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const { toast } = useToast();

  // Fetch settings and history on mount
  useEffect(() => {
    fetchSettings();
    fetchHistory();

    // Check if returning from Stripe payment method setup
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("payment_method_added") === "true") {
      toast({
        title: "Payment Method Added",
        description: "Your payment method has been successfully added for auto-reload.",
      });

      // Clean up URL
      window.history.replaceState({}, "", "/settings");

      // Refresh settings to show new payment method
      setTimeout(() => {
        fetchSettings();
      }, 1000);
    }
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_credit_reload_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found, which is okay
        throw error;
      }

      if (data) {
        setSettings({
          enabled: data.enabled,
          threshold_cents: data.threshold_cents,
          reload_amount_cents: data.reload_amount_cents,
          has_payment_method: !!data.stripe_payment_method_id,
          stripe_payment_method_id: data.stripe_payment_method_id,
        });
        setThresholdDollars((data.threshold_cents / 100).toFixed(2));
        setReloadDollars((data.reload_amount_cents / 100).toFixed(2));
      }
    } catch (error) {
      console.error("Error fetching auto-reload settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setFetchingHistory(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("auto_reload_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setReloadHistory(data || []);
    } catch (error) {
      console.error("Error fetching reload history:", error);
    } finally {
      setFetchingHistory(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("create-setup-intent");

      if (error || !data.checkout_url) {
        throw new Error(error?.message || "Failed to create payment method session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.checkout_url;
    } catch (error) {
      console.error("Error adding payment method:", error);
      toast({
        title: "Failed to Add Payment Method",
        description:
          error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const thresholdCents = Math.round(parseFloat(thresholdDollars) * 100);
      const reloadCents = Math.round(parseFloat(reloadDollars) * 100);

      // Validate
      if (thresholdCents < 500) {
        toast({
          title: "Invalid Threshold",
          description: "Threshold must be at least $5.00",
          variant: "destructive",
        });
        return;
      }

      if (reloadCents < 1000) {
        toast({
          title: "Invalid Reload Amount",
          description: "Reload amount must be at least $10.00",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.functions.invoke("setup-auto-reload", {
        body: {
          enabled: settings.enabled,
          threshold_cents: thresholdCents,
          reload_amount_cents: reloadCents,
        },
      });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Your auto-reload settings have been updated successfully.",
      });

      // Refresh settings
      await fetchSettings();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Failed to Save",
        description: "Could not save your settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircleNotch className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">Enable Auto-Reload</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically reload credits when balance drops below threshold
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) =>
            setSettings({ ...settings, enabled: checked })
          }
          disabled={!settings.has_payment_method}
        />
      </div>

      <Separator />

      {/* Threshold Input */}
      <div className="space-y-2">
        <Label htmlFor="threshold">Reload when balance drops below</Label>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-medium">$</span>
          <Input
            id="threshold"
            type="number"
            step="0.01"
            min="5"
            value={thresholdDollars}
            onChange={(e) => setThresholdDollars(e.target.value)}
            className="max-w-[150px]"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Minimum: $5.00 • When your balance drops below this amount, auto-reload will trigger
        </p>
      </div>

      {/* Reload Amount Input */}
      <div className="space-y-2">
        <Label htmlFor="reload-amount">Reload amount</Label>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-medium">$</span>
          <Input
            id="reload-amount"
            type="number"
            step="0.01"
            min="10"
            value={reloadDollars}
            onChange={(e) => setReloadDollars(e.target.value)}
            className="max-w-[150px]"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Minimum: $10.00 • This amount will be charged to your card when reloading
        </p>
      </div>

      <Separator />

      {/* Payment Method */}
      <div className="space-y-2">
        <Label>Payment Method</Label>
        {settings.has_payment_method ? (
          <div className="flex items-center justify-between p-3 border rounded-lg bg-primary/5">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Card on file</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddPaymentMethod}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Update Card
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
              <XCircle className="h-4 w-4" />
              <span>Payment method required for auto-reload to work</span>
            </div>
            <Button onClick={handleAddPaymentMethod} className="w-full">
              <CreditCard className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>
          </div>
        )}
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSaveSettings}
        disabled={saving || !settings.has_payment_method}
        className="w-full"
      >
        {saving ? (
          <>
            <CircleNotch className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Auto-Reload Settings"
        )}
      </Button>

      <Separator />

      {/* Reload History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Reload History</h3>
          {reloadHistory.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHistory}
              disabled={fetchingHistory}
            >
              {fetchingHistory ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : (
                "Refresh"
              )}
            </Button>
          )}
        </div>

        {reloadHistory.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No automatic reloads yet</p>
            <p className="text-sm mt-1">
              Auto-reload will trigger when your balance drops below the threshold
            </p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reloadHistory.map((reload) => (
                  <TableRow key={reload.id}>
                    <TableCell className="font-medium">
                      {format(new Date(reload.created_at), "MMM dd, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      ${(reload.amount_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reload.status === "succeeded"
                            ? "default"
                            : reload.status === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {reload.status}
                      </Badge>
                      {reload.error_message && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {reload.error_message}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
