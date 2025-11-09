import { Users, UploadSimple as Upload, MagnifyingGlass as Search, DotsThreeVertical as MoreVertical, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContactImportModal } from "@/components/ContactImportModal";
import { ContactGroupPanel } from "@/components/ContactGroupPanel";
import type { ContactGroup } from "@/types/contacts";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export default function Contacts() {
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const fetchContactGroups = useCallback(async () => {
    try {
      // Fetch contact groups with contact counts
      const { data: groups, error: groupsError } = await supabase
        .from('contact_groups')
        .select(`
          id,
          user_id,
          name,
          description,
          total_contacts,
          csv_headers,
          created_at,
          updated_at,
          status
        `);

      if (groupsError) throw groupsError;

      setContactGroups(groups || []);
    } catch (error) {
      console.error('Error fetching contact groups:', error);
      toast({
        title: "Error",
        description: "Failed to load contact groups. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchContactGroups();
  }, [fetchContactGroups]);

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    const confirmed = await confirm(
      'Delete Contact Group',
      `Are you sure you want to delete "${groupName}"? This will also delete all contacts in this group.`,
      'destructive'
    );
    
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contact_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      toast({
        title: "Group deleted",
        description: `"${groupName}" has been deleted successfully.`,
      });

      fetchContactGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast({
        title: "Error",
        description: "Failed to delete contact group. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredGroups = contactGroups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Contact Groups</h1>
            <p className="text-muted-foreground mt-1">Loading contact groups...</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            Import and manage your contact lists
          </p>
        </div>
        <Button onClick={() => setImportModalOpen(true)} className="bg-primary hover:bg-primary/90">
          <Upload className="h-4 w-4 mr-2" />
          Import Contacts
        </Button>
      </div>

      {contactGroups.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Search contact groups..." 
              className="pl-10" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search contact groups"
            />
          </div>
        </div>
      )}

      {filteredGroups.length === 0 && contactGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md text-center">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No contact groups yet</h3>
            <p className="text-gray-600 mb-6">Import your first contact list to get started</p>
            <Button onClick={() => setImportModalOpen(true)} className="bg-primary hover:bg-primary/90">
              <Upload className="h-4 w-4 mr-2" />
              Import Contacts
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group) => (
            <Card key={group.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <CardTitle className="text-lg font-semibold">{group.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Users className="h-4 w-4" />
                      <CardDescription>{(group.total_contacts || 0).toLocaleString()} contacts</CardDescription>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setSelectedGroup(group);
                      setPanelOpen(true);
                    }}>View Contacts</DropdownMenuItem>
                    <DropdownMenuItem>Edit Group</DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => handleDeleteGroup(group.id, group.name)}
                    >
                      Delete Group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-500">
                  Created {new Date(group.created_at).toLocaleDateString()}
                </div>
                
                {group.description && (
                  <p className="text-gray-600 text-sm line-clamp-2">{group.description}</p>
                )}
                
                {group.csv_headers && group.csv_headers.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2">CSV Fields:</p>
                    <div className="flex flex-wrap gap-1">
                      {group.csv_headers.slice(0, 4).map((header, index) => (
                        <Badge key={index} variant="secondary">
                          {header}
                        </Badge>
                      ))}
                      {group.csv_headers.length > 4 && (
                        <Badge variant="secondary">
                          +{group.csv_headers.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ContactImportModal 
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImportComplete={fetchContactGroups}
      />

      <ContactGroupPanel
        contactGroup={selectedGroup}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onGroupDeleted={() => {
          fetchContactGroups();
          setSelectedGroup(null);
        }}
      />
      
      <ConfirmDialog />
    </div>
  );
}