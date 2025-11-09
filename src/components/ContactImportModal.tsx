import { useState, useCallback, useRef, memo } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useFormHandlers, useToggle } from '@/hooks/useCallbackHandlers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadSimple, File, CheckCircle, X, DotsThreeOutline } from '@phosphor-icons/react';
import Papa from 'papaparse';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { findVariableMatch, getVariablesByCategory, getVariableByKey } from '@/lib/constants/contact-variables';
import { LabelWithRequired, RequiredFieldsNote } from '@/components/form/RequiredFieldIndicator';
import type { ImportStep1Data, ImportStep2Data, ImportStep3Data } from '@/types/contacts';

interface ContactImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

const ContactImportModal = memo(function ContactImportModal({ open, onOpenChange, onImportComplete }: ContactImportModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Data, setStep1Data] = useState<ImportStep1Data>({ file: null, fileName: '', fileSize: 0 });
  const [step2Data, setStep2Data] = useState<ImportStep2Data>({
    groupName: '',
    description: '',
    csvData: [],
    selectedColumns: [],
    columnMapping: {}
  });
  const [step3Data, setStep3Data] = useState<ImportStep3Data>({
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
    invalidContacts: 0,
    isComplete: false
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetModal = useCallback(() => {
    setCurrentStep(1);
    setStep1Data({ file: null, fileName: '', fileSize: 0 });
    setStep2Data({ groupName: '', description: '', csvData: [], selectedColumns: [], columnMapping: {} });
    setStep3Data({ progress: 0, totalContacts: 0, processedContacts: 0, invalidContacts: 0, isComplete: false });
  }, []);

  const handleUploadAreaClick = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleChangeFileClick = useCallback(() => {
    setStep1Data({ file: null, fileName: '', fileSize: 0 });
  }, [setStep1Data]);

  const handleGroupNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setStep2Data(prev => ({ ...prev, groupName: e.target.value }));
  }, [setStep2Data]);

  const handleDescriptionChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setStep2Data(prev => ({ ...prev, description: e.target.value }));
  }, [setStep2Data]);

  const handleBackToStep1 = useCallback(() => {
    setCurrentStep(1);
  }, [setCurrentStep]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive"
      });
      return;
    }

    setStep1Data({
      file,
      fileName: file.name,
      fileSize: file.size
    });
  }, [toast]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const parseCSV = useCallback(() => {
    if (!step1Data.file) return;

    Papa.parse(step1Data.file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = Object.keys(results.data[0] || {});
        const initialMapping: Record<string, boolean> = {};
        
        // Use smart mapping with standard variables
        headers.forEach(header => {
          const matchedVariable = findVariableMatch(header);
          initialMapping[header] = !!matchedVariable;
        });

        setStep2Data(prev => ({
          ...prev,
          csvData: results.data,
          selectedColumns: headers.filter(h => initialMapping[h]),
          columnMapping: initialMapping
        }));
        setCurrentStep(2);
      },
      error: (error) => {
        toast({
          title: "CSV parsing error",
          description: error.message,
          variant: "destructive"
        });
      }
    });
  }, [step1Data.file, toast]);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const toggleColumn = useCallback(
    (column: string) => {
      setStep2Data(prev => {
        const newMapping = { ...prev.columnMapping };
        newMapping[column] = !newMapping[column];
        
        const selectedColumns = Object.keys(newMapping).filter(key => newMapping[key]);
        
        return {
          ...prev,
          columnMapping: newMapping,
          selectedColumns
        };
      });
    },
    []
  );

  const startImport = async () => {
    if (!step2Data.groupName.trim()) {
      toast({
        title: "Group name required",
        description: "Please enter a name for your contact group",
        variant: "destructive"
      });
      return;
    }

    if (step2Data.selectedColumns.length === 0) {
      toast({
        title: "No columns selected",
        description: "Please select at least one column to import",
        variant: "destructive"
      });
      return;
    }

    setCurrentStep(3);
    
    try {
      setStep3Data({
        progress: 0,
        totalContacts: step2Data.csvData.length,
        processedContacts: 0,
        invalidContacts: 0,
        isComplete: false
      });

      // Call the import-contacts edge function
      const { data, error } = await supabase.functions.invoke('import-contacts', {
        body: {
          groupName: step2Data.groupName,
          description: step2Data.description,
          csvData: step2Data.csvData,
          selectedHeaders: step2Data.selectedColumns
        }
      });

      if (error) {
        throw new Error(`Import failed: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Import failed');
      }

      // Update progress to completion
      setStep3Data({
        progress: 100,
        totalContacts: step2Data.csvData.length,
        processedContacts: data.totalImported,
        invalidContacts: data.invalidCount,
        isComplete: true
      });
      
      toast({
        title: "Import completed",
        description: `Successfully imported ${data.totalImported} contacts`,
      });

    } catch (error) {
      console.error('Import error:', error);
      setStep3Data(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Import failed'
      }));
      
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const handleClose = () => {
    if (step3Data.isComplete) {
      onImportComplete();
    }
    onOpenChange(false);
    resetModal();
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {[1, 2, 3].map((step, index) => (
        <div key={step} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            {step}
          </div>
          {index < 2 && (
            <div className={`w-12 h-px mx-2 ${
              step < currentStep ? 'bg-primary' : 'bg-muted'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
        </DialogHeader>

        <StepIndicator />

        <div className="flex-1 overflow-auto">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Upload CSV File</h3>
                
                {!step1Data.file ? (
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg h-64 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={handleUploadAreaClick}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="UploadSimple CSV file. Drag and drop or press Enter to browse"
                  >
                    <UploadSimple className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">Drag and drop your CSV file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      aria-label="CSV file input"
                      onChange={handleFileInputChange}
                    />
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium">{step1Data.fileName}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(step1Data.fileSize)}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleChangeFileClick}
                      >
                        Change file
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Configure Import</h3>
                
                <div className="space-y-4">
                  <div>
                    <LabelWithRequired htmlFor="groupName" required>Contact Group Name</LabelWithRequired>
                    <Input
                      id="groupName"
                      placeholder="e.g., Q4 2024 Leads"
                      value={step2Data.groupName}
                      onChange={handleGroupNameChange}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Give your contacts a descriptive name</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Add notes about this contact group..."
                      value={step2Data.description}
                      onChange={handleDescriptionChange}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Preview (first 5 rows)</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {step2Data.selectedColumns.length} of {Object.keys(step2Data.columnMapping).length} columns selected
                </p>
                
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm" role="table" aria-label="CSV data preview">
                      <thead className="bg-muted">
                        <tr role="row">
                          {Object.keys(step2Data.columnMapping).map((header) => {
                            const matchedVariable = findVariableMatch(header);
                            const variableInfo = matchedVariable ? getVariableByKey(matchedVariable) : null;
                            
                            return (
                              <th key={header} className="p-2 text-left" scope="col">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`column-${header}`}
                                    checked={step2Data.columnMapping[header]}
                                    onCheckedChange={() => toggleColumn(header)}
                                    aria-label={`Include ${header} column in import`}
                                  />
                                  <div className="flex-1">
                                    <span className="font-medium">{header}</span>
                                    {variableInfo && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <Badge variant="secondary" className="text-xs">
                                          {variableInfo.label}
                                        </Badge>
                                        {variableInfo.required && (
                                          <Badge variant="destructive" className="text-xs">
                                            Required
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {step2Data.csvData.slice(0, 5).map((row, index) => (
                          <tr key={index} className="border-t">
                            {Object.keys(step2Data.columnMapping).map((header) => (
                              <td key={header} className="p-2 border-r last:border-r-0">
                                {String(row[header] || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 text-center">
              {!step3Data.isComplete && !step3Data.error && (
                <>
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Importing contacts...</h3>
                    <Progress value={step3Data.progress} className="w-full mb-4" />
                    <p className="text-sm text-muted-foreground">
                      {step3Data.processedContacts} of {step3Data.totalContacts} contacts processed
                    </p>
                  </div>
                </>
              )}

              {step3Data.isComplete && (
                <div>
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Successfully imported {step3Data.processedContacts} contacts!</h3>
                  {step3Data.invalidContacts > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {step3Data.invalidContacts} contacts skipped due to invalid phone numbers
                    </p>
                  )}
                </div>
              )}

              {step3Data.error && (
                <div>
                  <X className="h-16 w-16 text-destructive mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Import failed</h3>
                  <p className="text-sm text-muted-foreground">{step3Data.error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          {currentStep === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={parseCSV} disabled={!step1Data.file}>Next</Button>
            </>
          )}
          
          {currentStep === 2 && (
            <>
              <Button variant="outline" onClick={handleBackToStep1}>Back</Button>
              <Button onClick={startImport} disabled={!step2Data.groupName.trim()}>Import</Button>
            </>
          )}
          
          {currentStep === 3 && step3Data.isComplete && (
            <>
              <div></div>
              <Button onClick={handleClose}>Close</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

export { ContactImportModal };
