import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { supportedLanguages } from '@/i18n';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check } from 'lucide-react';

export function LanguageSwitcher() {
    const { i18n, t } = useTranslation();

    const currentLanguage = supportedLanguages.find(
        (lang) => lang.code === i18n.language
    ) || supportedLanguages[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 outline-none ring-sidebar-ring focus-visible:ring-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background shadow-sm">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 truncate">
                        <p className="text-sm font-medium truncate">{t('language.switchLanguage')}</p>
                        <p className="text-xs text-muted-foreground truncate">
                            {currentLanguage.flag} {currentLanguage.label}
                        </p>
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 shadow-xl border-border/50" align="start" sideOffset={8}>
                {supportedLanguages.map((lang) => (
                    <DropdownMenuItem
                        key={lang.code}
                        onClick={() => i18n.changeLanguage(lang.code)}
                        className="gap-3 p-2 cursor-pointer focus:bg-accent focus:text-accent-foreground"
                    >
                        <span className="text-base">{lang.flag}</span>
                        <span className="flex-1 font-medium">{lang.label}</span>
                        {i18n.language === lang.code && (
                            <Check className="h-4 w-4 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
