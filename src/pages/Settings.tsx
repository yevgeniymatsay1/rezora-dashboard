import { FloppyDisk as Save, Eye, EyeSlash as EyeOff, CircleNotch as Loader2 } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSuccessFeedback } from "@/hooks/useSuccessFeedback";
import { supabase } from "@/integrations/supabase/client";
import { getResponsiveGrid } from "@/lib/responsive";

export default function Settings() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();
  const { showSuccess } = useSuccessFeedback();

  // Form state
  const [formData, setFormData] = useState({
    fullName: "John Doe",
    email: "john@company.com",
    phone: "+1 (555) 123-4567",
    companyName: "ABC Real Estate",
    website: "https://abcrealestate.com",
    address: "123 Main St, City, State 12345",
    emailNotifications: true,
    campaignAlerts: true,
    dailyReports: false
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Simulate saving to backend
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Update user profile - only update fields that exist in the table
      // The profiles table only has: id, company_name, first_name, last_name, role, created_at, updated_at
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      // Only include company_name if it exists
      if (formData.companyName) {
        updateData.company_name = formData.companyName;
      }
      
      // Split full name into first and last if provided
      if (formData.fullName) {
        const nameParts = formData.fullName.trim().split(' ');
        if (nameParts.length > 0) {
          updateData.first_name = nameParts[0];
          if (nameParts.length > 1) {
            updateData.last_name = nameParts.slice(1).join(' ');
          }
        }
      }
      
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      showSuccess("Settings saved successfully", "All your changes have been saved");
      setHasChanges(false);
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Generate new API key
      const newApiKey = `sk-${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
      
      const { error } = await supabase
        .from('profiles')
        .update({ retell_api_key: newApiKey })
        .eq('id', user.id);

      if (error) throw error;

      showSuccess("API Key regenerated", "Your new API key has been generated");
    } catch (error) {
      console.error('API key regeneration error:', error);
      toast({
        title: "Regeneration Failed",
        description: "Failed to regenerate API key. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account preferences and configuration
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSaveAll} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save All Changes
              </>
            )}
          </Button>
        )}
      </div>

      <div className={getResponsiveGrid('settings')}>
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input 
                id="name" 
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input 
                id="phone" 
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>Information about your real estate business</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company Name</Label>
              <Input 
                id="company" 
                value={formData.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input 
                id="website" 
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Business Address</Label>
              <Textarea 
                id="address" 
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose how you want to be notified</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Email notifications</div>
              <div className="text-sm text-muted-foreground">Receive updates via email</div>
            </div>
            <Switch 
              checked={formData.emailNotifications}
              onCheckedChange={(checked) => handleInputChange('emailNotifications', checked)}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Campaign alerts</div>
              <div className="text-sm text-muted-foreground">Get notified when campaigns complete</div>
            </div>
            <Switch 
              checked={formData.campaignAlerts}
              onCheckedChange={(checked) => handleInputChange('campaignAlerts', checked)}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Daily reports</div>
              <div className="text-sm text-muted-foreground">Receive daily performance summaries</div>
            </div>
            <Switch 
              checked={formData.dailyReports}
              onCheckedChange={(checked) => handleInputChange('dailyReports', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Manage your API access credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apikey">API Key</Label>
            <div className="flex gap-2">
              <Input 
                id="apikey" 
                type={showApiKey ? "text" : "password"}
                defaultValue="sk-1234567890abcdef..."
                readOnly
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button variant="outline" onClick={handleRegenerateApiKey}>
            Regenerate Key
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}