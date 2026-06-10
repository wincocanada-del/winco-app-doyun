import { createClient } from "@supabase/supabase-js";

export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const supabase = (SUPA_URL && SUPA_KEY) ? createClient(SUPA_URL, SUPA_KEY) : null;
export const SUPA_ON = !!supabase;

