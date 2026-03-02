import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useTranslation } from 'react-i18next';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Persist token in a ref so it survives URL cleanup
    const tokenRef = useRef(token);
    if (token) {
        tokenRef.current = token;
    }

    // Hide token from URL
    useEffect(() => {
        if (token) {
            navigate("/reset-password", { replace: true });
        }
    }, [token, navigate]);

    if (!tokenRef.current) {
        return (
            <AuthLayout title={t('auth.invalidLink')} subtitle={t('auth.invalidLinkSubtitle')}>
                <Button asChild className="w-full">
                    <Link to="/forgot-password">{t('auth.requestNewLink')}</Link>
                </Button>
            </AuthLayout>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Password Policy Check
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            toast({
                variant: "destructive",
                title: t('auth.weakPassword'),
                description: t('auth.weakPasswordDescription')
            });
            return;
        }

        if (password !== confirmPassword) {
            toast({
                variant: "destructive",
                title: t('auth.passwordsDoNotMatch'),
            });
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: tokenRef.current, newPassword: password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Failed to reset password");
            }

            toast({
                title: t('common.success'),
                description: t('auth.passwordResetSuccess'),
            });

            navigate("/login");
        } catch (error) {
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout
            title={t('auth.resetPassword')}
            subtitle={t('auth.resetPasswordSubtitle')}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="password">{t('auth.newPassword')}</Label>
                    <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                    <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('auth.resetPassword')}
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