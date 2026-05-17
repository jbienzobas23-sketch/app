import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://vxmfwxpjmivionvxwsye.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4bWZ3eHBqbWl2aW9udnh3c3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDUxNjcsImV4cCI6MjA5NDU4MTE2N30.7eqpZRQw2iNKfJ7-t1Dzf-udmKlxtcbjeFSjR7xF66o'
)
