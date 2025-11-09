import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Standard contact variables for validation and mapping
const STANDARD_VARIABLES = [
  { key: 'first_name', label: 'First Name', category: 'Contact Information' },
  { key: 'last_name', label: 'Last Name', category: 'Contact Information' },
  { key: 'phone_number', label: 'Phone Number', category: 'Contact Information', required: true },
  { key: 'email', label: 'Email', category: 'Contact Information' },
  { key: 'company', label: 'Company', category: 'Contact Information' },
  { key: 'property_address', label: 'Property Address', category: 'Property Details' },
  { key: 'city', label: 'City', category: 'Property Details' },
  { key: 'state', label: 'State', category: 'Property Details' },
  { key: 'zip_code', label: 'Zip Code', category: 'Property Details' },
  { key: 'listing_price', label: 'Listing Price', category: 'Property Details' },
  { key: 'property_type', label: 'Property Type', category: 'Property Details' },
  { key: 'bedrooms', label: 'Bedrooms', category: 'Property Details' },
  { key: 'bathrooms', label: 'Bathrooms', category: 'Property Details' },
  { key: 'square_feet', label: 'Square Feet', category: 'Property Details' },
  { key: 'lead_source', label: 'Lead Source', category: 'Lead Information' },
  { key: 'lead_type', label: 'Lead Type', category: 'Lead Information' },
  { key: 'interest_level', label: 'Interest Level', category: 'Lead Information' },
  { key: 'last_contact_date', label: 'Last Contact Date', category: 'Lead Information' },
  { key: 'previous_agent', label: 'Previous Agent', category: 'Lead Information' },
  { key: 'custom_1', label: 'Custom Field 1', category: 'Custom Fields' },
  { key: 'custom_2', label: 'Custom Field 2', category: 'Custom Fields' },
  { key: 'custom_3', label: 'Custom Field 3', category: 'Custom Fields' },
  { key: 'custom_4', label: 'Custom Field 4', category: 'Custom Fields' },
  { key: 'custom_5', label: 'Custom Field 5', category: 'Custom Fields' }
];

function findVariableMatch(csvHeader: string): string | null {
  const normalized = csvHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact matches
  const exactMatch = STANDARD_VARIABLES.find(v => 
    v.key.replace(/_/g, '') === normalized
  );
  if (exactMatch) return exactMatch.key;
  
  // Common variations
  const variations: Record<string, string> = {
    'fname': 'first_name',
    'lname': 'last_name',
    'firstname': 'first_name',
    'lastname': 'last_name',
    'phone': 'phone_number',
    'mobile': 'phone_number',
    'cell': 'phone_number',
    'address': 'property_address',
    'propertyaddr': 'property_address',
    'listprice': 'listing_price',
    'price': 'listing_price'
  };
  
  if (variations[normalized]) return variations[normalized];
  
  // Contains match
  for (const variable of STANDARD_VARIABLES) {
    if (normalized.includes(variable.key.replace(/_/g, ''))) {
      return variable.key;
    }
  }
  
  return null;
}

interface ImportContactsRequest {
  groupName: string;
  description?: string;
  csvData: Array<Record<string, any>>;
  selectedHeaders: string[];
}

interface ImportContactsResponse {
  success: boolean;
  groupId: string;
  totalImported: number;
  invalidCount: number;
  skippedRows: number[];
}

function normalizePhone(phone: string | number): string | null {
  if (!phone) return null;
  
  // Convert to string if it's a number
  const phoneStr = typeof phone === 'number' ? phone.toString() : phone;
  
  // Remove all non-digit characters
  const cleaned = phoneStr.replace(/\D/g, '');
  
  console.log(`Normalizing phone: ${phone} -> cleaned: ${cleaned}`);
  
  // Validate length (10-15 digits for international)
  if (cleaned.length < 10 || cleaned.length > 15) {
    console.log(`Invalid phone length (${cleaned.length}): ${cleaned}`);
    return null;
  }
  
  // US/Canada numbers (10 digits)
  if (cleaned.length === 10) {
    const normalized = `+1${cleaned}`;
    console.log(`10-digit number normalized to: ${normalized}`);
    return normalized;
  }
  
  // US/Canada with country code (11 digits starting with 1)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const normalized = `+${cleaned}`;
    console.log(`11-digit number normalized to: ${normalized}`);
    return normalized;
  }
  
  // International numbers - add + prefix
  if (cleaned.length > 11) {
    const normalized = `+${cleaned}`;
    console.log(`International number normalized to: ${normalized}`);
    return normalized;
  }
  
  console.log(`Could not normalize phone: ${cleaned}`);
  return null;
}

