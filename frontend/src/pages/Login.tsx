import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth, User } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { Mail, KeyRound, ArrowLeft, Loader2 } from "lucide-react";
import { captureRedirectContext, hasRedirectContext } from "@/lib/redirectContext";
import { useTranslation } from 'react-i18next';

type LoginMode = "password" | "otp";
type OtpState = "idle" | "sent" | "verifying";

export default function Login() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");

  // Capture redirect context from URL params into sessionStorage (idempotent)
  captureRedirectContext(searchParams);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [resendCooldown, setResendCooldown] = useState(0);
  const { login, sendLoginOtp, verifyLoginOtp, isLoading, checkPendingInvites, switchOrganization } = useAuth();
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

  const handleAuthSuccess = async (loggedInUser: User | void) => {
    // Check for invites first
    try {
      const pending = await checkPendingInvites();
      if (pending && pending.length > 0) {
        navigate("/pending-invites");
        return;
      }
    } catch (e) {
      console.error(e);
    }

    if (!loggedInUser) return;

    // No memberships — must create org first
    if (!loggedInUser.memberships || loggedInUser.memberships.length === 0) {
      navigate("/create-organisation");
      return;
    }

    // Auto-select if user has exactly 1 org — skip the chooser
    if (loggedInUser.memberships.length === 1) {
      switchOrganization(loggedInUser.memberships[0].organization.id);
      if (hasRedirectContext()) {
        navigate("/integration-onboarding");
        return;
      }
      navigate("/apps");
      return;
    }

    // Multiple orgs — go to chooser
    navigate("/choose-organisation");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const loggedInUser = await login(email, password, inviteToken || undefined);
      await handleAuthSuccess(loggedInUser);
    } catch (err) {
      setError(t('auth.invalidCredentials'));
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resendCooldown > 0) return;
    setError("");
    if (!email) {
      setError(t('auth.pleaseEnterEmail'));
      return;
    }
    try {
      await sendLoginOtp(email);
      setOtpState("sent");
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || t('auth.failedToSendOtp'));
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
      setOtpState("verifying");
      const loggedInUser = await verifyLoginOtp(email, otp);
      await handleAuthSuccess(loggedInUser);
    } catch (err) {
      setError(err.message || t('auth.invalidOtp'));
      setOtpState("sent");
    }
  };

  const handleModeSwitch = (mode: LoginMode) => {
    setLoginMode(mode);
    setError("");
    setOtp("");
    setOtpState("idle");
  };

  const handleBackToEmail = () => {
    setOtpState("idle");
    setOtp("");
    setError("");
  };

  return (
    <AuthLayout
      title={t('auth.welcomeBack')}
      subtitle={t('auth.enterCredentials')}
    >
      <div className="space-y-5">
        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => handleModeSwitch("password")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${loginMode === "password"
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <KeyRound className="h-4 w-4" />
            Password
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("otp")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${loginMode === "otp"
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <Mail className="h-4 w-4" />
            {t('auth.loginWithOtp')}
          </button>
        </div>

        {/* Password Login Form */}
        {loginMode === "password" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailAddress')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('auth.signingIn')}
                </>
              ) : (
                t('auth.signIn')
              )}
            </Button>
          </form>
        )}

        {/* OTP Login Form */}
        {loginMode === "otp" && (
          <>
            {otpState === "idle" && (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="otp-email">{t('auth.emailAddress')}</Label>
                  <Input
                    id="otp-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('auth.sendingOtp')}
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      {t('auth.sendOtp')}
                    </>
                  )}
                </Button>
              </form>
            )}

            {(otpState === "sent" || otpState === "verifying") && (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t('auth.changeEmail')}
                </button>

                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium">{t('auth.checkYourEmail')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('auth.otpSentTo')}{" "}
                    <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-center block">{t('auth.enterOtp')}</Label>
                    <OtpInput
                      value={otp}
                      onChange={setOtp}
                      disabled={otpState === "verifying"}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {otpState === "verifying" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('auth.verifying')}
                      </>
                    ) : (
                      t('auth.verifySignIn')
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    {t('auth.didntReceiveCode')}{" "}
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isLoading || resendCooldown > 0}
                      className="text-primary hover:underline disabled:opacity-50"
                    >
                      {resendCooldown > 0 ? t('auth.resendIn', { seconds: resendCooldown }) : t('auth.resendOtp')}
                    </button>
                  </p>
                </form>
              </div>
            )}
          </>
        )}

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
          onSuccess={handleAuthSuccess}
        />

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.dontHaveAccount')}{" "}
          <Link to="/signup" className="text-primary hover:underline">
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
