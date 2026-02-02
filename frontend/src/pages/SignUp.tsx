import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth, User } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GoogleButton } from "@/components/auth/GoogleButton";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Check, X, Lock } from "lucide-react";

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const inviteEmail = searchParams.get("email");
  const inviteToken = searchParams.get("token");

  // Personal info
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(inviteEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Organisation info
  // const [orgName, setOrgName] = useState("");
  // const [orgSize, setOrgSize] = useState("");
  // const [orgRole, setOrgRole] = useState("");
  // const [amazonSellerId, setAmazonSellerId] = useState("");

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const { signup, loginWithGoogle, isLoading, checkPendingInvites } = useAuth();
  const navigate = useNavigate();

  const handleAuthSuccess = async (user: User | void) => {
    // Check for pending invites (always check, regardless of how they signed up)
    try {
      const pending = await checkPendingInvites();
      if (pending && pending.length > 0) {
        navigate("/pending-invites");
        return;
      }
    } catch (e) {
      console.error("Error checking invites", e);
    }


    if (!user) return;

    // Default flow
    // Check if user has organizations
    const hasOrg = (user.memberships && user.memberships.length > 0);
    
    if (hasOrg) {
      navigate("/dashboard");
    } else {
      navigate("/create-organisation");
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
      const user = await signup(fullName, email, password, inviteToken || undefined);
      await handleAuthSuccess(user);
    } catch (err) {
      setError("Failed to create account");
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Create an account to get started"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Personal Information Section */}
        <div className="space-y-4">
          {/* UNCOMMENT THIS WHEN ADDING ORGANIZATION INPUTS */}
          {/* <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Personal Information
          </h3> */}
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

        {/* <Separator /> */}

        {/* Organisation Information Section */}
        {/* <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Organisation Information
          </h3>
          <div className="space-y-2">
            <Label htmlFor="orgName">Organisation Name</Label>
            <Input
              id="orgName"
              type="text"
              placeholder="Acme Sellers Inc."
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orgSize">Organisation Size</Label>
              <Select value={orgSize} onValueChange={setOrgSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Just me</SelectItem>
                  <SelectItem value="2-5">2-5 employees</SelectItem>
                  <SelectItem value="6-20">6-20 employees</SelectItem>
                  <SelectItem value="21-50">21-50 employees</SelectItem>
                  <SelectItem value="50+">50+ employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgRole">Your Role</Label>
              <Select value={orgRole} onValueChange={setOrgRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Business Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amazonSellerId">Amazon Seller ID (Optional)</Label>
            <Input
              id="amazonSellerId"
              type="text"
              placeholder="e.g., A1B2C3D4E5F6G7"
              value={amazonSellerId}
              onChange={(e) => setAmazonSellerId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You can add this later in your organisation settings
            </p>
          </div>
        </div> */}

        {/* <Separator /> */}

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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Creating account..." : "Create account"}
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
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
