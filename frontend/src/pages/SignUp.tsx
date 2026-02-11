import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SignupState = "form" | "otp-sent" | "verifying";

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const inviteEmail = searchParams.get("email");
  const inviteToken = searchParams.get("token");
  const redirectUrl = searchParams.get("redirect");
  const appParam = searchParams.get("app");

  const params = new URLSearchParams();
  if (redirectUrl) params.set("redirect", redirectUrl);
  if (appParam) params.set("app", appParam);

  const redirectSuffix = params.toString() ? `?${params.toString()}` : "";

  // Personal info
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(inviteEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [signupState, setSignupState] = useState<SignupState>("form");
  const [showOtpModal, setShowOtpModal] = useState(false);

  const { sendSignupOtp, verifySignupOtp, isLoading, checkPendingInvites } = useAuth();
  const navigate = useNavigate();

  const handleAuthSuccess = async (user: User | void) => {
    // Check for pending invites (always check, regardless of how they signed up)
    try {
      const pending = await checkPendingInvites();
      if (pending && pending.length > 0) {
        navigate(`/pending-invites${redirectSuffix}`);
        return;
      }
    } catch (e) {
      console.error("Error checking invites", e);
    }

    if (!user) return;

    // If there's an external redirect, go there
    if (redirectUrl) {
      const url = new URL(redirectUrl);
      url.searchParams.set("auth_success", "true");
      window.location.href = url.toString();
      return;
    }

    // Default flow — check if user has organizations
    const hasOrg = (user.memberships && user.memberships.length > 0);

    if (hasOrg) {
      navigate("/apps");
    } else {
      navigate(`/create-organisation${redirectSuffix}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!acceptTerms) {
      setError("Please accept the terms and conditions");
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
      setError("Please enter the complete 6-digit OTP");
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
    setError("");
    setOtp("");
    try {
      await sendSignupOtp({
        full_name: fullName,
        email,
        password,
        token: inviteToken || undefined,
      });
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
      title="Create an account"
      subtitle="Create an account to get started"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Personal Information Section */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
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
              <Label htmlFor="password">Password</Label>
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
              <Label htmlFor="confirmPassword">Confirm Password</Label>
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

        <div className="flex items-center space-x-2">
          <Checkbox
            id="terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
          />
          <label
            htmlFor="terms"
            className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            I agree to the{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </label>
        </div>

        {error && !showOtpModal && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && signupState === "form" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending verification...
            </>
          ) : (
            "Create account"
          )}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
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
          Already have an account?{" "}
          <Link to={`/login${redirectSuffix}`} className="text-primary hover:underline">
            Sign in
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
            <DialogTitle className="text-center">Verify your email</DialogTitle>
            <DialogDescription className="text-center">
              We've sent a 6-digit verification code to{" "}
              <span className="font-medium text-foreground">{email}</span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleVerifyOtp} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-center block">Enter verification code</Label>
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
                    Creating account...
                  </>
                ) : (
                  "Verify & Create Account"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Didn't receive the code?{" "}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isLoading}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </p>

              <button
                type="button"
                onClick={handleCloseModal}
                className="w-full flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to sign up
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
