"use client";
import React, { useState } from "react";

interface TabItem {
  value: string;
  label: string;
  count?: number;
}

interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export function Tabs({
  items,
  value: controlledValue,
  defaultValue,
  onChange,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? items[0]?.value ?? ""
  );
  const isControlled = controlledValue !== undefined;
  const active = isControlled ? controlledValue : internalValue;

  function handleClick(v: string) {
    if (!isControlled) setInternalValue(v);
    onChange?.(v);
  }

  return (
    <div className="vf-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          className="vf-tab"
          role="tab"
          aria-selected={active === item.value}
          onClick={() => handleClick(item.value)}
        >
          {item.label}
          {item.count !== undefined && (
            <small className="vf-count">{item.count}</small>
          )}
        </button>
      ))}
    </div>
  );
}
