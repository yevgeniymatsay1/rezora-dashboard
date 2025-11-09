import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Phone, MapPin, CurrencyDollar, Sparkle, CircleNotch, Check, Warning, XCircle } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

interface PhoneNumberPurchaseModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

const PHONE_NUMBER_COST = 500; // 500 credits = $5.00

const formatDollars = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

export function PhoneNumberPurchaseModal({ isOpen, onSuccess, onClose }: PhoneNumberPurchaseModalProps) {
  const [areaCode, setAreaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  // Double-click protection: Track if purchase is already in progress
  const purchaseInProgress = useRef(false);

  // Fetch user's credit balance and reset error state
  useEffect(() => {
    if (isOpen) {
      fetchCreditBalance();
      setErrorMessage(null);
    }
  }, [isOpen]);

  const fetchCreditBalance = async () => {
    setLoadingBalance(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_credits')
        .select('balance_cents')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setCreditBalance(data?.balance_cents || 0);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
      setCreditBalance(0);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleAreaCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 3);
    setAreaCode(value);
    setErrorMessage(null); // Clear error when user types
  };

  const handlePurchase = async () => {
    // Double-click protection: Prevent duplicate requests
    if (purchaseInProgress.current) {
      console.log('⚠️ Purchase already in progress, ignoring duplicate click');
      return;
    }

    if (!/^\d{3}$/.test(areaCode)) {
      toast({
        title: "Invalid Area Code",
        description: "Please enter a valid 3-digit area code.",
        variant: "destructive",
      });
      return;
    }

    // Check if user has sufficient credits
    if (creditBalance !== null && creditBalance < PHONE_NUMBER_COST) {
      toast({
        title: "Insufficient Balance",
        description: `You need ${formatDollars(PHONE_NUMBER_COST)}. Please add credits first.`,
        variant: "destructive",
      });
      return;
    }

    // Mark purchase as in progress
    purchaseInProgress.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('purchase-phone', {
        body: { area_code: areaCode }
      });

      // Extract response body from error if present (non-2xx responses)
      let responseData = data;
      if (error) {
        console.error('Function invocation error:', error);

        // Try multiple methods to extract error response
        try {
          // Method 1: Check error.context.body (may be ReadableStream)
          if (error.context?.body) {
            // If it's a ReadableStream, read it
            if (error.context.body instanceof ReadableStream) {
              const reader = error.context.body.getReader();
              const decoder = new TextDecoder();
              let text = '';

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
              }

              responseData = JSON.parse(text);
              console.log('Extracted from ReadableStream:', responseData);
            } else if (typeof error.context.body === 'string') {
              responseData = JSON.parse(error.context.body);
              console.log('Extracted from string body:', responseData);
            } else {
              responseData = error.context.body;
              console.log('Extracted from object body:', responseData);
            }
          }

          // Method 2: Check if error itself has the data
          if (!responseData && error.code && error.error) {
            responseData = { code: error.code, error: error.error };
            console.log('Extracted from error properties:', responseData);
          }

          // Method 3: Try parsing error.message as JSON
          if (!responseData && error.message) {
            try {
              const parsed = JSON.parse(error.message);
              if (parsed.code || parsed.error) {
                responseData = parsed;
                console.log('Extracted from error.message JSON:', responseData);
              }
            } catch {
              // Not JSON, continue
            }
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }

        // If we still don't have response data, throw generic error
        if (!responseData) {
          throw new Error(error.message || 'Failed to purchase phone number');
        }
      }

      // Handle specific error codes
      if (responseData.code === 'INSUFFICIENT_CREDITS') {
        const errorMsg = responseData.error || `You need ${formatDollars(PHONE_NUMBER_COST)} to purchase a phone number.`;
        setErrorMessage(errorMsg);
        toast({
          title: "Insufficient Balance",
          description: errorMsg,
          variant: "destructive",
        });
        // Refresh balance
        await fetchCreditBalance();
        setLoading(false);
        return;
      }

      if (responseData.code === 'AREA_CODE_UNAVAILABLE') {
        const errorMsg = responseData.error || `No phone numbers available for area code ${areaCode}. Try a different area code.`;
        setErrorMessage(errorMsg);
        toast({
          title: "Area Code Unavailable",
          description: errorMsg,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check for generic error field
      if (responseData.error && !responseData.success) {
        setErrorMessage(responseData.error);
        throw new Error(responseData.error);
      }

      if (!responseData.success) {
        const errorMsg = responseData.error || 'Failed to purchase phone number';
        setErrorMessage(errorMsg);
        throw new Error(errorMsg);
      }

      // Success!
      toast({
        title: "Phone Number Activated!",
        description: `Successfully purchased ${responseData.phone_number}. ${formatDollars(responseData.credits_remaining)} remaining.`,
      });

      // Reset form and close modal
      setAreaCode("");
      onSuccess();

    } catch (error) {
      console.error('Purchase error:', error);
      const errorMsg = error instanceof Error ? error.message : "Failed to purchase phone number. Please try again.";
      setErrorMessage(errorMsg);
      toast({
        title: "Purchase Failed",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      purchaseInProgress.current = false; // Reset for next purchase
    }
  };

  if (!isOpen) return null;

  const hasInsufficientCredits = creditBalance !== null && creditBalance < PHONE_NUMBER_COST;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity duration-200"
        onClick={() => !loading && onClose()}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-md pointer-events-auto">
          <Card className="border shadow-xl max-h-[85vh] overflow-y-auto">
          {/* Header with gradient accent */}
          <div className="relative overflow-hidden rounded-t-lg bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 pb-4">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                  <div className="relative bg-card rounded-full p-3 shadow-lg border border-primary/20">
                    <Phone className="h-8 w-8 text-primary" />
                  </div>
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-center">Purchase Phone Number</h2>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Get a dedicated number for your AI agents
              </p>
            </div>
          </div>

          <CardContent className="p-6 space-y-6">
            {/* Credit Balance Section */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CurrencyDollar className="h-5 w-5 text-primary" />
                  <span className="font-medium">Your Balance</span>
                </div>
                <div className="text-right">
                  {loadingBalance ? (
                    <CircleNotch className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <div className="text-2xl font-bold text-primary">
                      {formatDollars(creditBalance || 0)}
                    </div>
                  )}
                </div>
              </div>

              {hasInsufficientCredits && (
                <div className="mt-3 flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400">
                  <Warning className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Insufficient balance. You need {formatDollars(PHONE_NUMBER_COST)}.{" "}
                    <Link to="/billing" className="underline font-medium hover:text-orange-700 dark:hover:text-orange-300">
                      Add credits
                    </Link>
                  </span>
                </div>
              )}
            </div>

            {/* Error Message Display */}
            {errorMessage && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <div className="flex items-start gap-2">
                  <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <AlertDescription className="text-sm font-medium">
                    {errorMessage}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {/* Area Code Input Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-primary" />
                <Label htmlFor="area-code" className="text-sm font-medium">
                  Select Area Code
                </Label>
              </div>

              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
                  +1
                </div>
                <Input
                  id="area-code"
                  placeholder="415"
                  value={areaCode}
                  onChange={handleAreaCodeChange}
                  maxLength={3}
                  disabled={loading}
                  className="pl-12 h-12 text-lg font-medium text-center tracking-wider border-muted focus:border-primary/50 transition-colors"
                  autoFocus
                />
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkle className="h-3 w-3" />
                Enter a 3-digit US area code for your new phone number
              </p>
            </div>

            {/* Pricing Card */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CurrencyDollar className="h-5 w-5 text-primary" />
                    <span className="font-medium">Monthly Cost</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">{formatDollars(PHONE_NUMBER_COST)}</div>
                    <div className="text-xs text-muted-foreground">per month</div>
                  </div>
                </div>

                <div className="pt-3 border-t border-primary/10 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5" />
                    <span className="text-muted-foreground">Dedicated phone number via Telnyx</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5" />
                    <span className="text-muted-foreground">Automatic monthly billing from credits</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5" />
                    <span className="text-muted-foreground">Cancel anytime - no commitment</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePurchase}
                disabled={areaCode.length !== 3 || loading || hasInsufficientCredits}
                className="flex-1 bg-primary hover:bg-primary/90 shadow-sm"
              >
                {loading ? (
                  <>
                    <CircleNotch className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Purchase ({formatDollars(PHONE_NUMBER_COST)})
                  </>
                )}
              </Button>
            </div>

            {/* Info Note */}
            <p className="text-xs text-center text-muted-foreground pt-2 border-t">
              💡 {formatDollars(PHONE_NUMBER_COST)} is automatically deducted monthly from your balance.
            </p>
          </CardContent>
        </Card>
        </div>
      </div>
    </>,
    document.body
  );
}
