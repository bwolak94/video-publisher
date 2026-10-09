"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignInForm } from "@/components/auth/SignInForm";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async (
    email: string,
    password: string,
    remember: boolean,
  ) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
        credentials: "include",
      });
      if (!res.ok) {
        setError("Nieprawidłowy e-mail lub hasło");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Nieprawidłowy e-mail lub hasło");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Zaloguj się" subtitle="Witaj ponownie w Video Factory">
      <SignInForm onSubmit={handleSubmit} loading={loading} error={error} />
    </AuthLayout>
  );
}