// Function to extract all phone numbers from a row of data
function extractPhoneNumbers(data: Record<string, any>): string[] {
  const phoneNumbers: string[] = [];
  
  // Common phone field patterns
  const phonePatterns = [
    /^phone$/i,
    /^phone[_\s]*number$/i,
    /^phone[_\s]*\d+$/i,
    /^mobile$/i,
    /^cell$/i,
    /^cellular$/i,
    /^home[_\s]*phone$/i,
    /^work[_\s]*phone$/i,
    /^business[_\s]*phone$/i,
    /^office[_\s]*phone$/i,
    /^primary[_\s]*phone$/i,
    /^secondary[_\s]*phone$/i,
    /^tel$/i,
    /^telephone$/i,
    /^contact[_\s]*number$/i,
    /^phone[_\s]*[12345]$/i
  ];
  
  console.log('Extracting all phones from data:', Object.keys(data));
  
  // Check each field in the data
  for (const [key, value] of Object.entries(data)) {
    // Skip empty values
    if (!value || value === '') continue;
    
    // Check if this field matches any phone pattern
    const isPhoneField = phonePatterns.some(pattern => pattern.test(key));
    
    if (isPhoneField) {
      console.log(`Found potential phone field '${key}':`, value);
      const normalized = normalizePhone(value);
      if (normalized && !phoneNumbers.includes(normalized)) {
        console.log(`Added phone number: ${normalized}`);
        phoneNumbers.push(normalized);
      }
    }
  }
  
  console.log(`Extracted ${phoneNumbers.length} phone numbers:`, phoneNumbers);
  return phoneNumbers;
}

// Email validation
function validateEmail(email: any): string | null {
  if (!email) return null;
  
  const emailStr = String(email).trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(emailStr) ? emailStr : null;
}

// Sanitize string input
function sanitizeString(input: any): string | null {
  if (!input) return null;
  
  const str = String(input)
    .replace(/<script.*?>.*?<\/script>/gi, '') // Remove scripts
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .trim()
    .substring(0, 500); // Limit length
    
  return str.length > 0 ? str : null;
}

