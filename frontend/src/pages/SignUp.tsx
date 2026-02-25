import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth, User } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { Check, X, Lock, Mail, ArrowLeft, Loader2 } from "lucide-react";
import { captureRedirectContext, hasRedirectContext } from "@/lib/redirectContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';

type SignupState = "form" | "otp-sent" | "verifying";

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const inviteEmail = searchParams.get("email");
  const inviteToken = searchParams.get("token");

  // Capture redirect context from URL params into sessionStorage (idempotent)
  captureRedirectContext(searchParams);

  // Personal info
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(inviteEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [signupState, setSignupState] = useState<SignupState>("form");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { sendSignupOtp, verifySignupOtp, isLoading, checkPendingInvites, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Handle Resend Cooldown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleAuthSuccess = async (user: User | void) => {
    // Check for pending invites (always check, regardless of how they signed up)
    try {
      const pending = await checkPendingInvites();
      if (pending && pending.length > 0) {
        navigate(`/pending-invites`);
        return;
      }
    } catch (e) {
      console.error("Error checking invites", e);
    }

    if (!user) return;

    // Check if user has organizations FIRST — org is required before anything else
    const hasOrg = (user.memberships && user.memberships.length > 0);

    if (!hasOrg) {
      navigate("/create-organisation");
      return;
    }

    // Has org — if external redirect, route through integration onboarding
    if (hasRedirectContext()) {
      if (user.memberships!.length === 1) {
        switchOrganization(user.memberships![0].organization.id);
      }
      navigate("/integration-onboarding");
      return;
    }

    navigate("/apps");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Password Policy Check
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      setError(t('auth.weakPasswordDescription'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    try {
      // Send OTP to verify email
      await sendSignupOtp({
        full_name: fullName,
        email,
        password,
        token: inviteToken || undefined,
      });
      setSignupState("otp-sent");
      setShowOtpModal(true);
    } catch (err) {
      setError(err.message || "Failed to send verification code");
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (otp.length !== 6) {
      setError(t('auth.pleaseEnterCompleteOtp'));
      return;
    }

    try {
      setSignupState("verifying");
      const user = await verifySignupOtp(email, otp);
      setShowOtpModal(false);
      await handleAuthSuccess(user);
    } catch (err) {
      setError(err.message || "Invalid OTP");
      setSignupState("otp-sent");
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setOtp("");
    try {
      await sendSignupOtp({
        full_name: fullName,
        email,
        password,
        token: inviteToken || undefined,
      });
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || "Failed to resend OTP");
    }
  };

  const handleCloseModal = () => {
    setShowOtpModal(false);
    setSignupState("form");
    setOtp("");
    setError("");
  };

  return (
    <AuthLayout
      title={t('auth.createAccount')}
      subtitle={t('auth.createAccountSubtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Personal Information Section */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullName">{t('auth.fullName')}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={t('auth.fullNamePlaceholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!inviteEmail}
                className={inviteEmail ? "bg-muted pr-10" : ""}
                required
              />
              {inviteEmail && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={
                    confirmPassword
                      ? password === confirmPassword
                        ? "border-green-500 focus-visible:ring-green-500 pr-10"
                        : "border-red-500 focus-visible:ring-red-500 pr-10"
                      : ""
                  }
                  required
                />
                {confirmPassword && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    {password === confirmPassword ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && !showOtpModal && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && signupState === "form" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('auth.signingUp')}
            </>
          ) : (
            t('auth.createAccount')
          )}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {t('auth.orContinueWith')}
            </span>
          </div>
        </div>

        <GoogleButton
          isLoading={isLoading}
          text="Sign up with Google"
          onSuccess={handleAuthSuccess}
          inviteToken={inviteToken}
        />

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.alreadyHaveAccount')}{" "}
          <Link to="/login" className="text-primary hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </form>

      {/* OTP Verification Modal */}
      <Dialog open={showOtpModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>
            <DialogTitle className="text-center">{t('auth.verifyEmail')}</DialogTitle>
            <DialogDescription className="text-center">
              {t('auth.verifyEmailDescription')}{" "}
              <span className="font-medium text-foreground">{email}</span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleVerifyOtp} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-center block">{t('auth.enterVerificationCode')}</Label>
              <OtpInput
                value={otp}
                onChange={setOtp}
                disabled={signupState === "verifying"}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <div className="space-y-3">
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || otp.length !== 6}
              >
                {signupState === "verifying" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('auth.verifyingEmail')}
                  </>
                ) : (
                  t('auth.verifyEmail_button')
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {t('auth.didntReceiveCode')}{" "}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isLoading || resendCooldown > 0}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  {resendCooldown > 0 ? t('auth.resendCodeIn', { seconds: resendCooldown }) : t('auth.resendCode')}
                </button>
              </p>

              <button
                type="button"
                onClick={handleCloseModal}
                className="w-full flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('common.back')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
