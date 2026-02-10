import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Sparkles, Users, Shield, ArrowRight } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function CreateOrganisation() {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { refreshUser, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get("redirect");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, website }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create organization");
      }

      const data = await res.json();
      await refreshUser();
      if (data.organization && data.organization.id) {
        switchOrganization(data.organization.id);
      }

      // Redirect to external app if redirect param exists
      if (redirectUrl) {
        const url = new URL(redirectUrl);
        url.searchParams.set("auth_success", "true");
        window.location.href = url.toString();
        return;
      }
      navigate("/apps");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding with Gradient */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#ff9900] via-[#e88800] to-[#cc7700] flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-sm" />
          <div className="absolute top-1/2 -left-12 w-64 h-64 bg-white/5 rounded-full" />
          <div className="absolute bottom-24 right-1/4 w-32 h-32 bg-white/10 rounded-full blur-sm" />
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full" style={{
              backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
              backgroundSize: '20px 20px'
            }} />
          </div>
        </div>

        <Link to="/" className="flex items-center gap-2 h-20 w-20 relative z-10">
          <img src="/salesduologo.svg" alt="SalesDuo" className="drop-shadow-lg" />
        </Link>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-sm">
              Set Up Your Organization
            </h1>
            <p className="text-lg text-white/90">
              Create your workspace and start managing your Amazon business more effectively.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/90">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Team Collaboration</p>
                <p className="text-sm text-white/70">Invite team members to work together</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Powerful Tools</p>
                <p className="text-sm text-white/70">Access listing optimization & more</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Enterprise Security</p>
                <p className="text-sm text-white/70">Your data is safe and secure</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-white/70 relative z-10">
          © 2024 SalesDuo. All rights reserved.
        </p>
      </div>

      {/* Right side - Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold">SalesDuo</span>
            </Link>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Create Organisation</h2>
            <p className="mt-2 text-muted-foreground">Set up your workspace to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Organisation Name</Label>
              <Input
                id="name"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">
                Website <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="website"
                placeholder="https://acme.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Add your company website to personalize your workspace
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                "Creating..."
              ) : (
                <>
                  Create Organisation
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              You can always update these details later in settings
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
