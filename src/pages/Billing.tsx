import { CreditCard, DownloadSimple as Download, Plus, CurrencyDollar as DollarSign, Clock, Phone, Trash as Trash2, CaretDown } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCredits, getUserCreditTransactions } from "@/lib/credits";
import { toast } from "sonner";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { AutoReloadSettings } from "@/components/AutoReloadSettings";

interface CreditTransaction {
  id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  created_at: string;
}

interface PhoneSubscription {
  id: string;
  phone_number: string;
  area_code: string;
  monthly_cost_cents: number;
  subscription_active: boolean;
  next_billing_date: string | null;
  created_at: string;
}

export default function Billing() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [phoneSubscriptions, setPhoneSubscriptions] = useState<PhoneSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [deletingPhoneId, setDeletingPhoneId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Double-click protection: Track if purchase is already in progress
  const purchaseInProgress = useRef(false);

  useEffect(() => {
    if (user) {
      loadBillingData();
    }
  }, [user]);

  // Check for Stripe redirect parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const sessionId = urlParams.get('session_id');

    if (success === 'true') {
      // Credit purchase success - poll for credit update
      toast.success('Processing payment...');

      let attempts = 0;
      const maxAttempts = 15; // Poll for up to 15 seconds
      const pollInterval = setInterval(async () => {
        await loadBillingData();
        attempts++;

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          toast.success('Payment successful! Your credits have been added.');
        }
      }, 1000);

      window.history.replaceState({}, '', '/billing');
    } else if (sessionId) {
      // Phone number purchase success (comes back with session_id)
      toast.success('Phone number purchased successfully! It may take a moment to appear.');
      loadBillingData(); // Refresh phone numbers
      // Retry after a delay to ensure webhook has processed
      setTimeout(() => loadBillingData(), 3000);
      window.history.replaceState({}, '', '/billing');
    } else if (canceled === 'true') {
      toast.info('Payment was cancelled.');
      window.history.replaceState({}, '', '/billing');
    }
  }, []);

  const loadBillingData = async () => {
    if (!user) return;
    
    try {
      // Load user credits
      const { data: credits } = await supabase
        .from('user_credits')
        .select('balance_cents')
        .eq('user_id', user.id)
        .single();
      
      setBalance(credits?.balance_cents || 0);

      // Load transaction history
      const transactionHistory = await getUserCreditTransactions(user.id);
      setTransactions(transactionHistory);

      // Load phone subscriptions
      const { data: phoneData, error: phoneError } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('subscription_active', true)
        .order('created_at', { ascending: false });
      
      if (phoneError) throw phoneError;
      setPhoneSubscriptions(phoneData || []);
    } catch (error) {
      console.error('Error loading billing data:', error);
      toast.error('Failed to load billing data');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchaseCredits = async () => {
    // Double-click protection: Prevent duplicate requests
    if (purchaseInProgress.current) {
      console.log('⚠️ Credit purchase already in progress, ignoring duplicate click');
      return;
    }

    if (!user || isPurchasing || !creditAmount) return;

    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount < 1 || amount > 500) {
      toast.error('Please enter a valid amount between $1 and $500');
      return;
    }

    // Mark purchase as in progress
    purchaseInProgress.current = true;
    setIsPurchasing(true);

    try {
      const { data, error } = await supabase.functions.invoke('purchase-credits', {
        body: { amount_dollars: amount }
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
        setCreditAmount(""); // Clear the input after successful redirect
      }
    } catch (error) {
      console.error('Error purchasing credits:', error);
      toast.error('Failed to initiate credit purchase');
    } finally {
      setIsPurchasing(false);
      purchaseInProgress.current = false; // Reset for next purchase
    }
  };

  const handleCancelPhoneSubscription = async (phoneId: string) => {
    const confirmed = await confirm(
      'Cancel Phone Subscription',
      'Are you sure you want to cancel this phone number subscription? This will delete the phone number and cannot be undone.',
      'destructive'
    );
    
    if (!confirmed) {
      return;
    }

    setDeletingPhoneId(phoneId);

    try {
      const { data, error } = await supabase.functions.invoke('delete-phone-number', {
        body: { phone_number_id: phoneId }
      });

      // Extract error message from response
      let errorMessage = 'Failed to cancel phone subscription';
      if (error) {
        console.error('Error cancelling phone subscription:', error);

        // Try to extract JSON body from error context
        try {
          if (error.context?.body) {
            const responseData = typeof error.context.body === 'string'
              ? JSON.parse(error.context.body)
              : error.context.body;

            if (responseData.error) {
              errorMessage = responseData.error;
            }
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }

        toast(errorMessage);
        return;
      }

      toast(data?.message || 'Phone subscription cancelled successfully');
      await loadBillingData();
    } catch (error) {
      console.error('Error cancelling phone subscription:', error);
      toast('Failed to cancel phone subscription');
    } finally {
      setDeletingPhoneId(null);
    }
  };

  const formatPhoneNumber = (phoneNumber: string) => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const areaCode = cleaned.slice(1, 4);
      const exchange = cleaned.slice(4, 7);
      const number = cleaned.slice(7);
      return `(${areaCode}) ${exchange}-${number}`;
    }
    return phoneNumber;
  };

  const totalMonthlySubscriptions = phoneSubscriptions.reduce((total, phone) => 
    total + phone.monthly_cost_cents, 0
  );
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading billing data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing & Credits</h1>
          <p className="text-muted-foreground mt-1">
            Manage your credits and view usage details
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="primary-button">
              <Plus className="h-4 w-4 mr-2" />
              Add Credits
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Credits</DialogTitle>
              <DialogDescription>
                Enter the dollar amount you want to add to your account. $1 = $1 in credits.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="credit-amount">Amount ($)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="credit-amount"
                    type="number"
                    placeholder="0.00"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    className="pl-9"
                    min="1"
                    max="500"
                    step="0.01"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Minimum: $1.00 • Maximum: $500.00
                </p>
              </div>
              <Button 
                onClick={handlePurchaseCredits}
                disabled={isPurchasing || !creditAmount || parseFloat(creditAmount) < 1 || parseFloat(creditAmount) > 500}
                className="w-full primary-button"
              >
                {isPurchasing ? "Processing..." : `Add ${creditAmount ? `$${parseFloat(creditAmount).toFixed(2)}` : "Credits"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCredits(balance)}</div>
            <p className="text-xs text-muted-foreground">Available credits</p>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Call Rate</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.20</div>
            <p className="text-xs text-muted-foreground">per conversation minute</p>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Subscriptions</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCredits(totalMonthlySubscriptions)}</div>
            <p className="text-xs text-muted-foreground">
              {phoneSubscriptions.length} phone number{phoneSubscriptions.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Plan</CardTitle>
            <Badge>Credit-Based</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Pay as you go</div>
            <p className="text-xs text-muted-foreground">Plus phone subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* Phone Number Subscriptions */}
      {phoneSubscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Phone Number Subscriptions</CardTitle>
            <CardDescription>
              Monthly subscriptions for your phone numbers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Area Code</TableHead>
                  <TableHead>Monthly Cost</TableHead>
                  <TableHead>Next Billing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneSubscriptions.map((phone) => (
                  <TableRow key={phone.id}>
                    <TableCell className="font-medium">
                      {formatPhoneNumber(phone.phone_number)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{phone.area_code}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatCredits(phone.monthly_cost_cents)}/month
                    </TableCell>
                    <TableCell>
                      {phone.next_billing_date 
                        ? new Date(phone.next_billing_date).toLocaleDateString()
                        : 'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={phone.subscription_active ? 'default' : 'secondary'}>
                        {phone.subscription_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelPhoneSubscription(phone.id)}
                        disabled={deletingPhoneId === phone.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {deletingPhoneId === phone.id ? (
                          <span className="text-xs">Cancelling...</span>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Cancel
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Auto-Reload Credits */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Reload Credits</CardTitle>
          <CardDescription>
            Never run out of credits - automatic top-ups when balance is low
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AutoReloadSettings />
        </CardContent>
      </Card>

      {/* Credit History - Collapsible */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="flex flex-row items-center justify-between hover:bg-accent/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-2">
                <CardTitle>Credit History</CardTitle>
                <CaretDown
                  className={`h-5 w-5 transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <CardDescription>
                  {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </CardDescription>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadBillingData();
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No transactions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          {new Date(transaction.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={transaction.type === 'purchase' ? 'default' : 'secondary'}>
                            {transaction.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell className={transaction.type === 'purchase' ? 'text-success' : 'text-destructive'}>
                          {transaction.type === 'purchase' ? '+' : '-'}{formatCredits(Math.abs(transaction.amount_cents))}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCredits(transaction.balance_after_cents)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      
      <ConfirmDialog />
    </div>
  );
}