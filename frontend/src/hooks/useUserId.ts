"use client";

import { useState, useEffect } from "react";
import { getUserId } from "@/lib/userId";

export function useUserId(): string {
  const [userId, setUserId] = useState("");

  useEffect(() => {
    setUserId(getUserId());
  }, []);

  return userId;
}
