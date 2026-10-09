import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return <div className={`vf-card ${className}`}>{children}</div>;
}

interface CardSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHead({ children, className = "" }: CardSectionProps) {
  return <div className={`vf-card-head ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: CardSectionProps) {
  return <div className={`vf-card-body ${className}`}>{children}</div>;
}

export function CardFoot({ children, className = "" }: CardSectionProps) {
  return <div className={`vf-card-foot ${className}`}>{children}</div>;
}
