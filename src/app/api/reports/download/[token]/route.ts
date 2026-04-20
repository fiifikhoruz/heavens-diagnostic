import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { validateReportToken } from "@/lib/report-tokens";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALLOWED_ROLES = new Set(["doctor", "admin"]);

/**
 * GET /api/reports/download/[token]
 * Securely downloads a lab report. Requires:
 *   1. A valid, unexpired report token
 *   2. An authenticated Supabase session cookie
 *   3. The authenticated user's profile.role to be in ALLOWED_ROLES
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return getErrorPage("Invalid or missing download token", 400);
    }

    // ─── Auth check ────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const sessionClient = createServerClient(supabaseUrl!, supabaseAnonKey!, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op — route handlers cannot set cookies on this response here
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return getErrorPage("You must be signed in to download reports.", 401);
    }

    // Role check — doctor or admin only
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !ALLOWED_ROLES.has(profile.role)) {
      return getErrorPage(
        "You do not have permission to download this report.",
        403
      );
    }

    // ─── Token check ───────────────────────────────────────────────────────
    const validation = await validateReportToken(token, false);

    if (!validation.valid) {
      return getErrorPage(validation.message || "Invalid or expired token", 403);
    }

    const visitId = validation.visitId;

    // ─── Fetch report data (service role bypasses RLS by design here) ──────
    const { data: visitData, error: visitError } = await supabase
      .from("visits")
      .select(
        `
        id,
        patient_id,
        visit_date,
        status,
        notes,
        test_results,
        tests(id, name, category),
        patients(id, first_name, last_name, date_of_birth, phone, email),
        profiles(id, first_name, last_name)
      `
      )
      .eq("id", visitId)
      .single();

    if (visitError || !visitData) {
      console.error("Error fetching visit data:", visitError);
      return getErrorPage(
        "Unable to fetch report data. Please contact support.",
        500
      );
    }

    const htmlReport = generateReportHTML(visitData);

    return new NextResponse(htmlReport, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="report_${visitId}.html"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error in report download:", error);
    return getErrorPage(
      "An unexpected error occurred. Please try again later.",
      500
    );
  }
}

function generateReportHTML(visitData: any): string {
  const patient = visitData.patients;
  const testResults = visitData.test_results || {};

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const calculateAge = (dob: string | null) => {
    if (!dob) return "N/A";
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  };

  const testsHtml = (visitData.tests || [])
    .map(
      (test: any) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">${test.name || "N/A"}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${test.category || "N/A"}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">
        ${testResults[test.id] ? JSON.stringify(testResults[test.id]) : "Pending"}
      </td>
    </tr>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Lab Report - Heavens Diagnostic Services</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; padding: 20px; color: #333; }
        .container { max-width: 900px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        .header { border-bottom: 3px solid #0066cc; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
        .header h1 { color: #0066cc; font-size: 28px; margin-bottom: 5px; }
        .header p { color: #666; font-size: 14px; }
        .patient-info { background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 30px; border-left: 4px solid #0066cc; }
        .info-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 15px; }
        .info-row:last-child { margin-bottom: 0; }
        .info-item { display: flex; flex-direction: column; }
        .info-label { font-weight: 600; color: #0066cc; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
        .info-value { color: #333; font-size: 15px; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: 600; color: #0066cc; border-bottom: 2px solid #0066cc; padding-bottom: 10px; margin-bottom: 20px; }
        .test-results-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .test-results-table th { background-color: #0066cc; color: white; padding: 12px; text-align: left; font-size: 14px; font-weight: 600; }
        .test-results-table td { border: 1px solid #ddd; padding: 10px; font-size: 14px; }
        .test-results-table tbody tr:nth-child(even) { background-color: #f9f9f9; }
        .notes-section { background-color: #f0f5ff; padding: 15px; border-radius: 4px; border-left: 4px solid #0066cc; margin-top: 15px; }
        .notes-section p { white-space: pre-wrap; word-wrap: break-word; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
        .status-completed { background-color: #d4edda; color: #155724; }
        .status-pending { background-color: #fff3cd; color: #856404; }
        @media print { body { background-color: white; padding: 0; } .container { box-shadow: none; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Heavens Diagnostic Services</h1>
          <p>Lab Report</p>
        </div>

        <div class="patient-info">
          <div class="info-row">
            <div class="info-item"><span class="info-label">Patient Name</span><span class="info-value">${patient.first_name} ${patient.last_name}</span></div>
            <div class="info-item"><span class="info-label">Date of Birth</span><span class="info-value">${formatDate(patient.date_of_birth)}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="info-label">Age</span><span class="info-value">${calculateAge(patient.date_of_birth)} years</span></div>
            <div class="info-item"><span class="info-label">Contact</span><span class="info-value">${patient.phone || "N/A"}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="info-label">Email</span><span class="info-value">${patient.email || "N/A"}</span></div>
            <div class="info-item"><span class="info-label">Visit Date</span><span class="info-value">${formatDate(visitData.visit_date)}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Report Status</div>
          <span class="status-badge status-${visitData.status}">${visitData.status.toUpperCase()}</span>
        </div>

        <div class="section">
          <div class="section-title">Test Results</div>
          <table class="test-results-table">
            <thead><tr><th>Test Name</th><th>Category</th><th>Result</th></tr></thead>
            <tbody>${testsHtml}</tbody>
          </table>
        </div>

        ${
          visitData.notes
            ? `<div class="section"><div class="section-title">Clinical Notes</div><div class="notes-section"><p>${visitData.notes}</p></div></div>`
            : ""
        }

        <div class="footer">
          <p>This report has been generated by Heavens Diagnostic Services.</p>
          <p>Generated on ${formatDate(new Date().toISOString())}</p>
          <p style="margin-top: 10px; color: #999;">For inquiries, contact us at our Sunyani branch.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getErrorPage(message: string, status = 403): NextResponse {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Report Download Error</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .error-container { background: white; border-radius: 8px; padding: 40px; max-width: 500px; text-align: center; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); }
        .error-icon { font-size: 48px; margin-bottom: 20px; }
        h1 { color: #d32f2f; margin-bottom: 15px; font-size: 24px; }
        p { color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px; }
        .footer-text { color: #999; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="error-container">
        <div class="error-icon">⚠️</div>
        <h1>Unable to Download Report</h1>
        <p>${message}</p>
        <p class="footer-text">If you believe this is an error, please contact Heavens Diagnostic Services support.</p>
      </div>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
