import { ReactNode, useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '@/i18n';
import { Globe, Check } from 'lucide-react';

interface SplitScreenLayoutProps {
    children: ReactNode;
    leftContent?: ReactNode;
    rightContentClassName?: string;
    showBrandOnMobile?: boolean; // If true, shows a simple brand header on mobile
    logoUrl?: string; // Defaults to "/salesduologo.svg"
    homeUrl?: string; // Defaults to "/"
    contentMaxWidth?: string; // Defaults to "max-w-md"
}

function LanguageDropdown() {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const currentLanguage = supportedLanguages.find(
        (lang) => lang.code === i18n.language
    ) || supportedLanguages[0];

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative z-20" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 hover:text-white text-sm font-medium transition-all duration-200 backdrop-blur-sm"
            >
                <Globe className="h-4 w-4" />
                <span>{currentLanguage.flag} {currentLanguage.label}</span>
            </button>
            {open && (
                <div className="absolute bottom-full mb-2 left-0 w-48 bg-white rounded-lg shadow-xl border overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {supportedLanguages.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => {
                                i18n.changeLanguage(lang.code);
                                setOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            <span className="text-base">{lang.flag}</span>
                            <span className="flex-1 text-left font-medium">{lang.label}</span>
                            {i18n.language === lang.code && (
                                <Check className="h-4 w-4 text-orange-500" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function SplitScreenLayout({
    children,
    leftContent,
    rightContentClassName = "",
    showBrandOnMobile = true,
    logoUrl = "/salesduologo.svg",
    homeUrl = "/",
    contentMaxWidth = "max-w-md"
}: SplitScreenLayoutProps) {
    return (
        <div className="h-screen w-full flex flex-col lg:flex-row text-foreground bg-background overflow-hidden">
            {/* Left side - Branding with Gradient (fixed panel) */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#ff9900] via-[#e88800] to-[#cc7700] relative lg:fixed lg:inset-y-0 lg:left-0 lg:h-screen z-0">
                {/* Decorative Elements */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Large circle */}
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-sm" />
                    {/* Medium circle */}
                    <div className="absolute top-1/2 -left-12 w-64 h-64 bg-white/5 rounded-full" />
                    {/* Small circle */}
                    <div className="absolute bottom-24 right-1/4 w-32 h-32 bg-white/10 rounded-full blur-sm" />
                    {/* Diagonal line pattern */}
                    <div className="absolute inset-0 opacity-5">
                        <div
                            className="absolute top-0 left-0 w-full h-full"
                            style={{
                                backgroundImage:
                                    "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)",
                                backgroundSize: "20px 20px",
                            }}
                        />
                    </div>
                </div>

                {/* Left side content container */}
                <div className="relative z-10 w-full h-full flex flex-col justify-between p-8 lg:p-12">
                    <Link to={homeUrl} className="flex items-center gap-2 h-20 w-20 shrink-0 mb-8">
                        <img src={logoUrl} alt="SalesDuo" className="drop-shadow-lg" />
                    </Link>

                    <div className="w-full flex-1 flex flex-col justify-center shrink-0 py-8">
                        {leftContent}
                    </div>

                    <div className="flex items-center justify-between shrink-0 mt-8">
                        <p className="text-sm text-white/70">
                            © {new Date().getFullYear()} SalesDuo. All rights reserved.
                        </p>
                        <LanguageDropdown />
                    </div>
                </div>
            </div>

            {/* Right side - scrollable content pane */}
            <div className={`flex w-full lg:w-1/2 lg:ml-auto flex-col h-full overflow-y-auto ${rightContentClassName || ""}`}>
                <div className={`mx-auto w-full flex flex-col min-h-full px-0 py-8 ${contentMaxWidth}`}>
                    {/* Mobile Brand Header */}
                    {showBrandOnMobile && (
                        <div className="lg:hidden mb-8 shrink-0 flex items-center w-full">
                            <Link to={homeUrl} className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                                    <img src={logoUrl} alt="SalesDuo" className="h-6 w-auto brightness-0 invert" />
                                </div>
                                <span className="text-xl font-semibold">SalesDuo</span>
                            </Link>
                        </div>
                    )}

                    <div className="flex flex-col justify-center w-full my-auto py-8">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
