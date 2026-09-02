-- A legacy deployment may still have this overload.  PostgREST receives only
-- p_round_id from the client and cannot choose between it and the one-argument
-- RPC, producing PGRST203 when a player opens the next modality.
drop function if exists public.cd_start_round(uuid, uuid);

grant execute on function public.cd_start_round(uuid) to authenticated, anon;
