import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { API_URL } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const initials = user?.full_name
    ? user.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "U";

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update profile');
      }

      toast.success(t('pages.profile.profileUpdated'));
      // Refresh user context to show new name in sidebar/header
      if (refreshUser) await refreshUser();
    } catch (error) {
      toast.error(error.message || t('pages.profile.profileUpdateFailed'));
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t('pages.profile.passwordsDontMatch'));
      return;
    }

    try {
      const res = await fetch(`${API_URL}/users/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update password');
      }

      toast.success(t('pages.profile.passwordUpdated'));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error.message || t('pages.profile.passwordUpdateFailed'));
    }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t('pages.profile.passwordsDontMatch'));
      return;
    }

    try {
      const res = await fetch(`${API_URL}/users/me/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create password');
      }

      toast.success(t('pages.profile.passwordCreated'));
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error.message || t('pages.profile.passwordCreateFailed'));
    }
  };

  return (
    <>
      <div className="container max-w-4xl py-10 space-y-8 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('pages.profile.title')}</h1>
          <p className="mt-2 text-muted-foreground text-lg">
            {t('pages.profile.subtitle')}
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.profile.profileInfo')}</CardTitle>
              <CardDescription>
                {t('pages.profile.profileInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-6">

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('pages.profile.fullName')}</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('pages.profile.fullNamePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('auth.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('pages.profile.emailPlaceholder')}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <Button type="submit">{t('pages.profile.saveChanges')}</Button>
              </form>
            </CardContent>
          </Card>

          {/* Password */}
          {user?.has_password ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.profile.changePassword')}</CardTitle>
                <CardDescription>
                  {t('pages.profile.changePasswordDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">{t('pages.profile.currentPassword')}</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('pages.profile.currentPasswordPlaceholder')}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">{t('pages.profile.newPassword')}</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('pages.profile.newPasswordPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t('pages.profile.confirmNewPassword')}</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('pages.profile.confirmNewPasswordPlaceholder')}
                      />
                    </div>
                  </div>
                  <Button type="submit">{t('pages.profile.updatePassword')}</Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.profile.setPassword')}</CardTitle>
                <CardDescription>
                  {t('pages.profile.setPasswordDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreatePassword} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">{t('pages.profile.newPassword')}</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('pages.profile.newPasswordPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t('pages.profile.confirmNewPassword')}</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('pages.profile.confirmNewPasswordPlaceholder')}
                      />
                    </div>
                  </div>
                  <Button type="submit">{t('pages.profile.setPassword')}</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Danger Zone */}
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-destructive">{t('pages.profile.dangerZone')}</CardTitle>
              <CardDescription>
                {t('pages.profile.dangerZoneDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
                <div>
                  <p className="font-medium">{t('pages.profile.deleteAccount')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('pages.profile.deleteAccountDesc')}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      {t('pages.profile.deleteAccount')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('pages.profile.deleteConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('pages.profile.deleteConfirmDesc')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            const res = await fetch(`${API_URL}/users/me`, {
                              method: 'DELETE',
                              credentials: 'include'
                            });

                            if (res.ok) {
                              toast.success(t('pages.profile.accountDeleted'));
                              window.location.href = "/login";
                            } else {
                              const data = await res.json();
                              toast.error(data.message || t('pages.profile.accountDeleteFailed'));
                            }
                          } catch (error) {
                            toast.error(t('pages.profile.accountDeleteFailed'));
                          }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('pages.profile.deleteAccount')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
