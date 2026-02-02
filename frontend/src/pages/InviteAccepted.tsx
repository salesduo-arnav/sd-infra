import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function InviteAccepted() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [inviteDetails, setInviteDetails] = useState<{
    email: string;
    organization_name: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("Invalid or expired invitation.");

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

  const handleContinue = () => {
    if (inviteDetails && token) {
      navigate(`/signup?email=${encodeURIComponent(inviteDetails.email)}&token=${token}`);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout title="Invitation Invalid" subtitle="There was a problem with your link">
        <div className="flex flex-col items-center justify-center space-y-6 py-4">
          <XCircle className="h-16 w-16 text-destructive" />
          <p className="text-center text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/login">Go to Login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout 
      title="Invite Accepted!" 
      subtitle={`You have been invited to join ${inviteDetails?.organization_name || "an organization"}`}
    >
      <div className="flex flex-col items-center justify-center space-y-6 py-4">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <p className="text-center text-muted-foreground">
            You can now sign up to create your account.
        </p>
        <Button className="w-full" onClick={handleContinue}>
          Continue to Sign Up
        </Button>
      </div>
    </AuthLayout>
  );
}
