"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const router = useRouter();
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

        // Trigger a storage event for other tabs
        window.dispatchEvent(new Event("storage"));

        // Redirect to dashboard
        router.replace("/dashboard");
      } catch (error) {
        console.error("Failed to parse auth data:", error);
        router.replace("/?auth=error");
      }
    } else {
      router.replace("/?auth=error");
    }
  }, [searchParams, router]);

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
