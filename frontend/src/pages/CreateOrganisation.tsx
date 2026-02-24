import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Sparkles, Users, Shield, ArrowRight, ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";
import { Link } from "react-router-dom";
import { hasRedirectContext } from "@/lib/redirectContext";

export default function CreateOrganisation() {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [invites, setInvites] = useState<string[]>([]);
  const [newInvite, setNewInvite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { user, refreshUser, activeOrganization } = useAuth();
  const navigate = useNavigate();

  // State guard: If user already has an org, redirect them.
  // This prevents back-button re-entry into org creation.
  useState(() => {
    if (activeOrganization) {
      const target = hasRedirectContext() ? "/integration-onboarding" : "/apps";
      navigate(target, { replace: true });
    }
  });

  const addInvite = () => {
    if (newInvite && !invites.includes(newInvite) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newInvite)) {
      setInvites([...invites, newInvite]);
      setNewInvite("");
    }
  };

  const removeInvite = (email: string) => {
    setInvites(invites.filter((i) => i !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data } = await api.post('/organizations', { name, website, invites });

      if (data.organization?.id) {
        localStorage.setItem("activeOrganizationId", data.organization.id);
      }

      await refreshUser();

      // If redirect context exists, go through integration onboarding before external app
      if (hasRedirectContext()) {
        navigate("/integration-onboarding", { replace: true });
        return;
      }

      // Navigate directly to apps — org is already selected
      navigate("/apps", { replace: true });
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

  const leftContent = (
    <div className="space-y-8">
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
  );

  return (
    <SplitScreenLayout leftContent={leftContent}>
      <div className="lg:hidden mb-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold">SalesDuo</span>
        </Link>
      </div>

      <div className="mb-8">
        {user?.memberships && user.memberships.length > 0 && (
          <Button variant="ghost" className="mb-4 pl-0 hover:bg-transparent hover:text-primary" onClick={() => navigate("/choose-organisation")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Organization Selection
          </Button>
        )}
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

        <div className="space-y-2">
          <Label>Invite Team Members <span className="text-muted-foreground font-normal">(Optional)</span></Label>
          <div className="flex gap-2">
            <Input
              placeholder="colleague@example.com"
              value={newInvite}
              onChange={(e) => setNewInvite(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInvite();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addInvite}>
              Add
            </Button>
          </div>

          {invites.length > 0 && (
            <div className="mt-2 border rounded-md">
              <ScrollArea className="h-[120px] w-full rounded-md p-2">
                <div className="space-y-2">
                  {invites.map((email) => (
                    <div key={email} className="flex items-center justify-between px-2 py-1 bg-muted/60 rounded-md">
                      <span className="font-semibold text-gray-800 text-sm">{email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeInvite(email)}
                      >
                        &times;
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            They will receive an email invitation to join your organization
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
    </SplitScreenLayout >
  );
}

