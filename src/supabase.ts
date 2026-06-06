import { createClient } from '@supabase/supabase-js'

// La URL y la anon key se leen de variables de entorno (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY). Para no romper el arranque actual ni el fallback en
// memoria (cuando este módulo no carga), se conservan los valores actuales como
// respaldo. La anon key es pública por diseño y aparece en el bundle; con RLS
// activo es aceptable (Fase 1). La service_role NUNCA debe vivir en el cliente.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://vxmfwxpjmivionvxwsye.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4bWZ3eHBqbWl2aW9udnh3c3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDUxNjcsImV4cCI6MjA5NDU4MTE2N30.7eqpZRQw2iNKfJ7-t1Dzf-udmKlxtcbjeFSjR7xF66o'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
