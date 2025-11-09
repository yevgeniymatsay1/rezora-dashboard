
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Phone, CaretDown, Plus, Trash, CurrencyDollar } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { PhoneNumberPurchaseModal } from './PhoneNumberPurchaseModal';

interface PhoneNumber {
  id: string;
  phone_number: string;
  area_code: string;
  status: string;
  retell_phone_id: string | null;
  monthly_cost_cents: number;
  subscription_active: boolean;
  next_billing_date?: string;
}

interface PhoneNumberSelectorProps {
  selectedPhoneNumberId?: string | null;
  onPhoneNumberSelect: (phoneNumberId: string) => void;
  className?: string;
}

export function PhoneNumberSelector({ 
  selectedPhoneNumberId, 
  onPhoneNumberSelect,
  className = ""
}: PhoneNumberSelectorProps) {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [deletingPhoneId, setDeletingPhoneId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPhoneNumbers();
  }, []);

  const loadPhoneNumbers = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhoneNumbers(data || []);

      // Auto-select first phone number if none selected
      if (data && data.length > 0 && !selectedPhoneNumberId && onPhoneNumberSelect) {
        onPhoneNumberSelect(data[0].id);
      }
    } catch (error) {
      console.error('Error loading phone numbers:', error);
      toast({
        title: "Failed to Load Phone Numbers",
        description: "Could not load your phone numbers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Format phone number for display
  const formatPhoneNumber = (phoneNumber: string) => {
    // Format +1XXXXXXXXXX to (+XXX) XXX-XXXX
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const areaCode = cleaned.slice(1, 4);
      const exchange = cleaned.slice(4, 7);
      const number = cleaned.slice(7);
      return `(${areaCode}) ${exchange}-${number}`;
    }
    return phoneNumber;
  };

  const selectedPhone = phoneNumbers.find(p => p.id === selectedPhoneNumberId);

  const handleDeletePhoneNumber = async (phoneNumberId: string) => {
    if (!confirm('Are you sure you want to delete this phone number? This will cancel your $5/month subscription and cannot be undone.')) {
      return;
    }

    setDeletingPhoneId(phoneNumberId);

    try {
      const { data, error } = await supabase.functions.invoke('delete-phone-number', {
        body: { phone_number_id: phoneNumberId }
      });

      // Extract error message from response
      let errorMessage = 'Failed to delete phone number';
      if (error) {
        console.error('Error deleting phone number:', error);

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

        sonnerToast.error(errorMessage);
        return;
      }

      sonnerToast.success(data?.message || 'Phone number deleted and subscription cancelled');
      
      // Reload phone numbers
      await loadPhoneNumbers();
      
      // If deleted phone was selected, clear selection
      if (selectedPhoneNumberId === phoneNumberId) {
        onPhoneNumberSelect('');
      }
    } catch (error) {
      console.error('Error deleting phone number:', error);
      sonnerToast.error('Failed to delete phone number');
    } finally {
      setDeletingPhoneId(null);
    }
  };

  const handlePurchaseSuccess = () => {
    setPurchaseModalOpen(false);
    // Immediately try to load phone numbers
    loadPhoneNumbers();
    // Retry after a delay to ensure webhook has processed
    setTimeout(() => {
      loadPhoneNumbers();
    }, 3000);
    // One more retry after 6 seconds
    setTimeout(() => {
      loadPhoneNumbers();
    }, 6000);
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Phone className="h-4 w-4 animate-pulse" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (phoneNumbers.length === 0) {
    return (
      <div className={className}>
        <Button
          variant="outline"
          onClick={() => setPurchaseModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Purchase Phone Number
        </Button>
        <PhoneNumberPurchaseModal
          isOpen={purchaseModalOpen}
          onSuccess={handlePurchaseSuccess}
          onClose={() => setPurchaseModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Card className="border-muted">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            
            <div className="flex items-center gap-2">
              <Select
                value={selectedPhoneNumberId || ""}
                onValueChange={onPhoneNumberSelect}
              >
                <SelectTrigger 
                  className="w-auto border-none shadow-none h-auto p-0 focus:ring-0"
                  aria-label="Select phone number for agent"
                >
                  <div className="flex items-center gap-2">
                    {selectedPhone ? (
                      <span className="font-medium text-sm">
                        {formatPhoneNumber(selectedPhone.phone_number)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Select phone number</span>
                    )}
                  </div>
                </SelectTrigger>
                
                <SelectContent>
                  {phoneNumbers.map((phone) => (
                    <SelectItem key={phone.id} value={phone.id}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span>{formatPhoneNumber(phone.phone_number)}</span>
                          <Badge variant="secondary" className="text-xs">
                            {phone.area_code}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CurrencyDollar className="h-3 w-3" />
                          ${(phone.monthly_cost_cents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              {selectedPhone && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeletePhoneNumber(selectedPhone.id)}
                  disabled={deletingPhoneId === selectedPhone.id}
                  className="h-auto p-1 text-destructive hover:text-destructive"
                >
                  {deletingPhoneId === selectedPhone.id ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <Trash className="h-3 w-3" />
                  )}
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPurchaseModalOpen(true)}
                className="h-auto p-1"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PhoneNumberPurchaseModal
        isOpen={purchaseModalOpen}
        onSuccess={handlePurchaseSuccess}
        onClose={() => setPurchaseModalOpen(false)}
      />
    </div>
  );
}
