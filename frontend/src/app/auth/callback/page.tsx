"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const data = searchParams.get("data");

    if (data) {
      try {
        // Decode the user data from base64
        const decoded = atob(decodeURIComponent(data));
        const userData = JSON.parse(decoded);

        // Store in localStorage for persistence
        localStorage.setItem("auth_user", JSON.stringify(userData));

        // Full page reload to reinitialize auth context
        window.location.href = "/dashboard";
      } catch (error) {
        console.error("Failed to parse auth data:", error);
        window.location.href = "/?auth=error";
      }
    } else {
      window.location.href = "/?auth=error";
    }
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
