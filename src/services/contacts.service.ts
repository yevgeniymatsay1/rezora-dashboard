// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { authService } from './auth.service';
import { baseService } from './base.service';

interface Contact {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number: string;
  data: Record<string, any>;
  contact_group_id: string;
  created_at: string;
  updated_at: string;
}

interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  total_contacts: number;
  csv_headers?: string[];
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

/**
 * Service for contact and contact group operations
 */
export const contactsService = {
  /**
   * Get all contact groups for the current user
   */
  async getGroups() {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('contact_groups')
      .select(`
        *,
        contacts(count)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    return baseService.handleResponse(response);
  },

  /**
   * Get active contact groups only
   */
  async getActiveGroups() {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('contact_groups')
      .select(`
        *,
        contacts(count)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('name');
    
    return baseService.handleResponse(response);
  },

  /**
   * Get a contact group by ID
   */
  async getGroupById(groupId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('contact_groups')
      .select(`
        *,
        contacts(count)
      `)
      .eq('id', groupId)
      .eq('user_id', user.id)
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Create a new contact group
   */
  async createGroup(groupData: Partial<ContactGroup>) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('contact_groups')
      .insert({
        ...groupData,
        user_id: user.id,
        status: 'active',
        total_contacts: 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Update a contact group
   */
  async updateGroup(groupId: string, updates: Partial<ContactGroup>) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('contact_groups')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId)
      .eq('user_id', user.id)
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Archive a contact group
   */
  async archiveGroup(groupId: string) {
    const user = await authService.requireAuth();
    
    // Check if group is used in active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('contact_group_id', groupId)
      .in('status', ['active', 'scheduled', 'paused'])
      .limit(1);
    
    if (campaigns && campaigns.length > 0) {
      throw new Error('Contact group cannot be archived while used in active campaigns');
    }
    
    const response = await supabase
      .from('contact_groups')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId)
      .eq('user_id', user.id);
    
    baseService.handleMutation(response);
  },

  /**
   * Delete a contact group
   */
  async deleteGroup(groupId: string) {
    const user = await authService.requireAuth();
    
    // Check if group is used in any campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('contact_group_id', groupId)
      .limit(1);
    
    if (campaigns && campaigns.length > 0) {
      throw new Error('Contact group cannot be deleted as it is used in campaigns');
    }
    
    // Delete all contacts first
    await supabase
      .from('contacts')
      .delete()
      .eq('contact_group_id', groupId);
    
    const response = await supabase
      .from('contact_groups')
      .delete()
      .eq('id', groupId)
      .eq('user_id', user.id);
    
    baseService.handleMutation(response);
  },

  /**
   * Get contacts in a group with pagination
   */
  async getContacts(groupId: string, page = 1, pageSize = 50) {
    const user = await authService.requireAuth();
    const offset = (page - 1) * pageSize;
    
    // Verify group ownership
    await this.getGroupById(groupId);
    
    const response = await supabase
      .from('contacts')
      .select('*')
      .eq('contact_group_id', groupId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    return baseService.handleResponse(response);
  },

  /**
   * Get a single contact
   */
  async getContactById(contactId: string) {
    const response = await supabase
      .from('contacts')
      .select(`
        *,
        contact_groups!inner(user_id)
      `)
      .eq('id', contactId)
      .single();
    
    const contact = baseService.handleResponse(response);
    
    // Verify ownership
    const user = await authService.requireAuth();
    if (contact.contact_groups.user_id !== user.id) {
      throw new Error('Unauthorized access to contact');
    }
    
    return contact;
  },

  /**
   * Create a new contact
   */
  async createContact(groupId: string, contactData: Partial<Contact>) {
    // Verify group ownership
    await this.getGroupById(groupId);
    
    const response = await supabase
      .from('contacts')
      .insert({
        ...contactData,
        contact_group_id: groupId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    const contact = baseService.handleResponse(response);
    
    // Update group count
    await this.updateGroupCount(groupId);
    
    return contact;
  },

  /**
   * Update a contact
   */
  async updateContact(contactId: string, updates: Partial<Contact>) {
    // Verify ownership
    await this.getContactById(contactId);
    
    const response = await supabase
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId)
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string) {
    // Verify ownership and get group ID
    const contact = await this.getContactById(contactId);
    
    const response = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId);
    
    baseService.handleMutation(response);
    
    // Update group count
    await this.updateGroupCount(contact.contact_group_id);
  },

  /**
   * Bulk delete contacts
   */
  async deleteContacts(contactIds: string[]) {
    if (contactIds.length === 0) return;
    
    // Get first contact to verify ownership and get group ID
    const firstContact = await this.getContactById(contactIds[0]);
    
    const response = await supabase
      .from('contacts')
      .delete()
      .in('id', contactIds);
    
    baseService.handleMutation(response);
    
    // Update group count
    await this.updateGroupCount(firstContact.contact_group_id);
  },

  /**
   * Import contacts from CSV
   */
  async importFromCSV(
    groupId: string, 
    csvData: any[], 
    headers: string[]
  ): Promise<ImportResult> {
    const user = await authService.requireAuth();
    
    // Verify group ownership
    await this.getGroupById(groupId);
    
    const response = await supabase.functions.invoke('import-contacts', {
      body: {
        groupId,
        csvData,
        headers,
        userId: user.id
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to import contacts');
    }
    
    // Update group count and headers
    await this.updateGroup(groupId, {
      csv_headers: headers
    });
    await this.updateGroupCount(groupId);
    
    return response.data as ImportResult;
  },

  /**
   * Search contacts
   */
  async searchContacts(query: string, groupId?: string) {
    const user = await authService.requireAuth();
    
    let searchQuery = supabase
      .from('contacts')
      .select(`
        *,
        contact_groups!inner(user_id)
      `)
      .eq('contact_groups.user_id', user.id);
    
    if (groupId) {
      searchQuery = searchQuery.eq('contact_group_id', groupId);
    }
    
    // Search in multiple fields
    searchQuery = searchQuery.or(
      `first_name.ilike.%${query}%,` +
      `last_name.ilike.%${query}%,` +
      `email.ilike.%${query}%,` +
      `phone_number.ilike.%${query}%`
    );
    
    const response = await searchQuery.limit(50);
    
    return baseService.handleOptionalResponse(response) || [];
  },

  /**
   * Update contact group count (internal use)
   */
  async updateGroupCount(groupId: string) {
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('contact_group_id', groupId);
    
    await supabase
      .from('contact_groups')
      .update({ 
        total_contacts: count || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId);
  },

  /**
   * Get contact statistics for a group
   */
  async getGroupStatistics(groupId: string) {
    const user = await authService.requireAuth();
    
    // Verify group ownership
    await this.getGroupById(groupId);
    
    const response = await supabase
      .from('contacts')
      .select('data')
      .eq('contact_group_id', groupId);
    
    const contacts = baseService.handleOptionalResponse(response) || [];
    
    // Calculate statistics
    const stats = {
      total: contacts.length,
      withEmail: contacts.filter(c => c.data?.email).length,
      withPhone: contacts.filter(c => c.data?.phone_number).length,
      fieldCoverage: {} as Record<string, number>
    };
    
    // Calculate field coverage
    if (contacts.length > 0) {
      const allFields = new Set<string>();
      contacts.forEach(c => {
        if (c.data) {
          Object.keys(c.data).forEach(key => allFields.add(key));
        }
      });
      
      allFields.forEach(field => {
        const count = contacts.filter(c => c.data?.[field]).length;
        stats.fieldCoverage[field] = Math.round((count / contacts.length) * 100);
      });
    }
    
    return stats;
  }
};