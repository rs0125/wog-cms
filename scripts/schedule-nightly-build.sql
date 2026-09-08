-- Run in the Supabase SQL editor as postgres AFTER deploying the CMS endpoint.
-- POST https://wog-cms.vercel.app/api/deploy
-- Replace the placeholder with the exact WEBSITE_DEPLOY_HOOK_URL configured
-- in the production CMS. The whole URL is the existing build credential.
-- Re-running updates the named Vault secret and the same cron job.
-- Docs: https://supabase.com/docs/guides/functions/schedule-functions

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

do $setup$
declare
  build_credential text := 'REPLACE_WITH_WEBSITE_DEPLOY_HOOK_URL';
  existing_secret_id uuid;
begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Expected pg_cron timezone UTC/GMT. 20:30 UTC is 02:00 Asia/Kolkata.';
  end if;
  if build_credential not like 'https://api.vercel.com/v1/integrations/deploy/%' then
    raise exception 'Replace the placeholder with the production CMS WEBSITE_DEPLOY_HOOK_URL.';
  end if;

  select id into existing_secret_id
  from vault.secrets where name = 'wareongo_website_build_credential';

  if existing_secret_id is null then
    perform vault.create_secret(
      build_credential,
      'wareongo_website_build_credential',
      'Existing CMS website deploy hook; bearer credential for POST /api/deploy'
    );
  else
    perform vault.update_secret(existing_secret_id, build_credential);
  end if;
end
$setup$;

-- The cron definition contains the Vault name, not the credential itself.
-- A named schedule updates the existing job rather than making duplicates.
select cron.schedule(
  'wareongo-website-nightly-build',
  '30 20 * * *', -- 20:30 UTC = 02:00 IST the following calendar day
  $job$
    select net.http_post(
      url := 'https://wog-cms.vercel.app/api/deploy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'wareongo_website_build_credential'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
  $job$
);

commit;

-- Confirm the schedule without displaying the credential.
select jobid, jobname, schedule, active
from cron.job where jobname = 'wareongo-website-nightly-build';

-- After a run, inspect HTTP results separately from cron history. pg_net is
-- asynchronous: a successful cron run means the HTTP request was enqueued.
-- HTTP 202 means Vercel accepted the trigger, not that the build finished.
-- pg_net retains response records for a limited time (normally six hours).
-- select id, status_code, timed_out, error_msg, content, created
-- from net._http_response
-- order by created desc limit 10;
-- Check Vercel's website deployment dashboard for the final build result.

-- To stop future runs:
-- select cron.unschedule('wareongo-website-nightly-build');
