export const STANDARD_VARIABLES = [
  // Contact Information
  { key: 'first_name', label: 'First Name', category: 'Contact Information' },
  { key: 'last_name', label: 'Last Name', category: 'Contact Information' },
  { key: 'phone_number', label: 'Phone Number', category: 'Contact Information', required: true },
  { key: 'email', label: 'Email', category: 'Contact Information' },
  { key: 'company', label: 'Company', category: 'Contact Information' },
  
  // Property Details
  { key: 'property_address', label: 'Property Address', category: 'Property Details' },
  { key: 'city', label: 'City', category: 'Property Details' },
  { key: 'state', label: 'State', category: 'Property Details' },
  { key: 'zip_code', label: 'Zip Code', category: 'Property Details' },
  { key: 'listing_price', label: 'Listing Price', category: 'Property Details' },
  { key: 'property_type', label: 'Property Type', category: 'Property Details' },
  { key: 'bedrooms', label: 'Bedrooms', category: 'Property Details' },
  { key: 'bathrooms', label: 'Bathrooms', category: 'Property Details' },
  { key: 'square_feet', label: 'Square Feet', category: 'Property Details' },
  
  // Lead Information
  { key: 'lead_source', label: 'Lead Source', category: 'Lead Information' },
  { key: 'lead_type', label: 'Lead Type', category: 'Lead Information' },
  { key: 'interest_level', label: 'Interest Level', category: 'Lead Information' },
  { key: 'last_contact_date', label: 'Last Contact Date', category: 'Lead Information' },
  { key: 'previous_agent', label: 'Previous Agent', category: 'Lead Information' },
  
  // Custom Fields
  { key: 'custom_1', label: 'Custom Field 1', category: 'Custom Fields' },
  { key: 'custom_2', label: 'Custom Field 2', category: 'Custom Fields' },
  { key: 'custom_3', label: 'Custom Field 3', category: 'Custom Fields' },
  { key: 'custom_4', label: 'Custom Field 4', category: 'Custom Fields' },
  { key: 'custom_5', label: 'Custom Field 5', category: 'Custom Fields' }
];

// Smart mapping function to match CSV headers to standard variables
export function findVariableMatch(csvHeader: string): string | null {
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

export function getVariablesByCategory() {
  const categories: Record<string, typeof STANDARD_VARIABLES> = {};
  
  STANDARD_VARIABLES.forEach(variable => {
    if (!categories[variable.category]) {
      categories[variable.category] = [];
    }
    categories[variable.category].push(variable);
  });
  
  return categories;
}

export function getRequiredVariables() {
  return STANDARD_VARIABLES.filter(v => v.required);
}

export function getVariableByKey(key: string) {
  return STANDARD_VARIABLES.find(v => v.key === key);
}