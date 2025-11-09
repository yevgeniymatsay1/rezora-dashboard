// @ts-nocheck
import { useState } from "react";
import { X, DownloadSimple, Trash, Phone, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { useContacts } from "@/hooks/useApiQuery";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryClient";
import type { ContactGroup, Contact } from "@/types/contacts";

interface ContactGroupPanelProps {
  contactGroup: ContactGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupDeleted: () => void;
}

const CONTACTS_PER_PAGE = 50;

export function ContactGroupPanel({ contactGroup, open, onOpenChange, onGroupDeleted }: ContactGroupPanelProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use React Query hook for fetching contacts
  const { data: contactsData, isLoading: loading, error } = useContacts(
    contactGroup?.id,
    {
      enabled: !!contactGroup && open,
      staleTime: 30000, // 30 seconds
      cacheTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  // Handle pagination on the client side for now
  const contacts = contactsData ? contactsData.slice(
    (currentPage - 1) * CONTACTS_PER_PAGE,
    currentPage * CONTACTS_PER_PAGE
  ) : [];
  const totalContacts = contactsData?.length || 0;

  // Show error toast if fetching fails
  if (error) {
    console.error('Error fetching contacts:', error);
    toast({
      title: "Error",
      description: "Failed to load contacts. Please try again.",
      variant: "destructive",
    });
  }

  // Use mutation for deleting group with optimistic updates
  const deleteGroupMutation = useMutation({
    mutationFn: async () => {
      if (!contactGroup) throw new Error('No contact group selected');
      
      const { error } = await supabase
        .from('contact_groups')
        .delete()
        .eq('id', contactGroup.id);

      if (error) throw error;
      return contactGroup;
    },
    onMutate: async () => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.groups() });
      
      // Snapshot the previous value
      const previousGroups = queryClient.getQueryData(queryKeys.contacts.groups());
      
      // Optimistically remove the group
      if (contactGroup) {
        queryClient.setQueryData(queryKeys.contacts.groups(), (old: any[]) => 
          old?.filter(g => g.id !== contactGroup.id)
        );
      }
      
      return { previousGroups };
    },
    onError: (err, _, context) => {
      // Rollback on error
      if (context?.previousGroups) {
        queryClient.setQueryData(queryKeys.contacts.groups(), context.previousGroups);
      }
      
      console.error('Error deleting group:', err);
      toast({
        title: "Error",
        description: "Failed to delete contact group. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (deletedGroup) => {
      toast({
        title: "Group deleted",
        description: `"${deletedGroup.name}" has been deleted successfully.`,
      });

      onOpenChange(false);
      onGroupDeleted();
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.groups() });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });

  const handleDeleteGroup = () => {
    deleteGroupMutation.mutate();
  };

  const exportContacts = async () => {
    if (!contactGroup) return;

    try {
      // Fetch all contacts for export
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('contact_group_id', contactGroup.id);

      if (error) throw error;

      // Create CSV content
      const headers = contactGroup.csv_headers || ['first_name', 'last_name', 'phone_number'];
      const csvContent = [
        headers.join(','),
        ...(data || []).map(contact => 
          headers.map(header => {
            const value = contact.data[header] || contact[header as keyof Contact] || '';
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contactGroup.name.replace(/[^a-z0-9]/gi, '_')}_contacts.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: "Contacts have been exported successfully.",
      });
    } catch (error) {
      console.error('Error exporting contacts:', error);
      toast({
        title: "Error",
        description: "Failed to export contacts. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Helper function to get contact field value from the correct source
  const getContactFieldValue = (contact: any, column: string): string => {
    // Map common column variations to actual contact properties
    const fieldMap: Record<string, string> = {
      'first_name': 'first_name',
      'firstname': 'first_name',
      'first name': 'first_name',
      'last_name': 'last_name',
      'lastname': 'last_name',
      'last name': 'last_name',
      'email': 'email',
      'email_address': 'email',
      'email address': 'email',
      'address': 'address',
      'property_address': 'address',
      'property address': 'address',
      'phone_number': 'phone_number',
      'phone number': 'phone_number',
      'phone': 'phone_number'
    };

    const normalizedColumn = column.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const mappedField = fieldMap[normalizedColumn] || fieldMap[column.toLowerCase()];

    // First check actual contact properties
    if (mappedField && contact[mappedField]) {
      return contact[mappedField];
    }

    // Then check data JSONB column
    if (contact.data && contact.data[column] !== undefined) {
      return contact.data[column];
    }

    // Finally check custom_fields
    if (contact.custom_fields && contact.custom_fields[column] !== undefined) {
      return contact.custom_fields[column];
    }

    return '';
  };

  const getDisplayColumns = () => {
    if (!contactGroup?.csv_headers) return ['phone_number'];
    
    // Check if any of the selected headers is already a phone field
    const phoneFields = ['phone_number', 'phone', 'mobile', 'cell'];
    const hasPhoneField = contactGroup.csv_headers.some(header => 
      phoneFields.includes(header.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    
    // If no phone field exists, add it; otherwise just use the selected headers
    const columns = hasPhoneField 
      ? contactGroup.csv_headers.slice(0, 5)
      : contactGroup.csv_headers.slice(0, 4).concat(['phone_number']);
    
    return columns.filter((col, index, arr) => arr.indexOf(col) === index);
  };

  const getStatusDot = (status: string) => {
    const colorClass = status === 'active' ? 'bg-green-500' : status === 'invalid' ? 'bg-red-500' : 'bg-gray-500';
    return <div className={`w-2 h-2 rounded-full ${colorClass}`} />;
  };

  const totalPages = Math.ceil(totalContacts / CONTACTS_PER_PAGE);

  if (!contactGroup) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-xl font-semibold">{contactGroup.name}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {totalContacts.toLocaleString()} contacts • Created {new Date(contactGroup.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Group Info */}
            <div className="space-y-4">
              {contactGroup.description && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
                  <p className="text-sm">{contactGroup.description}</p>
                </div>
              )}

              {contactGroup.csv_headers && contactGroup.csv_headers.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">CSV Fields</h3>
                  <div className="flex flex-wrap gap-2">
                    {contactGroup.csv_headers.map((header, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {header}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Contacts Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Contacts</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportContacts}>
                    <DownloadSimple className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash className="h-4 w-4 mr-2" />
                        Delete Group
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Contact Group</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{contactGroup.name}"? This will permanently delete all {totalContacts} contacts in this group. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete Group
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">Loading contacts...</div>
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">No contacts found</div>
                </div>
              ) : (
                <>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Status</TableHead>
                          {getDisplayColumns().map((column) => (
                            <TableHead key={column} className="capitalize">
                              {column === 'phone_number' ? (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  Phone
                                </div>
                              ) : (
                                column.replace(/_/g, ' ')
                              )}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>
                              {getStatusDot(contact.status)}
                            </TableCell>
                             {getDisplayColumns().map((column) => (
                               <TableCell key={column} className="max-w-[120px] truncate">
                                 {getContactFieldValue(contact, column) || '-'}
                               </TableCell>
                             ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex justify-center">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const page = i + 1;
                            return (
                              <PaginationItem key={page}>
                                <PaginationLink 
                                  onClick={() => setCurrentPage(page)}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}

                          <PaginationItem>
                            <PaginationNext 
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}