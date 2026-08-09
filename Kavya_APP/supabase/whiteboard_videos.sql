-- Whiteboard Video Table
-- Admin uploads a video that plays in the person whiteboard area on user homepage
create table if not exists public.whiteboard_videos (
  id uuid primary key default gen_random_uuid(),
  video_url text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.whiteboard_videos enable row level security;

drop policy if exists "Anyone can read whiteboard videos" on public.whiteboard_videos;
create policy "Anyone can read whiteboard videos"
  on public.whiteboard_videos for select to anon, authenticated using (true);

drop policy if exists "Admins can insert whiteboard videos" on public.whiteboard_videos;
create policy "Admins can insert whiteboard videos"
  on public.whiteboard_videos for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can delete whiteboard videos" on public.whiteboard_videos;
create policy "Admins can delete whiteboard videos"
  on public.whiteboard_videos for delete to authenticated
  using (public.is_admin());

-- Enable realtime for whiteboard updates
do $$
begin
  alter publication supabase_realtime add table public.whiteboard_videos;
exception when duplicate_object then null;
end $$;
