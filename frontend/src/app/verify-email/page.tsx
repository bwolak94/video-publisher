"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { VerifyEmail } from "@/components/auth/VerifyEmail";

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async (code: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        setError("Nieprawidłowy kod. Spróbuj ponownie.");
        return;
      }
      router.push("/login");
    } catch {
      setError("Błąd weryfikacji.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  };

  return (
    <AuthLayout title="Sprawdź e-mail" subtitle="Wpisz kod weryfikacyjny">
      <VerifyEmail
        email={email}
        onSubmit={handleSubmit}
        onResend={handleResend}
        loading={loading}
        error={error}
      />
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
