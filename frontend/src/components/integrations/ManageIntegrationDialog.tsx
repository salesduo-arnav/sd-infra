
import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Store,
    Building2,
    BarChart3,
    Plus,
    Unplug,
    Trash2,
    Loader2,
    Plug,
    ExternalLink,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { IntegrationAccount } from "@/services/integration.service";

interface ManageIntegrationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    groupName: string;
    regionName: string;
    regionFlag: string;
    accounts: IntegrationAccount[];
    onAddAccount: (type: string) => Promise<void>;
    onConnect: (account: IntegrationAccount) => Promise<boolean>;
    onDisconnect: (account: IntegrationAccount) => Promise<void>;
    onDelete: (account: IntegrationAccount) => Promise<void>;
}

const INTEGRATION_TYPES = [
    {
        key: "sp_api_sc",
        label: "Seller Central",
        description: "Orders, Inventory, FBA",
        icon: Store,
    },
    {
        key: "sp_api_vc",
        label: "Vendor Central",
        description: "Purchase Orders, Invoices",
        icon: Building2,
    },
    {
        key: "ads_api",
        label: "Advertising API",
        description: "PPC Campaigns, Performance",
        icon: BarChart3,
    },
];

export function ManageIntegrationDialog({
    isOpen,
    onClose,
    groupName,
    regionName,
    regionFlag,
    accounts,
    onAddAccount,
    onConnect,
    onDisconnect,
    onDelete,
}: ManageIntegrationDialogProps) {
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    const handleAction = async (actionId: string, action: () => Promise<unknown>) => {
        setLoadingAction(actionId);
        try {
            await action();
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingAction(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "connected":
                return (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                    </Badge>
                );
            case "error":
                return (
                    <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Error
                    </Badge>
                );
            default:
                return <Badge variant="secondary">Disconnected</Badge>;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Manage Integrations for {groupName}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2">
                        <span className="text-base">{regionFlag}</span>
                        <span>{regionName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {INTEGRATION_TYPES.map((type) => {
                        const account = accounts.find((a) => a.integration_type === type.key);
                        const isPresent = !!account;
                        const isConnected = account?.status === "connected";
                        const isLoading = loadingAction?.startsWith(type.key);

                        const hasSC = accounts.some(a => a.integration_type === "sp_api_sc");
                        const hasVC = accounts.some(a => a.integration_type === "sp_api_vc");

                        const isDisabledMutual =
                            (!isPresent && type.key === "sp_api_sc" && hasVC) ||
                            (!isPresent && type.key === "sp_api_vc" && hasSC);

                        return (
                            <div
                                key={type.key}
                                className="flex items-center justify-between p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                                style={{ opacity: isLoading || isDisabledMutual ? 0.7 : 1 }}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-2 rounded-lg bg-orange-50 text-orange-600`}>
                                        <type.icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium flex items-center gap-2">
                                            {type.label}
                                            {isPresent && account && getStatusBadge(account.status)}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">{type.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {!isPresent ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleAction(`${type.key}-add`, () => onAddAccount(type.key))}
                                            disabled={!!loadingAction || isDisabledMutual}
                                            title={isDisabledMutual ? "An Amazon entity cannot have both Seller and Vendor Central on the same account group." : ""}
                                        >
                                            {loadingAction === `${type.key}-add` ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <Plus className="h-4 w-4 mr-2" />
                                            )}
                                            Enable
                                        </Button>
                                    ) : (
                                        <>
                                            {isConnected ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() =>
                                                        handleAction(`${type.key}-disconnect`, () => onDisconnect(account!))
                                                    }
                                                    disabled={!!loadingAction}
                                                    title="Disconnect"
                                                >
                                                    {loadingAction === `${type.key}-disconnect` ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Unplug className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleAction(`${type.key}-connect`, () => onConnect(account!))
                                                    }
                                                    disabled={!!loadingAction}
                                                >
                                                    {loadingAction === `${type.key}-connect` ? (
                                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    ) : (
                                                        <Plug className="h-4 w-4 mr-2" />
                                                    )}
                                                    Connect
                                                </Button>
                                            )}

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() =>
                                                    handleAction(`${type.key}-delete`, () => onDelete(account!))
                                                }
                                                disabled={!!loadingAction}
                                                title="Delete Integration"
                                            >
                                                {loadingAction === `${type.key}-delete` ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
