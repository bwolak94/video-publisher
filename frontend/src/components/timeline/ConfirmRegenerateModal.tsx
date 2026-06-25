"use client";
import React from "react";
import { formatCost } from "@/lib/cost-estimation";

interface ConfirmRegenerateModalProps {
  dirtyCount: number;
  estimatedCost: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmRegenerateModal({
  dirtyCount,
  estimatedCost,
  onConfirm,
  onCancel,
}: ConfirmRegenerateModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="confirm-regenerate-modal"
    >
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-gray-900 text-lg mb-2">
          Confirm Regeneration
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Regenerating <strong>{dirtyCount} scenes</strong> will use approximately{" "}
          <strong>{formatCost(estimatedCost)}</strong>. Continue?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            data-testid="modal-cancel-btn"
            className="px-4 py-2 text-sm text-gray-700 border rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            data-testid="modal-confirm-btn"
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
