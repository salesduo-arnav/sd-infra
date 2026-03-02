import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Building2, ArrowRight, Mail } from "lucide-react";
import { API_URL } from "@/lib/api";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";
import { useTranslation } from 'react-i18next';

export default function InviteAccepted() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [inviteDetails, setInviteDetails] = useState<{
    email: string;
    organization_name: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState(t('pages.inviteAccepted.invalidOrExpired'));

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(`${API_URL}/invitations/validate?token=${token}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to validate invitation");
        }
        const data = await res.json();
        setInviteDetails(data);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        if (err instanceof Error) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg("Failed to validate invitation");
        }
      }
    };

    validateToken();
  }, [token]);

  const { isAuthenticated, refreshUser } = useAuth();

  const handleContinue = async () => {
    if (!inviteDetails || !token) return;

    if (isAuthenticated) {
      // User is already logged in, accept invite directly
      try {
        const res = await fetch(`${API_URL}/invitations/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to accept");
        }

        await refreshUser();
        navigate("/apps");
      } catch (e) {
        if (e instanceof Error) {
          // If already a member, just redirect
          if (e.message === 'Already a member') {
            navigate("/apps");
            return;
          }
          setErrorMsg(e.message);
        } else {
          setErrorMsg("Failed to accept invitation");
        }
        setStatus("error");
      }
    } else {
      // Not logged in, go to signup
      navigate(`/signup?email=${encodeURIComponent(inviteDetails.email)}&token=${token}`);
    }
  };

  const leftContent = (
    <div className="relative z-10 w-full">
      <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-sm">
        {t('pages.inviteAccepted.leftTitle')}
      </h1>
      <p className="text-lg text-white/90">
        {t('pages.inviteAccepted.leftSubtitle')}
      </p>
    </div>
  );

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-r from-[#ff9900] to-[#e88800] flex items-center justify-center shadow-lg animate-pulse">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
          <p className="text-muted-foreground">{t('pages.inviteAccepted.validating')}</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <SplitScreenLayout leftContent={leftContent}>
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">{t('pages.inviteAccepted.invalidTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('pages.inviteAccepted.invalidSubtitle')}</p>
        </div>

        <div className="flex flex-col items-center justify-center space-y-6 py-8">
          <div className="h-20 w-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>

          <div className="text-center space-y-2">
            <p className="text-foreground font-medium">{t('pages.inviteAccepted.unableToProcess')}</p>
            <p className="text-muted-foreground text-sm max-w-sm">{errorMsg}</p>
          </div>

          <div className="w-full space-y-3 pt-4">
            <Button variant="outline" className="w-full h-11" asChild>
              <Link to="/login">{t('pages.inviteAccepted.goToLogin')}</Link>
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('pages.inviteAccepted.needHelp')}{" "}
              <Link to="/contact" className="text-primary hover:underline">
                {t('pages.inviteAccepted.contactSupport')}
              </Link>
            </p>
          </div>
        </div>
      </SplitScreenLayout>
    );
  }

  return (
    <SplitScreenLayout leftContent={leftContent}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">{t('pages.inviteAccepted.youreInvited')}</h2>
        <p className="mt-2 text-muted-foreground">{t('pages.inviteAccepted.joinTeam', { org: inviteDetails?.organization_name || 'the team' })}</p>
      </div>

      <div className="flex flex-col items-center justify-center space-y-6 py-8">
        {/* Success Icon with animation */}
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-r from-[#ff9900] to-[#e88800] flex items-center justify-center shadow-lg">
            <CheckCircle className="h-10 w-10 text-white" />
          </div>
          {/* Decorative ring */}
          <div className="absolute inset-0 rounded-2xl border-4 border-[#ff9900]/20 -m-2" />
        </div>

        {/* Organization info card */}
        <div className="w-full p-4 rounded-xl bg-muted/10 border border-border">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-r from-[#ff9900]/20 to-[#e88800]/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[#ff9900]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">
                {inviteDetails?.organization_name}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <span className="truncate">{inviteDetails?.email}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-muted-foreground">
            {t('pages.inviteAccepted.createAccountToJoin')}
          </p>
        </div>

        <div className="w-full space-y-3 pt-2">
          <Button className="w-full h-11 text-base" onClick={handleContinue}>
            {isAuthenticated ? t('pages.inviteAccepted.joinOrganization') : t('pages.inviteAccepted.continueToSignUp')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.alreadyHaveAccount')}{" "}
            <Link to={`/login?token=${token}`} className="text-primary hover:underline font-medium">
              {t('pages.inviteAccepted.signInInstead')}
            </Link>
          </p>
        </div>
      </div>
    </SplitScreenLayout>
  );
}
