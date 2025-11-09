export interface StandardVariableMapping {
  variableKey: string;
  isSelected: boolean;
  csvHeader: string | null; // null means "Not available"
  autoMapped: boolean;
}

export interface CampaignFormData {
  name: string;
  description: string;
  agent_id: string;
  contact_group_id: string;
  concurrent_calls: number;
  max_retry_days: number;
  calling_hours: {
    start: string;
    end: string;
  };
  active_days: string[];
  selectedVariables: StandardVariableMapping[];
}

export interface CampaignCreationWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  userTimezone?: string;
}

export const DAYS_OF_WEEK = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

export const FIELD_NAME_SUGGESTIONS: Record<string, string> = {
  'first_name': 'firstName',
  'last_name': 'lastName',
  'phone': 'phoneNumber',
  'phone_number': 'phoneNumber',
  'address': 'propertyAddress',
  'email': 'emailAddress',
  'company': 'companyName',
  'city': 'city',
  'state': 'state',
  'zip': 'zipCode',
  'property_type': 'propertyType',
  'listing_price': 'listingPrice',
  'days_on_market': 'daysOnMarket',
};

export const getDefaultFormData = (): CampaignFormData => ({
  name: '',
  description: '',
  agent_id: '',
  contact_group_id: '',
  concurrent_calls: 5,
  max_retry_days: 3,
  calling_hours: {
    start: '09:00',
    end: '17:00',
  },
  active_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  selectedVariables: []
});