import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { Mail, KeyRound, ArrowLeft, Loader2 } from "lucide-react";

type LoginMode = "password" | "otp";
type OtpState = "idle" | "sent" | "verifying";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const { login, sendLoginOtp, verifyLoginOtp, isLoading } = useAuth();
  const navigate = useNavigate();

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Invalid email or password");
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    try {
      await sendLoginOtp(email);
      setOtpState("sent");
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
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
      setOtpState("verifying");
      await verifyLoginOtp(email, otp);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid OTP");
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
      title="Welcome back"
      subtitle="Enter your credentials to access your account"
    >
      <div className="space-y-5">
        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-muted/25 p-1">
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
            Login with OTP
          </button>
        </div>

        {/* Password Login Form */}
        {loginMode === "password" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
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
                  Signing in...
                </>
              ) : (
                "Sign in"
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
                  <Label htmlFor="otp-email">Email Address</Label>
                  <Input
                    id="otp-email"
                    type="email"
                    placeholder="name@example.com"
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
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send OTP
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
                  Change email
                </button>

                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium">Check your email</h3>
                  <p className="text-sm text-muted-foreground">
                    We've sent a 6-digit OTP to{" "}
                    <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-center block">Enter OTP</Label>
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
                        Verifying...
                      </>
                    ) : (
                      "Verify & Sign in"
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Didn't receive the code?{" "}
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isLoading}
                      className="text-primary hover:underline disabled:opacity-50"
                    >
                      Resend OTP
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
              Or continue with
            </span>
          </div>
        </div>

        <GoogleButton
          isLoading={isLoading}
          onSuccess={() => navigate("/dashboard")}
        />

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
