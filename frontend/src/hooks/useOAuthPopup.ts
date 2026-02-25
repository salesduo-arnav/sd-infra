import { useEffect, useRef, useCallback } from "react";
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
    timeoutMs?: number;
}

export const useOAuthPopup = () => {
    // Keep track of active cleanups to run on unmount (Issue #1, #2)
    const activeCleanups = useRef<Set<() => void>>(new Set());

    useEffect(() => {
        // Run all cleanups on unmount
        const cleanups = activeCleanups.current;
        return () => {
            cleanups.forEach(cleanup => cleanup());
            cleanups.clear();
        };
    }, []);

    const openOAuthPopup = useCallback(({
        orgId,
        accountId,
        url,
        title,
        width,
        height,
        successType,
        errorType,
        timeoutMs = 120000,
    }: OAuthPopupOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;

            const popup = window.open(
                url,
                title,
                `width=${width},height=${height},top=${top},left=${left}`
            );

            // Issue #4: Popup blocker detection
            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
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
                activeCleanups.current.delete(cleanup);
            };
            activeCleanups.current.add(cleanup);

            const doResolve = (result: boolean) => {
                cleanup();
                resolve(result);
            };

            // Listener for postMessage (Immediate feedback)
            const handleMessage = async (event: MessageEvent) => {
                if (event.data?.type === successType) {
                    console.log(`[Frontend] ${title} Auth Success:`, event.data);

                    // Issue #10: Verify connection status before resolving
                    try {
                        const accounts = await getIntegrationAccounts(orgId);
                        const updatedAccount = accounts.find((a) => a.id === accountId);
                        if (updatedAccount?.status === "connected") {
                            doResolve(true);
                        } else {
                            toast.error(`Backend verification failed for ${title}`);
                            doResolve(false);
                        }
                    } catch (e) {
                        doResolve(true); // Fallback to true if API fails but we got success message
                    }
                } else if (event.data?.type === errorType) {
                    console.error(`[Frontend] ${title} Auth Error:`, event.data);
                    toast.error(event.data?.message || `Failed to connect ${title}`);
                    doResolve(false);
                }
            };

            window.addEventListener("message", handleMessage);

            // Polling fallback (Robustness)
            const pollInterval = setInterval(async () => {
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

            // Timeout
            const timeoutId = setTimeout(() => {
                doResolve(false);
            }, timeoutMs);

            // Popup Closed Monitor
            const checkPopup = setInterval(() => {
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
    }, []);

    return { openOAuthPopup };
};
