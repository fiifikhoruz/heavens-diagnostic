'use client';

export default function TurnaroundPage() {
  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 rounded-full mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Turnaround</h1>
        <p className="text-gray-600">
          Turnaround time metrics are coming soon.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Average processing times, overdue visit alerts, and per-stage breakdowns will appear here.
        </p>
      </div>
    </div>
  );
}
