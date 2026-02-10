import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ShoppingCart,
    Key,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Shield,
    Zap,
    Package,
    Lock,
    Eye,
    EyeOff,
    Plug,
    BarChart3,
    TrendingUp,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface IntegrationDef {
    id: string;
    name: string;
    shortName: string;
    description: string;
    icon: React.ReactNode;
    required: boolean;
    fields: CredentialField[];
}

interface CredentialField {
    key: string;
    label: string;
    placeholder: string;
    hint?: string;
    secret?: boolean;
}

type IntegrationStatus = "pending" | "connecting" | "connected";

/* ------------------------------------------------------------------ */
/*  Integration catalogue – keyed by tool / app ID                     */
/* ------------------------------------------------------------------ */

const TOOL_INTEGRATIONS: Record<string, IntegrationDef[]> = {
    "listing-generator": [
        {
            id: "sp-api",
            name: "Amazon Selling Partner API",
            shortName: "SP-API",
            description: "Sync orders, inventory, and product data from Seller Central.",
            icon: <ShoppingCart className="h-5 w-5" />,
            required: true,
            fields: [
                {
                    key: "sellerId",
                    label: "Seller ID",
                    placeholder: "e.g. A1B2C3D4E5F6G7",
                    hint: "Seller Central → Settings → Account Info",
                },
                {
                    key: "clientId",
                    label: "LWA Client ID",
                    placeholder: "amzn1.application-oa2-client.xxxx",
                },
                {
                    key: "clientSecret",
                    label: "Client Secret",
                    placeholder: "Enter your client secret",
                    secret: true,
                },
            ],
        },
        {
            id: "advertising-api",
            name: "Amazon Advertising API",
            shortName: "Ads API",
            description: "Access PPC campaigns, keywords, and advertising analytics.",
            icon: <BarChart3 className="h-5 w-5" />,
            required: false,
            fields: [
                {
                    key: "profileId",
                    label: "Profile ID",
                    placeholder: "e.g. 1234567890",
                    hint: "Found in Advertising Console → Settings",
                },
                {
                    key: "clientId",
                    label: "LWA Client ID",
                    placeholder: "amzn1.application-oa2-client.xxxx",
                },
                {
                    key: "clientSecret",
                    label: "Client Secret",
                    placeholder: "Enter your client secret",
                    secret: true,
                },
            ],
        },
    ],

    /* Fallback for sp-api only (backwards compat) */
    "sp-api": [
        {
            id: "sp-api",
            name: "Amazon Selling Partner API",
            shortName: "SP-API",
            description: "Sync orders, inventory, and product data from Seller Central.",
            icon: <ShoppingCart className="h-5 w-5" />,
            required: true,
            fields: [
                {
                    key: "sellerId",
                    label: "Seller ID",
                    placeholder: "e.g. A1B2C3D4E5F6G7",
                    hint: "Seller Central → Settings → Account Info",
                },
                {
                    key: "clientId",
                    label: "LWA Client ID",
                    placeholder: "amzn1.application-oa2-client.xxxx",
                },
                {
                    key: "clientSecret",
                    label: "Client Secret",
                    placeholder: "Enter your client secret",
                    secret: true,
                },
            ],
        },
    ],
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntegrationOnboarding() {
    const [searchParams] = useSearchParams();
    const integrationId = searchParams.get("integration") || "listing-generator";
    const redirectUrl = searchParams.get("redirect");

    const integrations = TOOL_INTEGRATIONS[integrationId] ?? TOOL_INTEGRATIONS["sp-api"]!;
    const requiredCount = integrations.filter(i => i.required).length;

    // Track status for each integration
    const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>(() =>
        Object.fromEntries(integrations.map(i => [i.id, "pending"]))
    );

    // Which integration is being configured (null = overview / card view)
    const [activeId, setActiveId] = useState<string | null>(
        integrations.length === 1 ? integrations[0].id : null
    );
    const [loading, setLoading] = useState(false);
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>(() =>
        Object.fromEntries(integrations.map(i => [i.id, {}]))
    );

    useEffect(() => {
        console.log("IntegrationOnboarding Mounted:", { integrationId, redirectUrl });
    }, [integrationId, redirectUrl]);

    const connectedCount = Object.values(statuses).filter(s => s === "connected").length;
    const allRequiredConnected = integrations
        .filter(i => i.required)
        .every(i => statuses[i.id] === "connected");

    const activeIntegration = integrations.find(i => i.id === activeId) ?? null;

    /* ------------- handlers ------------- */

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeId) return;
        setLoading(true);
        setStatuses(prev => ({ ...prev, [activeId]: "connecting" }));

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        setStatuses(prev => ({ ...prev, [activeId]: "connected" }));
        setLoading(false);

        // If single-integration mode, stay on success. Otherwise go back to list.
        if (integrations.length > 1) {
            setActiveId(null);
        }
    };

    const handleComplete = () => {
        if (redirectUrl) {
            const url = new URL(redirectUrl);
            url.searchParams.set("integration_success", "true");
            window.location.href = url.toString();
        }
    };

    const updateField = (integId: string, key: string, value: string) => {
        setCredentials(prev => ({
            ...prev,
            [integId]: { ...prev[integId], [key]: value },
        }));
    };

    const isFormComplete = (integId: string) => {
        const def = integrations.find(i => i.id === integId);
        if (!def) return false;
        return def.fields.every(f => credentials[integId]?.[f.key]?.trim());
    };

    const toggleSecret = (fieldKey: string) => {
        setShowSecrets(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
    };

    /* ------------- left panel content ------------- */

    const leftPanelContent = () => {
        if (activeIntegration) {
            return (
                <>
                    <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/25 mb-4">
                        <Zap className="h-3 w-3 mr-1" />
                        Connecting Integration
                    </Badge>
                    <h1 className="text-3xl font-bold text-white mb-3 drop-shadow-sm">
                        {activeIntegration.name}
                    </h1>
                    <p className="text-lg text-white/90 leading-relaxed">
                        {activeIntegration.description}
                    </p>
                </>
            );
        }

        return (
            <>
                <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/25 mb-4">
                    <Plug className="h-3 w-3 mr-1" />
                    Integration Setup
                </Badge>
                <h1 className="text-3xl font-bold text-white mb-3 drop-shadow-sm">
                    Connect Your Integrations
                </h1>
                <p className="text-lg text-white/90 leading-relaxed">
                    This tool requires {requiredCount} integration{requiredCount !== 1 ? "s" : ""} to
                    function. Connect the required services below to get started.
                </p>

                {/* Progress */}
                <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm text-white/80">
                        <span>Setup Progress</span>
                        <span className="font-semibold">
                            {connectedCount} / {integrations.length}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-white rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${(connectedCount / integrations.length) * 100}%`,
                            }}
                        />
                    </div>
                </div>
            </>
        );
    };

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="min-h-screen flex">
            {/* Left Panel — Brand gradient */}
            <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-[#ff9900] via-[#e88800] to-[#cc7700] flex-col justify-between p-12 relative overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-sm" />
                    <div className="absolute top-1/2 -left-12 w-64 h-64 bg-white/5 rounded-full" />
                    <div className="absolute bottom-24 right-1/4 w-32 h-32 bg-white/10 rounded-full blur-sm" />
                    <div
                        className="absolute inset-0 opacity-5"
                        style={{
                            backgroundImage:
                                "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)",
                            backgroundSize: "20px 20px",
                        }}
                    />
                </div>

                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 h-20 w-20 relative z-10">
                    <img src="/salesduologo.svg" alt="SalesDuo" className="drop-shadow-lg" />
                </Link>

                {/* Dynamic content */}
                <div className="relative z-10 space-y-6">{leftPanelContent()}</div>

                {/* Trust signals */}
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-6 pt-4 border-t border-white/15">
                        <div className="flex items-center gap-2 text-white/70">
                            <Shield className="h-4 w-4" />
                            <span className="text-xs">256-bit SSL</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/70">
                            <Lock className="h-4 w-4" />
                            <span className="text-xs">Encrypted Storage</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/70">
                            <Key className="h-4 w-4" />
                            <span className="text-xs">OAuth 2.0</span>
                        </div>
                    </div>
                    <p className="text-sm text-white/60">
                        © {new Date().getFullYear()} SalesDuo. All rights reserved.
                    </p>
                </div>
            </div>

            {/* Right Panel */}
            <div className="flex w-full lg:w-[55%] flex-col px-6 py-12 sm:px-12 lg:px-16 bg-background overflow-y-auto">
                <div className="mx-auto w-full max-w-lg flex-1 flex flex-col">
                    {/* Mobile logo */}
                    <div className="lg:hidden mb-8">
                        <Link to="/" className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                                <Package className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-semibold">SalesDuo</span>
                        </Link>
                    </div>

                    {/* ============================================================ */}
                    {/*  VIEW: Integration Cards (multi-integration overview)         */}
                    {/* ============================================================ */}
                    {activeId === null && (
                        <div className="space-y-6 flex-1">
                            <div>
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    Required Integrations
                                </h2>
                                <p className="mt-2 text-muted-foreground">
                                    Connect the services below to enable full functionality.
                                    {requiredCount < integrations.length &&
                                        " Optional integrations unlock extra features."}
                                </p>
                            </div>

                            {/* Step progress dots */}
                            <div className="flex items-center gap-2">
                                {integrations.map((integ, idx) => (
                                    <div key={integ.id} className="flex items-center gap-2 flex-1">
                                        <div
                                            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors shrink-0 ${statuses[integ.id] === "connected"
                                                    ? "bg-green-500 text-white"
                                                    : "bg-muted text-muted-foreground"
                                                }`}
                                        >
                                            {statuses[integ.id] === "connected" ? (
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                            ) : (
                                                idx + 1
                                            )}
                                        </div>
                                        {idx < integrations.length - 1 && (
                                            <div
                                                className={`h-0.5 flex-1 rounded-full transition-colors ${statuses[integ.id] === "connected"
                                                        ? "bg-green-500"
                                                        : "bg-border"
                                                    }`}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Integration cards */}
                            <div className="space-y-3">
                                {integrations.map(integ => {
                                    const status = statuses[integ.id];
                                    const isConnected = status === "connected";

                                    return (
                                        <Card
                                            key={integ.id}
                                            className={`transition-all duration-200 ${isConnected
                                                    ? "border-green-200 bg-green-50/50"
                                                    : "hover:border-primary/30 hover:shadow-md cursor-pointer"
                                                }`}
                                            onClick={
                                                !isConnected
                                                    ? () => setActiveId(integ.id)
                                                    : undefined
                                            }
                                        >
                                            <CardContent className="flex items-center gap-4 py-4 px-5">
                                                <div
                                                    className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 transition-colors ${isConnected
                                                            ? "bg-green-100 text-green-600"
                                                            : "bg-primary/10 text-primary"
                                                        }`}
                                                >
                                                    {isConnected ? (
                                                        <CheckCircle2 className="h-5 w-5" />
                                                    ) : (
                                                        integ.icon
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-medium text-sm">
                                                            {integ.name}
                                                        </h3>
                                                        {integ.required ? (
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-[10px] px-1.5 py-0"
                                                            >
                                                                Required
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className="text-[10px] px-1.5 py-0 text-muted-foreground"
                                                            >
                                                                Optional
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                        {integ.description}
                                                    </p>
                                                </div>

                                                {isConnected ? (
                                                    <Badge className="bg-green-500/10 text-green-700 border-green-500/20 shrink-0">
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                                        Connected
                                                    </Badge>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="shrink-0"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setActiveId(integ.id);
                                                        }}
                                                    >
                                                        <Plug className="h-3.5 w-3.5 mr-1.5" />
                                                        Connect
                                                    </Button>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>

                            {/* Mobile progress info */}
                            <div className="lg:hidden">
                                <Card className="border-primary/20 bg-primary/5">
                                    <CardContent className="flex items-center justify-between py-3 px-4">
                                        <span className="text-sm text-muted-foreground">
                                            Progress
                                        </span>
                                        <span className="text-sm font-semibold">
                                            {connectedCount} / {integrations.length} connected
                                        </span>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Complete button */}
                            <Button
                                onClick={handleComplete}
                                className="w-full h-11"
                                disabled={!allRequiredConnected}
                            >
                                {allRequiredConnected ? (
                                    <>
                                        Complete Setup & Return
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                ) : (
                                    <>
                                        <Lock className="mr-2 h-4 w-4" />
                                        Connect Required Integrations to Continue
                                    </>
                                )}
                            </Button>

                            {!allRequiredConnected && (
                                <p className="text-center text-xs text-muted-foreground">
                                    {requiredCount - integrations.filter(i => i.required && statuses[i.id] === "connected").length}{" "}
                                    required integration
                                    {requiredCount -
                                        integrations.filter(
                                            i => i.required && statuses[i.id] === "connected"
                                        ).length !==
                                        1
                                        ? "s"
                                        : ""}{" "}
                                    remaining
                                </p>
                            )}
                        </div>
                    )}

                    {/* ============================================================ */}
                    {/*  VIEW: Connect form for a specific integration                */}
                    {/* ============================================================ */}
                    {activeId !== null && activeIntegration && statuses[activeId] !== "connected" && (
                        <div className="space-y-6 flex-1">
                            {/* Back button (only in multi mode) */}
                            {integrations.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setActiveId(null)}
                                    className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                                    Back to integrations
                                </button>
                            )}

                            {/* Header */}
                            <div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                                        {activeIntegration.icon}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-semibold tracking-tight">
                                            Connect {activeIntegration.shortName}
                                        </h2>
                                        {activeIntegration.required && (
                                            <Badge
                                                variant="secondary"
                                                className="text-[10px] px-1.5 py-0 mt-0.5"
                                            >
                                                Required
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Enter your API credentials to securely link this service. Your
                                    data is encrypted and never shared.
                                </p>
                            </div>

                            {/* Credential form */}
                            <form onSubmit={handleConnect} className="space-y-5">
                                {activeIntegration.fields.map(field => (
                                    <div key={field.key} className="space-y-2">
                                        <Label htmlFor={`${activeId}-${field.key}`}>
                                            {field.label}
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id={`${activeId}-${field.key}`}
                                                type={
                                                    field.secret &&
                                                        !showSecrets[`${activeId}-${field.key}`]
                                                        ? "password"
                                                        : "text"
                                                }
                                                placeholder={field.placeholder}
                                                value={
                                                    credentials[activeId]?.[field.key] ?? ""
                                                }
                                                onChange={e =>
                                                    updateField(activeId, field.key, e.target.value)
                                                }
                                                className={field.secret ? "pr-10" : ""}
                                                required
                                            />
                                            {field.secret && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleSecret(`${activeId}-${field.key}`)
                                                    }
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {showSecrets[`${activeId}-${field.key}`] ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        {field.hint && (
                                            <p className="text-xs text-muted-foreground">
                                                {field.hint}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                <Button
                                    type="submit"
                                    className="w-full h-11"
                                    disabled={loading || !isFormComplete(activeId)}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        <>
                                            <Key className="mr-2 h-4 w-4" />
                                            Connect {activeIntegration.shortName}
                                        </>
                                    )}
                                </Button>
                            </form>

                            {/* Security footer */}
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                                <Lock className="h-3 w-3" />
                                <span>
                                    Credentials are encrypted end-to-end and stored securely.
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ============================================================ */}
                    {/*  VIEW: Single-integration success (only when 1 integration)   */}
                    {/* ============================================================ */}
                    {activeId !== null &&
                        integrations.length === 1 &&
                        statuses[activeId] === "connected" && (
                            <div className="space-y-8 flex-1 flex flex-col justify-center">
                                <div className="text-center space-y-4">
                                    <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center relative">
                                        <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20" />
                                        <CheckCircle2 className="h-10 w-10 text-green-600 relative z-10" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-semibold tracking-tight">
                                            Successfully Connected!
                                        </h2>
                                        <p className="mt-2 text-muted-foreground">
                                            Your integration is active. Data synchronization will
                                            begin shortly.
                                        </p>
                                    </div>
                                </div>

                                <Card className="border-green-200 bg-green-50/50">
                                    <CardContent className="py-4 space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Status</span>
                                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                Active
                                            </Badge>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                Integration
                                            </span>
                                            <span className="font-medium">
                                                {integrations[0].name}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Button
                                    onClick={handleComplete}
                                    className="w-full h-11"
                                    size="lg"
                                >
                                    Return to App
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </div>
                        )}

                    {/* Footer */}
                    <p className="text-center text-xs text-muted-foreground mt-10 pb-4">
                        Secured by{" "}
                        <span className="font-medium text-foreground">SalesDuo Infra</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
