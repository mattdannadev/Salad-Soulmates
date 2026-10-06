-- Make newly deployed RPC signatures immediately visible to the Supabase API.
notify pgrst, 'reload schema';
