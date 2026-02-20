import { getIntegrationAccounts } from "@/services/integration.service";
import { toast } from "sonner";

interface OAuthPopupOptions {
    orgId: string;
    accountId: string;
    url: string;
    title: string;
    width: number;
    height: number;
    successType: string;
    errorType: string;
}

export const useOAuthPopup = () => {
    const openOAuthPopup = ({
        orgId,
        accountId,
        url,
        title,
        width,
        height,
        successType,
        errorType,
    }: OAuthPopupOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;

            const popup = window.open(
                url,
                title,
                `width=${width},height=${height},top=${top},left=${left}`
            );

            if (!popup) {
                toast.error("Please allow popups to connect integrations.");
                resolve(false);
                return;
            }

            let isResolved = false;

            const cleanup = () => {
                if (isResolved) return;
                isResolved = true;
                window.removeEventListener("message", handleMessage);
                clearInterval(pollInterval);
                clearInterval(checkPopup);
                clearTimeout(timeoutId);
            };

            const doResolve = (result: boolean) => {
                cleanup();
                resolve(result);
            };

            // Listener for postMessage (Immediate feedback)
            const handleMessage = (event: MessageEvent) => {
                if (event.data?.type === successType) {
                    console.log(`[Frontend] ${title} Auth Success:`, event.data);
                    doResolve(true);
                } else if (event.data?.type === errorType) {
                    console.error(`[Frontend] ${title} Auth Error:`, event.data);
                    toast.error(event.data?.message || `Failed to connect ${title}`);
                    doResolve(false);
                }
            };

            window.addEventListener("message", handleMessage);

            // Polling fallback (Robustness)
            const pollInterval: NodeJS.Timeout = setInterval(async () => {
                if (!orgId) return;
                try {
                    const accounts = await getIntegrationAccounts(orgId);
                    const updatedAccount = accounts.find((a) => a.id === accountId);

                    if (updatedAccount?.status === "connected") {
                        if (!popup.closed) popup.close();
                        doResolve(true); // Success!
                    } else if (updatedAccount?.status === "error") {
                        if (!popup.closed) popup.close();
                        toast.error(`Failed to connect ${title}`);
                        doResolve(false);
                    }
                } catch (e) {
                    // ignore errors during polling
                }
            }, 2000);

            // Timeout (2 minutes)
            const timeoutId: NodeJS.Timeout = setTimeout(() => {
                doResolve(false);
            }, 120000);

            // Popup Closed Monitor
            const checkPopup: NodeJS.Timeout = setInterval(() => {
                if (popup.closed) {
                    // Give a small grace period for final poll or message
                    setTimeout(() => {
                        if (!isResolved) {
                            doResolve(false); // User closed window, likely cancelled
                        }
                    }, 2000);
                }
            }, 1000);
        });
    };

    return { openOAuthPopup };
};
