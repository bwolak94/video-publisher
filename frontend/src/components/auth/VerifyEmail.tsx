"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/ui/OtpInput";

interface VerifyEmailProps {
  email?: string;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  loading?: boolean;
  error?: string;
}

export function VerifyEmail({
  email,
  onSubmit,
  onResend,
  loading,
  error,
}: VerifyEmailProps) {
  const [code, setCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) await onSubmit(code);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}
    >
      <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
        Wysłaliśmy 6-cyfrowy kod na adres{" "}
        <strong style={{ color: "var(--ink)" }}>{email ?? "twój e-mail"}</strong>.
      </p>

      <OtpInput length={6} value={code} onChange={setCode} autoFocus />

      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={loading}
        disabled={code.length < 6}
      >
        Zweryfikuj e-mail
      </Button>

      <div style={{ textAlign: "center" }}>
        <Button type="button" variant="ghost" size="sm" onClick={onResend}>
          Wyślij ponownie
        </Button>
      </div>
    </form>
  );
}
