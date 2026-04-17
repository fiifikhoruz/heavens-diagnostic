import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Supabase client for server-side operations
function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Type definitions
interface ReportData {
  visit: any;
  patient: any;
  tests: any[];
  doctorNotes: any[];
  payment: any;
}

/**
 * Validates the Authorization header and returns the user
 */
async function validateAuth(
  supabase: ReturnType<typeof createSupabaseClient>,
  authHeader: string | null
) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Fetches comprehensive report data for a visit
 */
async function fetchReportData(
  supabase: ReturnType<typeof createSupabaseClient>,
  visitId: string
): Promise<ReportData | null> {
  try {
    // Fetch visit with patient info
    const { data: visitData, error: visitError } = await supabase
      .from('visits')
      .select(
        `
        id,
        visit_date,
        status,
        patients (
          id,
          patient_id,
          first_name,
          last_name,
          date_of_birth,
          gender,
          phone,
          email
        )
      `
      )
      .eq('id', visitId)
      .single();

    if (visitError || !visitData) return null;

    // Fetch tests with results
    const { data: testsData, error: testsError } = await supabase
      .from('visit_tests')
      .select(
        `
        id,
        test_type_id,
        status,
        test_types (
          id,
          name,
          category
        ),
        test_results (
          id,
          field_name,
          value,
          unit,
          normal_min,
          normal_max,
          is_abnormal
        )
      `
      )
      .eq('visit_id', visitId)
      .order('id', { ascending: true });

    if (testsError) {
      console.error('Tests error:', testsError);
    }

    // Fetch doctor notes
    const { data: notesData, error: notesError } = await supabase
      .from('doctor_notes')
      .select(
        `
        id,
        notes,
        created_at,
        profiles (
          full_name
        )
      `
      )
      .eq('visit_id', visitId)
      .order('created_at', { ascending: false });

    if (notesError) {
      console.error('Notes error:', notesError);
    }

    // Fetch payment info
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('visit_id', visitId)
      .single();

    if (paymentError && paymentError.code !== 'PGRST116') {
      console.error('Payment error:', paymentError);
    }

    return {
      visit: visitData,
      patient: visitData.patients,
      tests: testsData || [],
      doctorNotes: notesData || [],
      payment: paymentData || null,
    };
  } catch (error) {
    console.error('Error fetching report data:', error);
    return null;
  }
}

/**
 * Formats a date to readable format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Calculates age from date of birth
 */
function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

/**
 * Generates HTML report from report data
 */