// Function to extract primary phone number (for backward compatibility)
function extractPrimaryPhone(data: Record<string, any>): string | null {
  // Priority order for primary phone
  const primaryFields = ['phone', 'phone_number', 'mobile', 'cell', 'home_phone', 'work_phone'];
  
  console.log('Extracting primary phone from data:', Object.keys(data));
  
  for (const field of primaryFields) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      console.log(`Found primary phone in field '${field}':`, data[field]);
      const normalized = normalizePhone(data[field]);
      if (normalized) {
        console.log(`Successfully normalized primary phone: ${normalized}`);
        return normalized;
      }
    }
  }
  
  // If no primary field found, get first available phone
  const allPhones = extractPhoneNumbers(data);
  const primaryPhone = allPhones.length > 0 ? allPhones[0] : null;
  console.log('Primary phone from all phones:', primaryPhone);
  return primaryPhone;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }), 
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ImportContactsRequest = await req.json();
    
    // Validate required fields
    if (!body.groupName || !body.csvData || !Array.isArray(body.csvData) || body.csvData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: groupName and csvData are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create contact group
    const { data: contactGroup, error: groupError } = await supabase
      .from('contact_groups')
      .insert({
        user_id: user.id,
        name: body.groupName,
        description: body.description || null,
        csv_headers: body.selectedHeaders, // Store only selected headers
        total_contacts: 0
      })
      .select()
      .single();

    if (groupError || !contactGroup) {
      console.error('Failed to create contact group:', groupError);
      return new Response(
        JSON.stringify({ error: 'Failed to create contact group' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process contacts in batches
    const batchSize = 100;
    const skippedRows: number[] = [];
    let totalImported = 0;
    let invalidCount = 0;

    for (let i = 0; i < body.csvData.length; i += batchSize) {
      const batch = body.csvData.slice(i, i + batchSize);
      const contactsToInsert = [];

      for (let j = 0; j < batch.length; j++) {
        const rowIndex = i + j;
        const row = batch[j];

        try {
          // Extract all phone numbers and primary phone
          const allPhoneNumbers = extractPhoneNumbers(row);
          const primaryPhone = extractPrimaryPhone(row);
          
          if (!primaryPhone || allPhoneNumbers.length === 0) {
            skippedRows.push(rowIndex);
            invalidCount++;
            continue;
          }

          // Extract and map selected data to standard variables
          const mappedData: Record<string, any> = {};
          const rawData: Record<string, any> = {};
          
          body.selectedHeaders.forEach(header => {
            if (row[header] !== undefined) {
              rawData[header] = row[header];
              
              // Try to map to standard variable
              const standardVariable = findVariableMatch(header);
              if (standardVariable) {
                let value = row[header];
                // Convert phone numbers to strings to avoid scientific notation
                if (standardVariable.includes('phone') || header.toLowerCase().includes('phone')) {
                  value = typeof value === 'number' ? value.toString() : String(value);
                }
                mappedData[standardVariable] = value;
              } else {
                // Keep unmapped fields as-is, but convert phone fields to strings
                let value = row[header];
                if (header.toLowerCase().includes('phone')) {
                  value = typeof value === 'number' ? value.toString() : String(value);
                }
                mappedData[header] = value;
              }
            }
          });

          // Extract and validate standard database fields
          const firstName = sanitizeString(mappedData.first_name) || null;
          const lastName = sanitizeString(mappedData.last_name) || null;
          const email = validateEmail(mappedData.email) || null;
          const address = sanitizeString(mappedData.address || mappedData.property_address) || null;

          // Remove standard fields from mappedData to avoid duplication
          const { first_name, last_name, email: emailField, address: addressField, property_address, ...additionalData } = mappedData;

          console.log(`Processing contact: ${firstName} ${lastName}, email: ${email}, primary phone: ${primaryPhone}, all phones: ${allPhoneNumbers.join(', ')}`);

          // Prepare contact for insertion with proper field mapping
          contactsToInsert.push({
            contact_group_id: contactGroup.id,
            phone_number: primaryPhone, // Primary phone for backward compatibility
            phone_numbers: allPhoneNumbers, // Array of all phone numbers
            first_name: firstName,
            last_name: lastName,
            email: email,
            address: address,
            data: additionalData, // Non-standard fields go in JSONB
            custom_fields: rawData, // Store original CSV data for reference
            status: 'active'
          });

        } catch (error) {
          console.error(`Error processing row ${rowIndex}:`, error);
          skippedRows.push(rowIndex);
          invalidCount++;
        }
      }

      // Insert batch of contacts
      if (contactsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('contacts')
          .insert(contactsToInsert);

        if (insertError) {
          console.error('Failed to insert contacts batch:', insertError);
          // Mark these rows as skipped
          for (let k = 0; k < contactsToInsert.length; k++) {
            skippedRows.push(i + k);
          }
          invalidCount += contactsToInsert.length;
        } else {
          totalImported += contactsToInsert.length;
        }
      }
    }

    // Update contact group total
    await supabase
      .from('contact_groups')
      .update({ total_contacts: totalImported })
      .eq('id', contactGroup.id);

    const response: ImportContactsResponse = {
      success: true,
      groupId: contactGroup.id,
      totalImported,
      invalidCount,
      skippedRows
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import contacts error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});