"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PasswordField } from "@/components/ui/PasswordField";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface SignUpFormProps {
  onSubmit: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    consent: boolean;
  }) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export function SignUpForm({ onSubmit, loading, error }: SignUpFormProps) {
  const [role, setRole] = useState("operator");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, email, password, role, consent });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
    >
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      <SegmentedControl
        options={[
          { value: "operator", label: "Operator kanałów" },
          { value: "b2b_client", label: "Klient B2B" },
        ]}
        value={role}
        onChange={setRole}
        block
      />

      <TextField
        label="Imię i nazwisko"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoComplete="name"
      />
      <TextField
        label="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <PasswordField
        label="Hasło"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        showStrength
        required
        autoComplete="new-password"
      />

      <Checkbox
        label="Zgoda AI Act"
        description="Rozumiem, że każdy film jest oznaczany jako wygenerowany przez AI (C2PA + etykieta, AI Act art. 50)"
        checked={consent}
        onChange={setConsent}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={loading}
        disabled={!consent}
      >
        Zarejestruj się
      </Button>

      <p style={{ textAlign: "center", fontSize: 13, color: "var(--ink-muted)" }}>
        Masz już konto?{" "}
        <Link href="/login" className="vf-link">
          Zaloguj się
        </Link>
      </p>
    </form>
  );
}
