import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/lib/api";
import { useTranslation } from 'react-i18next';

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error("Failed to send request");

      // We set submitted to true regardless of success to simulate security best practices
      setIsSubmitted(true);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: t('auth.somethingWentWrong'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <AuthLayout
        title={t('auth.checkYourEmailTitle')}
        subtitle={t('auth.resetInstructionsSent')}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.accountExistsForEmail')} <span className="font-medium">{email}</span>
            {t('auth.resetLinkSentSuffix')}
          </p>

          <Button asChild className="w-full">
            <Link to="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('auth.backToLogin')}
            </Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.forgotPasswordTitle')}
      subtitle={t('auth.forgotPasswordSubtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? t('auth.sending') : t('auth.sendResetLink')}
        </Button>

        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('auth.backToLogin')}
          </Link>
        </Button>
      </form>
    </AuthLayout>
  );
}
