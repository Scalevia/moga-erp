"use client";

// The shop's database (Supabase). Without its address and key the app runs on its demo data, kept in the
// browser — the live site does until the shop goes onto the database.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Real accounts on the database, rather than the demo. The same on the server and in the browser. */
export const isLive = Boolean(url && key);

let client: SupabaseClient | null = null;

/** The browser's connection; null in the demo and while rendering on the server. */
export function getSupabase(): SupabaseClient | null {
  if (!isLive || typeof window === "undefined") return null;
  client ??= createClient(url!, key!);
  return client;
}

/**
 * Supabase Auth signs in by email, and staff sign in with a username, so each username gets an address on
 * the app's own domain. Nothing is ever sent to it. (The staff-accounts Edge Function makes the same one.)
 */
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@moga-erp.vercel.app`;
