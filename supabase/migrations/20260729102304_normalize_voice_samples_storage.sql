update public.voice_samples
set audio_url = regexp_replace(audio_url, '^data:[^,]+,', '')
where audio_url ~ '^data:[^,]+,';

drop index if exists public.voice_samples_by_user_target_language_created_at_idx;
