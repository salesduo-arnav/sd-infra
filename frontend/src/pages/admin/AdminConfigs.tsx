import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface SystemConfig {
  key: string;
  value: string;
  description?: string;
  category: string;
}

// Keys that store JSON objects — render with a Textarea + JSON validation
const JSON_KEYS = new Set([
  'marketplace_region_map',
  'sc_region_urls',
  'vc_region_urls',
]);

// Keys that benefit from a multiline textarea
const TEXTAREA_KEYS = new Set([
  'password_regex',
  'password_regex_message',
  ...JSON_KEYS,
]);

// Human-readable category labels and ordering
const CATEGORY_META: Record<string, { label: string; description: string; order: number }> = {
  branding:     { label: 'Branding',                description: 'Application name, colors, and support contact',       order: 1 },
  email:        { label: 'Email Templates',          description: 'Email subject lines with placeholder support',        order: 2 },
  auth:         { label: 'Authentication',           description: 'Password rules, invitation expiry, and session settings', order: 3 },
  payment:      { label: 'Payment & Billing',        description: 'Grace periods and billing-related settings',          order: 4 },
  entitlement:  { label: 'Entitlements',             description: 'Feature usage reset periods',                         order: 5 },
  cron:         { label: 'Scheduled Jobs',           description: 'Cron schedules (changes require app restart)',        order: 6 },
  integration:  { label: 'Amazon Integration',       description: 'Marketplace mappings, region URLs, and OAuth settings', order: 7 },
  general:      { label: 'General',                  description: 'Other platform settings',                             order: 99 },
};

function getCategoryMeta(category: string) {
  return CATEGORY_META[category] || { label: category.charAt(0).toUpperCase() + category.slice(1), description: '', order: 50 };
}

function isJsonKey(key: string): boolean {
  return JSON_KEYS.has(key);
}

function formatKeyLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatJsonForDisplay(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function compactJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

export default function AdminConfigs() {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Local state for editing values
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  // Track original values to detect dirty state
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});

  const fetchConfigs = useCallback(async () => {
    try {
      const response = await api.get('/admin/configs');
      setConfigs(response.data.configs);

      const initial: Record<string, string> = {};
      response.data.configs.forEach((c: SystemConfig) => {
        // Pretty-print JSON values for display
        initial[c.key] = isJsonKey(c.key) ? formatJsonForDisplay(c.value) : c.value;
      });
      setEditValues(initial);
      setOriginalValues(initial);
    } catch (error) {
      console.error("Failed to fetch configs", error);
      toast.error("Failed to load configurations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const config = configs.find(c => c.key === key);
      // Compact JSON before sending to API
      const valueToSend = isJsonKey(key) ? compactJson(editValues[key]) : editValues[key];

      await api.put(`/admin/configs/${key}`, {
        value: valueToSend,
        description: config?.description,
        category: config?.category,
      });
      toast.success(`"${formatKeyLabel(key)}" updated successfully`);

      // Update original to match saved value so dirty tracking resets
      setOriginalValues(prev => ({ ...prev, [key]: editValues[key] }));
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to update configuration";
      toast.error(message);
    } finally {
      setSaving(null);
    }
  };

  const handleChange = (key: string, value: string) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = (key: string) => {
    setEditValues(prev => ({ ...prev, [key]: originalValues[key] }));
  };

  const isDirty = (key: string): boolean => {
    return editValues[key] !== originalValues[key];
  };

  // Filter configs by search
  const filteredConfigs = configs.filter(config => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      config.key.toLowerCase().includes(q) ||
      (config.description || '').toLowerCase().includes(q) ||
      config.category.toLowerCase().includes(q) ||
      (editValues[config.key] || '').toLowerCase().includes(q)
    );
  });

  // Group by category
  const groupedConfigs = filteredConfigs.reduce((acc, config) => {
    const category = config.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(config);
    return acc;
  }, {} as Record<string, SystemConfig[]>);

  // Sort categories by defined order
  const sortedCategories = Object.entries(groupedConfigs).sort(
    ([a], [b]) => getCategoryMeta(a).order - getCategoryMeta(b).order
  );

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">System Configurations</h1>
          <p className="text-muted-foreground">
            Manage system-wide settings. Changes take effect immediately unless noted otherwise.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search configurations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {sortedCategories.length === 0 && (
        <div className="text-center py-10">
          <p className="text-muted-foreground">
            {searchQuery ? "No configurations match your search." : "No configurations found."}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {sortedCategories.map(([category, items]) => {
          const meta = getCategoryMeta(category);
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{meta.label}</CardTitle>
                {meta.description && (
                  <CardDescription>{meta.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {items.map((config) => {
                  const value = editValues[config.key] || '';
                  const isBoolean = value === 'true' || value === 'false';
                  const isNumber = !isBoolean && !isNaN(Number(value)) && value.trim() !== '' && !TEXTAREA_KEYS.has(config.key);
                  const isColor = config.key === 'brand_color';
                  const isTextarea = TEXTAREA_KEYS.has(config.key);
                  const dirty = isDirty(config.key);

                  return (
                    <div
                      key={config.key}
                      className="flex flex-col gap-4 p-6 border-b last:border-0 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={config.key} className="text-base font-medium">
                              {formatKeyLabel(config.key)}
                            </Label>
                            {dirty && (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                Unsaved
                              </Badge>
                            )}
                          </div>
                          {config.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                              {config.description}
                            </p>
                          )}
                        </div>

                        {/* Save / Reset buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {dirty && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleReset(config.key)}
                              title="Discard changes"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleSave(config.key)}
                            disabled={saving === config.key || !dirty}
                            title="Save configuration"
                          >
                            {saving === config.key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Input field */}
                      <div className="w-full">
                        {isBoolean ? (
                          <div className="flex items-center h-10">
                            <Switch
                              checked={value === 'true'}
                              onCheckedChange={(checked) =>
                                handleChange(config.key, checked ? 'true' : 'false')
                              }
                            />
                            <span className="ml-3 text-sm text-muted-foreground">
                              {value === 'true' ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        ) : isColor ? (
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={value}
                              onChange={(e) => handleChange(config.key, e.target.value)}
                              className="h-10 w-14 rounded border cursor-pointer"
                            />
                            <Input
                              id={config.key}
                              value={value}
                              onChange={(e) => handleChange(config.key, e.target.value)}
                              placeholder="#ff9900"
                              className="w-40 font-mono"
                            />
                          </div>
                        ) : isTextarea ? (
                          <Textarea
                            id={config.key}
                            value={value}
                            onChange={(e) => handleChange(config.key, e.target.value)}
                            className="font-mono text-sm min-h-[80px]"
                            rows={isJsonKey(config.key) ? 8 : 3}
                          />
                        ) : isNumber ? (
                          <Input
                            id={config.key}
                            type="number"
                            value={value}
                            onChange={(e) => handleChange(config.key, e.target.value)}
                            className="max-w-xs"
                          />
                        ) : (
                          <Input
                            id={config.key}
                            value={value}
                            onChange={(e) => handleChange(config.key, e.target.value)}
                            className="max-w-2xl"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
