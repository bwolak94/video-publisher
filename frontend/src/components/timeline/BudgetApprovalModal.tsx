"use client";
/**
 * BudgetApprovalModal (FEATURE-09)
 *
 * Shown when the server emits an `approval_required` WS event.
 * Lets the user approve or reject a costly action before it runs.
 */
import React from "react";

export interface ApprovalRequest {
  jobId: string;
  estimatedCost: number;
  provider: string;
  action: string;
  sceneId?: string;
}

interface Props {
  request: ApprovalRequest;
  onApprove: (jobId: string) => void;
  onReject: (jobId: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  regenerate_visual: "Regenerate Visual",
  update_voice: "Regenerate Voice",
  render: "Render Video",
};

const PROVIDER_LABELS: Record<string, string> = {
  runway: "Runway AI",
  kling: "Kling AI",
  elevenlabs: "ElevenLabs",
  lambda: "AWS Lambda",
};

export function BudgetApprovalModal({ request, onApprove, onReject }: Props) {
  const actionLabel = ACTION_LABELS[request.action] ?? request.action;
  const providerLabel = PROVIDER_LABELS[request.provider] ?? request.provider;
  const costFormatted = `$${request.estimatedCost.toFixed(2)}`;

  const handleApprove = () => {
    fetch(`/api/scenes/approval/${request.jobId}/approve`, { method: "POST" }).catch(console.warn);
    onApprove(request.jobId);
  };

  const handleReject = () => {
    fetch(`/api/scenes/approval/${request.jobId}/reject`, { method: "POST" }).catch(console.warn);
    onReject(request.jobId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="budget-approval-modal"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Approve Action?</h2>
        <p className="text-sm text-gray-500 mb-5">
          This action will incur an estimated cost.
        </p>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-6 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Action</span>
            <span className="font-medium text-gray-900">{actionLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Provider</span>
            <span className="font-medium text-gray-900">{providerLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Estimated cost</span>
            <span className="font-semibold text-amber-700">{costFormatted}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleReject}
            data-testid="approval-reject-btn"
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            data-testid="approval-approve-btn"
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Approve {costFormatted}
          </button>
        </div>
      </div>
    </div>
  );
}