function generateHtmlReport(data: ReportData): string {
  const patient = data.patient;
  const visit = data.visit;
  const tests = data.tests;
  const doctorNotes = data.doctorNotes;

  const age = patient?.date_of_birth
    ? calculateAge(patient.date_of_birth)
    : 'N/A';
  const reportId = `RPT-${visit.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

  let testResultsHtml = '';
  tests.forEach((test) => {
    const testType = test.test_types;
    const results = test.test_results || [];

    if (results.length === 0) {
      testResultsHtml += `
        <tr>
          <td colspan="6" style="padding: 12px; background-color: #f5f5f5; font-weight: 500;">
            ${testType.name} (${testType.category})
          </td>
        </tr>
        <tr>
          <td colspan="6" style="padding: 10px; text-align: center; color: #999;">
            No results available
          </td>
        </tr>
      `;
    } else {
      testResultsHtml += `
        <tr>
          <td colspan="6" style="padding: 12px; background-color: #f5f5f5; font-weight: 500;">
            ${testType.name} (${testType.category})
          </td>
        </tr>
      `;

      results.forEach((result: any) => {
        const isAbnormal = result.is_abnormal;
        const valueStyle = isAbnormal
          ? 'color: #d32f2f; font-weight: bold;'
          : '';
        const statusText = isAbnormal ? 'ABNORMAL' : 'NORMAL';
        const statusColor = isAbnormal ? '#d32f2f' : '#388e3c';

        const referenceRange =
          result.normal_min && result.normal_max
            ? `${result.normal_min} - ${result.normal_max}`
            : 'N/A';

        testResultsHtml += `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${result.field_name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center; ${valueStyle}">${result.value}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${result.unit || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${referenceRange}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">
              <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
            </td>
          </tr>
        `;
      });
    }
  });

  const doctorNotesHtml =
    doctorNotes.length > 0
      ? doctorNotes
          .map(
            (note) => `
        <div style="margin-bottom: 12px; padding: 12px; background-color: #f9f9f9; border-left: 4px solid #1976d2;">
          <p style="margin: 0 0 8px 0; font-weight: 500; color: #1976d2;">
            Dr. ${note.profiles?.full_name || 'Unknown'}
          </p>
          <p style="margin: 0; color: #333; line-height: 1.5;">
            ${note.notes}
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">
            ${formatDate(note.created_at)}
          </p>
        </div>
      `
          )
          .join('')
      : '<p style="color: #999;">No doctor notes available</p>';

  const paymentStatusHtml = data.payment
    ? `
      <div style="margin-top: 12px; padding: 10px; background-color: #e8f5e9; border-left: 4px solid #388e3c;">
        <p style="margin: 0; font-weight: 500; color: #388e3c;">
          Payment Status: <span style="text-transform: uppercase;">${data.payment.status}</span>
        </p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #666;">
          Amount: GHS ${parseFloat(data.payment.amount).toFixed(2)} | Method: ${data.payment.method}
        </p>
      </div>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Lab Report - ${patient?.first_name} ${patient?.last_name}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f5f5f5;
        }

        @media print {
          body {
            background-color: white;
          }
          .print-hide {
            display: none !important;
          }
          .page {
            page-break-after: always;
            background-color: white;
            margin: 0;
            padding: 20mm;
          }
          @page {
            margin: 20mm;
            size: A4;
          }
        }

        .page {
          max-width: 210mm;
          height: 297mm;
          margin: 0 auto;
          padding: 20px;
          background-color: white;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .header {
          border-bottom: 3px solid #1976d2;
          padding-bottom: 20px;
          margin-bottom: 20px;
          text-align: center;
        }

        .logo {
          width: 60px;
          height: 60px;
          margin: 0 auto 12px;
          background-color: #1976d2;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 24px;
        }

        .hospital-name {
          font-size: 22px;
          font-weight: bold;
          color: #1976d2;
          margin-bottom: 4px;
        }

        .hospital-info {
          font-size: 12px;
          color: #666;
          margin-bottom: 2px;
        }

        .section-title {
          font-size: 14px;
          font-weight: bold;
          color: white;
          background-color: #1976d2;
          padding: 10px 12px;
          margin-top: 20px;
          margin-bottom: 12px;
          border-radius: 4px;
        }

        .info-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 12px;
          padding: 10px;
          background-color: #f9f9f9;
          border-radius: 4px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
        }

        .info-label {
          font-size: 12px;
          color: #999;
          font-weight: 500;
          text-transform: uppercase;
        }

        .info-value {
          font-size: 14px;
          color: #333;
          font-weight: 500;
          margin-top: 2px;
        }

        .results-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 13px;
        }

        .results-table thead {
          background-color: #1976d2;
          color: white;
        }

        .results-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          border: 1px solid #ddd;
        }

        .results-table td {
          padding: 10px 12px;
          border: 1px solid #ddd;
        }

        .results-table tbody tr:nth-child(even) {
          background-color: #fafafa;
        }

        .results-table tbody tr:hover {
          background-color: #f0f0f0;
        }

        .abnormal {
          color: #d32f2f;
          font-weight: bold;
        }

        .normal {
          color: #388e3c;
          font-weight: bold;
        }

        .notes-section {
          margin-top: 20px;
          padding: 12px;
          background-color: #f9f9f9;
          border-left: 4px solid #1976d2;
          border-radius: 4px;
        }

        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 11px;
          color: #999;
          text-align: center;
        }

        .footer-note {
          margin-bottom: 8px;
          font-style: italic;
        }

        .button-group {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        .btn {
          padding: 10px 20px;
          background-color: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background-color 0.3s;
        }

        .btn:hover {
          background-color: #1565c0;
        }

        .btn-secondary {
          background-color: #757575;
        }

        .btn-secondary:hover {
          background-color: #616161;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header">
          <div class="logo">HDL</div>
          <div class="hospital-name">HEAVENS DIAGNOSTIC SERVICES</div>
          <div class="hospital-info">Sunyani, Bono Region, Ghana</div>
          <div class="hospital-info">📞 Phone: +233 XXX XXX XXXX | 📧 Email: info@heavensdiagnostic.com</div>
        </div>

        <!-- Patient Information -->
        <div class="section-title">PATIENT INFORMATION</div>
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">Full Name</span>
            <span class="info-value">${patient?.first_name} ${patient?.last_name}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Patient ID</span>
            <span class="info-value">${patient?.patient_id}</span>
          </div>
        </div>
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">Date of Birth</span>
            <span class="info-value">${patient?.date_of_birth ? formatDate(patient.date_of_birth) : 'N/A'} (${age} years)</span>
          </div>
          <div class="info-item">
            <span class="info-label">Gender</span>
            <span class="info-value">${patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : 'N/A'}</span>
          </div>
        </div>
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">Phone</span>
            <span class="info-value">${patient?.phone || 'N/A'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Email</span>
            <span class="info-value">${patient?.email || 'N/A'}</span>
          </div>
        </div>

        <!-- Visit Information -->
        <div class="section-title">VISIT INFORMATION</div>
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">Visit Date</span>
            <span class="info-value">${formatDate(visit.visit_date)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Visit ID</span>
            <span class="info-value">${visit.id}</span>
          </div>
        </div>

        <!-- Test Results -->
        <div class="section-title">TEST RESULTS</div>
        <table class="results-table">
          <thead>
            <tr>
              <th>Test Field</th>
              <th>Value</th>
              <th>Unit</th>
              <th>Reference Range</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${testResultsHtml || '<tr><td colspan="5" style="text-align: center; color: #999;">No test results available</td></tr>'}
          </tbody>
        </table>

        <!-- Doctor Notes -->
        ${
          doctorNotes.length > 0
            ? `
          <div class="section-title">DOCTOR NOTES</div>
          <div class="notes-section">
            ${doctorNotesHtml}
          </div>
        `
            : ''
        }

        <!-- Payment Status -->
        ${paymentStatusHtml}

        <!-- Footer -->
        <div class="footer">
          <div class="footer-note">
            This report was generated electronically and is valid without signature.
          </div>
          <div>
            Report ID: ${reportId} | Generated: ${new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * GET /api/reports/[visitId]
 * Generates and returns a lab report for a visit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const supabase = createSupabaseClient();
    const { visitId } = await params;

    // Validate authentication
    const authHeader = request.headers.get('authorization');
    const user = await validateAuth(supabase, authHeader);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if format is JSON
    const url = new URL(request.url);
    const format = url.searchParams.get('format');

    // Fetch report data
    const reportData = await fetchReportData(supabase, visitId);

    if (!reportData) {
      return NextResponse.json(
        { error: 'Visit not found' },
        { status: 404 }
      );
    }

    // Return JSON if requested
    if (format === 'json') {
      return NextResponse.json(reportData);
    }

    // Generate and return HTML
    const htmlReport = generateHtmlReport(reportData);

    return new NextResponse(htmlReport, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
