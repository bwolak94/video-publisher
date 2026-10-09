"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    consent: boolean;
  }) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { message?: string }).message ?? "Błąd rejestracji");
        return;
      }
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
    } catch {
      setError("Błąd rejestracji. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Utwórz konto" subtitle="Zacznij generować shorty w kilka minut">
      <SignUpForm onSubmit={handleSubmit} loading={loading} error={error} />
    </AuthLayout>
  );
}
