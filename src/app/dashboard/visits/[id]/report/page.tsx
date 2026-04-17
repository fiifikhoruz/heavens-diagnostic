'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const visitId = params.id as string;

  /**
   * Fetches the report HTML from the API route
   */
  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get the auth token from localStorage or cookie
        const token = localStorage.getItem('supabase.auth.token') ||
          document.cookie
            .split('; ')
            .find((row) => row.startsWith('sb-'))
            ?.split('=')[1];

        if (!token) {
          throw new Error('Authentication token not found. Please log in again.');
        }

        const response = await fetch(
          `/api/reports/${visitId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              'Session expired. Please log in again.'
            );
          } else if (response.status === 404) {
            throw new Error('Visit not found.');
          } else {
            throw new Error(
              `Failed to fetch report: ${response.statusText}`
            );
          }
        }

        const html = await response.text();
        setReportHtml(html);

        // Load HTML into iframe
        if (iframeRef.current) {
          iframeRef.current.srcdoc = html;
        }
      } catch (err) {
        console.error('Error fetching report:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load report'
        );
      } finally {
        setLoading(false);
      }
    };

    if (visitId) {
      fetchReport();
    }
  }, [visitId]);

  /**
   * Prints the report from the iframe
   */
  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  /**
   * Downloads the report as PDF by triggering print dialog
   */
  const handleDownloadPdf = () => {
    if (iframeRef.current?.contentWindow) {
      // Focus the iframe
      iframeRef.current.focus();
      // Trigger print (user selects "Save as PDF" option)
      iframeRef.current.contentWindow.print();
    }
  };

  /**
   * Goes back to the visit page
   */
  const handleBackToVisit = () => {
    router.back();
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>Lab Report</h1>
          <p style={styles.subtitle}>Visit ID: {visitId}</p>
        </div>

        {/* Button Group */}
        <div style={styles.buttonGroup}>
          <button
            onClick={handlePrint}
            disabled={loading}
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            🖨️ Print Report
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={loading}
            style={{
              ...styles.button,
              ...styles.buttonSecondary,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            📥 Download PDF
          </button>

          <Link href={`/dashboard/visits/${visitId}`}>
            <button
              style={{
                ...styles.button,
                ...styles.buttonTertiary,
              }}
            >
              ← Back to Visit
            </button>
          </Link>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading report...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>⚠️ {error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              ...styles.button,
              ...styles.buttonSecondary,
              marginTop: '12px',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Report Viewer */}
      {!loading && !error && (
        <div style={styles.iframeContainer}>
          <iframe
            ref={iframeRef}
            style={styles.iframe}
            title="Lab Report"
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Inline styles for the component
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
  },

  header: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
  },

  headerContent: {
    flex: 1,
    minWidth: '200px',
  },

  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1976d2',
    margin: '0 0 8px 0',
  },

  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: '0',
  },

  buttonGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },

  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    whiteSpace: 'nowrap',
  },

  buttonPrimary: {
    backgroundColor: '#1976d2',
    color: 'white',
  },

  buttonSecondary: {
    backgroundColor: '#757575',
    color: 'white',
  },

  buttonTertiary: {
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
  },

  buttonDisabled: {
    opacity: '0.6',
    cursor: 'not-allowed',
  },

  loadingContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '60px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '500px',
  },

  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f0f0f0',
    borderTopColor: '#1976d2',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '16px',
  },

  loadingText: {
    fontSize: '16px',
    color: '#666',
    margin: '0',
  },

  errorContainer: {
    backgroundColor: '#ffebee',
    borderRadius: '8px',
    padding: '24px',
    border: '1px solid #ffcdd2',
  },

  errorText: {
    fontSize: '16px',
    color: '#d32f2f',
    margin: '0',
  },

  iframeContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    height: 'calc(100vh - 200px)',
    minHeight: '600px',
  },

  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
};

/**
 * Add CSS animation for spinner
 */
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet);
}
