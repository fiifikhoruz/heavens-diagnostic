import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Generates a secure report token for direct download access
 * @param visitId - The visit ID for which to generate a token
 * @param expiryHours - Token expiry duration in hours (default: 72)
 * @returns Object with token and download URL
 */
export async function generateReportToken(
  visitId: string,
  expiryHours: number = 72
): Promise<{ token: string; downloadUrl: string }> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  try {
    const { data, error } = await supabase
      .from("report_tokens")
      .insert({
        visit_id: visitId,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create report token: ${error.message}`);
    }

    const downloadUrl = getDownloadUrl(token);

    return {
      token,
      downloadUrl,
    };
  } catch (error) {
    console.error("Error generating report token:", error);
    throw error;
  }
}

/**
 * Constructs the public download URL for a report token
 * @param token - The report token
 * @returns The full download URL
 */
export function getDownloadUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/api/reports/download/${token}`;
}

/**
 * Validates a report token and marks it as used if configured
 * @param token - The token to validate
 * @param markAsUsed - Whether to mark the token as used after validation
 * @returns Object with validation result and visit data
 */
export async function validateReportToken(
  token: string,
  markAsUsed: boolean = false
): Promise<{
  valid: boolean;
  visitId?: string;
  message?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("report_tokens")
      .select("visit_id, is_used, expires_at")
      .eq("token", token)
      .single();

    if (error || !data) {
      return {
        valid: false,
        message: "Invalid or expired token",
      };
    }

    const now = new Date();
    const expiresAt = new Date(data.expires_at);

    if (expiresAt < now) {
      return {
        valid: false,
        message: "Token has expired",
      };
    }

    if (data.is_used) {
      return {
        valid: false,
        message: "Token has already been used",
      };
    }

    if (markAsUsed) {
      await supabase
        .from("report_tokens")
        .update({ is_used: true })
        .eq("token", token);
    }

    return {
      valid: true,
      visitId: data.visit_id,
    };
  } catch (error) {
    console.error("Error validating report token:", error);
    return {
      valid: false,
      message: "Error validating token",
    };
  }
}
