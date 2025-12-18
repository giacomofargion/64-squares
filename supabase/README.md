# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings > API

## 2. Set Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 3. Run Database Schema

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `schema.sql`
4. Run the SQL script

## 4. Enable Realtime

**Option 1: Using SQL (Recommended)**
1. Go to SQL Editor in your Supabase dashboard
2. Run the SQL from `supabase/enable_realtime.sql`
3. This adds the tables to the `supabase_realtime` publication

**Option 2: Using Dashboard**
1. Go to Database > Replication
2. Enable replication for:
   - `matches` table
   - `moves` table
   - `chat_messages` table

**Note:** If you see "Realtime subscription error" in the console, make sure you've completed this step!

## 5. Create Storage Bucket

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `audio-files`
3. Set it to public (or configure RLS policies for authenticated access)
4. Configure CORS if needed

## 6. Configure Authentication

1. Go to Authentication > Settings
2. Enable Email authentication
3. Configure email templates if desired
4. Set up any additional providers (optional)

## 7. Test Connection

The app should now be able to connect to Supabase. Test by:
- Creating a user account
- Creating a match
- Sending a message
