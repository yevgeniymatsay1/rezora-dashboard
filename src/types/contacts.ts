export interface ContactGroup {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  total_contacts: number;
  csv_headers: string[] | null;
  created_at: string;
  updated_at: string;
  status: 'active' | 'paused' | 'completed';
}

export interface Contact {
  id: string;
  contact_group_id: string;
  data: Record<string, unknown>;
  phone_number: string;
  status: 'active' | 'invalid' | 'do_not_call';
  created_at: string;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_group_id: string;
  selected_fields: string[];
  field_mappings: Record<string, string>;
  created_at: string;
}

export interface ImportStep1Data {
  file: File | null;
  fileName: string;
  fileSize: number;
}

export interface ImportStep2Data {
  groupName: string;
  description: string;
  csvData: unknown[];
  selectedColumns: string[];
  columnMapping: Record<string, boolean>;
}

export interface ImportStep3Data {
  progress: number;
  totalContacts: number;
  processedContacts: number;
  invalidContacts: number;
  isComplete: boolean;
  error?: string;
}