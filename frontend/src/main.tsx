import { createRoot } from "react-dom/client";
import React, { Suspense } from "react";
import App from "./App.tsx";
import "./index.css";
import "@/i18n"; // Initialize i18next before app renders
import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading...</div>}>
                <App />
            </Suspense>
        </GoogleOAuthProvider>
    </React.StrictMode>
)
