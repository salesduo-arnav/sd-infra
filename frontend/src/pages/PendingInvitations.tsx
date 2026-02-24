import { useEffect, useState } from "react";
import { useAuth, Invitation } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Trash2, Undo2, Mail } from "lucide-react";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";
import { hasRedirectContext } from "@/lib/redirectContext";

export default function PendingInvitations() {
    const { user, checkPendingInvites, acceptInvite, declineInvite, refreshUser } = useAuth();
    const [invites, setInvites] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [acceptedIds, setAcceptedIds] = useState<string[]>([]);
    const [declinedIds, setDeclinedIds] = useState<string[]>([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        const fetchInvites = async () => {
            try {
                const data = await checkPendingInvites();
                setInvites(data);
                if (data.length === 0) {
                    // No pending invites — continue to appropriate destination
                    if (hasRedirectContext()) {
                        navigate("/integration-onboarding", { replace: true });
                    } else {
                        navigate('/apps');
                    }
                }
            } catch (err) {
                console.error(err);
                setError("Failed to load invitations");
            } finally {
                setLoading(false);
            }
        };
        fetchInvites();
    }, [checkPendingInvites, navigate]);

    const handleAction = (inviteId: string, action: 'accept' | 'decline' | 'undo') => {
        if (action === 'accept') {
            setAcceptedIds(prev => [...prev, inviteId]);
            setDeclinedIds(prev => prev.filter(id => id !== inviteId));
        } else if (action === 'decline') {
            setDeclinedIds(prev => [...prev, inviteId]);
            setAcceptedIds(prev => prev.filter(id => id !== inviteId));
        } else {
            // Undo
            setAcceptedIds(prev => prev.filter(id => id !== inviteId));
            setDeclinedIds(prev => prev.filter(id => id !== inviteId));
        }
    };

    const handleContinue = async () => {
        try {
            setProcessing(true);
            setError("");

            const invitesToAccept = invites.filter(inv => acceptedIds.includes(inv.id));
            const invitesToDecline = invites.filter(inv => declinedIds.includes(inv.id));

            // Process accepts
            if (invitesToAccept.length > 0) {
                await Promise.all(invitesToAccept.map(invite => acceptInvite(invite.token)));
            }

            // Process declines
            if (invitesToDecline.length > 0) {
                await Promise.all(invitesToDecline.map(invite => declineInvite(invite.token)));
            }

            // Check if user now has an org after accepting invites
            const hasOrg = user?.memberships && user.memberships.length > 0;

            if (!hasOrg) {
                // Still no org — must create one first
                navigate("/create-organisation");
                return;
            }

            // Has org — if external redirect, go through integration onboarding
            if (hasRedirectContext()) {
                navigate("/integration-onboarding", { replace: true });
                return;
            }
            navigate('/apps');
        } catch (error) {
            console.error(error);
            setError("Failed to process some invitations. Please try again.");
            setProcessing(false);
        }
    };

    const leftContent = (
        <div className="relative z-10 w-full">
            <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-sm">
                Join Your Team
            </h1>
            <p className="text-lg text-white/90">
                Collaborate with your organization members and access shared resources.
            </p>
        </div>
    );

    if (loading) {
        return (
            <SplitScreenLayout leftContent={leftContent}>
                <div className="mb-8">
                    <h2 className="text-2xl font-semibold tracking-tight">Checking Invitations</h2>
                    <p className="mt-2 text-muted-foreground">Please wait...</p>
                </div>
                <div className="flex justify-center p-8">Loading...</div>
            </SplitScreenLayout>
        );
    }

    if (invites.length === 0) {
        return null;
    }

    return (
        <SplitScreenLayout leftContent={leftContent}>
            <div className="mb-8">
                <h2 className="text-2xl font-semibold tracking-tight">Pending Invitations</h2>
                <p className="mt-2 text-muted-foreground">You have been invited to join these organizations.</p>
            </div>

            <div className="space-y-4">
                {error && <p className="text-sm text-red-500">{error}</p>}

                {invites.map(invite => {
                    const isAccepted = acceptedIds.includes(invite.id);
                    const isDeclined = declinedIds.includes(invite.id);

                    return (
                        <Card key={invite.id} className={isAccepted ? "border-green-500 bg-green-50/50" : isDeclined ? "border-destructive/50 bg-destructive/5 opacity-70" : ""}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg">{invite.organization.name}</CardTitle>
                                        <CardDescription>Role: {invite.role.name}</CardDescription>
                                    </div>
                                    {isAccepted && <Check className="h-5 w-5 text-green-600" />}
                                    {isDeclined && <Trash2 className="h-5 w-5 text-destructive" />}
                                </div>
                            </CardHeader>
                            <CardFooter>
                                {isAccepted ? (
                                    <Button
                                        onClick={() => handleAction(invite.id, 'undo')}
                                        variant="outline"
                                        className="w-full text-muted-foreground border-dashed"
                                    >
                                        <Undo2 className="mr-2 h-4 w-4" />
                                        Undo Accept
                                    </Button>
                                ) : isDeclined ? (
                                    <Button
                                        onClick={() => handleAction(invite.id, 'undo')}
                                        variant="outline"
                                        className="w-full text-muted-foreground border-dashed"
                                    >
                                        <Undo2 className="mr-2 h-4 w-4" />
                                        Undo Decline
                                    </Button>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 w-full">
                                        <Button
                                            onClick={() => handleAction(invite.id, 'accept')}
                                            className="bg-none bg-green-500/70 hover:bg-green-500/90 text-white"
                                        >
                                            Accept
                                        </Button>
                                        <Button
                                            onClick={() => handleAction(invite.id, 'decline')}
                                            className="bg-none bg-red-500/70 hover:bg-red-500/90 text-white"
                                        >
                                            Decline
                                        </Button>
                                    </div>
                                )}
                            </CardFooter>
                        </Card>
                    );
                })}

                <div className="pt-4 space-y-3">
                    <Button
                        onClick={handleContinue}
                        className="w-full"
                        disabled={processing}
                    >
                        {processing ? "Processing..." : "Continue"}
                    </Button>
                </div>
            </div>
        </SplitScreenLayout>
    );
}
