import { ReactNode } from "react";
import { Link } from "react-router-dom";

interface SplitScreenLayoutProps {
    children: ReactNode;
    leftContent?: ReactNode;
    rightContentClassName?: string;
    showBrandOnMobile?: boolean; // If true, shows a simple brand header on mobile
    logoUrl?: string; // Defaults to "/salesduologo.svg"
    homeUrl?: string; // Defaults to "/"
    contentMaxWidth?: string; // Defaults to "max-w-md"
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
        <div className="min-h-screen flex text-foreground bg-background">
            {/* Left side - Branding with Gradient */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#ff9900] via-[#e88800] to-[#cc7700] flex-col justify-between p-12 relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute inset-0 overflow-hidden">
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

                <Link to={homeUrl} className="flex items-center gap-2 h-20 w-20 relative z-10">
                    <img src={logoUrl} alt="SalesDuo" className="drop-shadow-lg" />
                </Link>

                <div className="relative z-10 w-full">
                    {leftContent}
                </div>

                <p className="text-sm text-white/70 relative z-10">
                    © {new Date().getFullYear()} SalesDuo. All rights reserved.
                </p>
            </div>

            {/* Right side - Content */}
            <div className={`flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-16 ${rightContentClassName}`}>
                <div className={`mx-auto w-full ${contentMaxWidth}`}>
                    {/* Mobile Brand Header */}
                    {showBrandOnMobile && (
                        <div className="lg:hidden mb-8">
                            <Link to={homeUrl} className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                                    <img src={logoUrl} alt="SalesDuo" className="h-6 w-auto brightness-0 invert" />
                                </div>
                                <span className="text-xl font-semibold">SalesDuo</span>
                            </Link>
                        </div>
                    )}

                    {children}
                </div>
            </div>
        </div>
    );
}
