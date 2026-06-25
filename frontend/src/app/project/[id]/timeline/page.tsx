"use client";

// Timeline Editor — implemented in TASK-17
export default function TimelinePage({ params }: { params: { id: string } }) {
  return (
    <div className="flex items-center justify-center h-screen text-gray-500">
      <p>Timeline Editor for project <strong>{params.id}</strong> — coming in TASK-17</p>
    </div>
  );
}
