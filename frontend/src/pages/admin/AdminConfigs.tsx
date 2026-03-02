import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface SystemConfig {
  key: string;
  value: string;
  description?: string;
  category: string;
}

export default function AdminConfigs() {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Local state for editing values
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await api.get('/admin/configs');
      setConfigs(response.data.configs);
      
      // Initialize edit values
      const initialValues: Record<string, string> = {};
      response.data.configs.forEach((c: SystemConfig) => {
        initialValues[c.key] = c.value;
      });
      setEditValues(initialValues);
    } catch (error) {
      console.error("Failed to fetch configs", error);
      toast.error("Failed to load configurations");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const config = configs.find(c => c.key === key);
      await api.put(`/admin/configs/${key}`, {
        value: editValues[key],
        description: config?.description,
        category: config?.category
      });
      toast.success("Configuration updated successfully");
      // Update the main list with new value (though fetchConfigs isn't strictly needed if we trust local state)
      fetchConfigs(); 
    } catch (error) {
       console.error("Failed to update config", error);
       toast.error("Failed to update configuration");
    } finally {
       setSaving(null);
    }
  };

  const handleChange = (key: string, value: string) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  // Group by category
  const groupedConfigs = configs.reduce((acc, config) => {
    const category = config.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(config);
    return acc;
  }, {} as Record<string, SystemConfig[]>);

  if (loading) {
     return (
        <>
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        </>
     )
  }

  return (
    <>
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-2">System Configurations</h1>
        <p className="text-muted-foreground mb-8">Manage system-wide settings and variables.</p>
        
        {Object.entries(groupedConfigs).length === 0 && (
             <div className="text-center py-10">
                 <p className="text-muted-foreground">No configurations found.</p>
                 <Button className="mt-4" variant="outline" onClick={() => {
                     // Seed basic config if empty ? 
                     // For now just show this.
                 }}>
                    Refresh
                 </Button>
             </div>
        )}

        <div className="space-y-6">
            {Object.entries(groupedConfigs).map(([category, items]) => (
                <Card key={category}>
                    <CardHeader>
                        <CardTitle className="capitalize">{category} Configurations</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {items.map((config) => (
                            <div key={config.key} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border-b last:border-0 transition-colors">
                                <div className="space-y-1.5 flex-1">
                                    <Label htmlFor={config.key} className="text-base font-medium">
                                      {config.key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                    </Label>
                                    {config.description && (
                                        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                                            {config.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    {(() => {
                                        const value = editValues[config.key] || '';
                                        const isBoolean = value === 'true' || value === 'false';
                                        const isNumber = !isBoolean && !isNaN(Number(value)) && value.trim() !== '';

                                        if (isBoolean) {
                                            return (
                                                <div className="flex-1 md:w-[320px] flex items-center h-10">
                                                    <Switch 
                                                        checked={value === 'true'}
                                                        onCheckedChange={(checked) => handleChange(config.key, checked ? 'true' : 'false')}
                                                    />
                                                </div>
                                            );
                                        }

                                        if (isNumber) {
                                            return (
                                                <Input
                                                    id={config.key}
                                                    type="number"
                                                    value={value}
                                                    onChange={(e) => handleChange(config.key, e.target.value)}
                                                    className="flex-1 md:w-[320px]"
                                                />
                                            );
                                        }

                                        return (
                                            <Input
                                                id={config.key}
                                                value={value}
                                                onChange={(e) => handleChange(config.key, e.target.value)}
                                                className="flex-1 md:w-[320px]"
                                            />
                                        );
                                    })()}
                                    <Button 
                                        size="icon"
                                        variant="outline"
                                        onClick={() => handleSave(config.key)}
                                        disabled={saving === config.key}
                                        title="Save configuration"
                                    >
                                        {saving === config.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}


        </div>
      </div>
    </>
  );
}
