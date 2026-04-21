import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const isPlaceholderUrl = SUPABASE_URL === 'https://your-project.supabase.co';
const isPlaceholderKey = SUPABASE_ANON_KEY === 'your-anon-public-key' || SUPABASE_ANON_KEY === 'your-anon-key';
export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY && !isPlaceholderUrl && !isPlaceholderKey);
export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
