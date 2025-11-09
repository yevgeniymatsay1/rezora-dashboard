import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PhoneNumber {
  id: string;
  phone_number: string;
  agent_id: string | null;
  status: string;
}

export function usePhoneNumbers() {
  const [hasPhoneNumber, setHasPhoneNumber] = useState(false);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPhoneNumber();
  }, []);

  const checkPhoneNumber = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('id, phone_number, agent_id, status')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      
      setPhoneNumbers(data || []);
      setHasPhoneNumber((data?.length || 0) > 0);
    } catch (error) {
      console.error('Error loading phone numbers:', error);
      setPhoneNumbers([]);
      setHasPhoneNumber(false);
    } finally {
      setLoading(false);
    }
  };

  return {
    hasPhoneNumber,
    selectedPhoneNumberId,
    setSelectedPhoneNumberId,
    phoneNumbers,
    loading,
    refreshPhoneNumbers: checkPhoneNumber
  };
}