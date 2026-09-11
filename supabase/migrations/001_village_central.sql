create extension if not exists pgcrypto;

create table if not exists village_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  normalized_username text not null unique,
  display_name text,
  password_hash text not null default '',
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','suspended','disabled')),
  banking_status text not null default 'active' check (banking_status in ('active','frozen')),
  must_change_password boolean not null default true,
  freeze_reason text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists village_user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references village_users(id) on delete cascade,
  token_hash text not null unique, created_at timestamptz not null default now(), expires_at timestamptz not null,
  last_used_at timestamptz, revoked_at timestamptz
);
create table if not exists village_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references village_users(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0), updated_at_source text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists village_transfers (
  id uuid primary key default gen_random_uuid(), sender_user_id uuid not null references village_users(id), recipient_user_id uuid not null references village_users(id),
  amount_cents bigint not null check (amount_cents > 0), note text, status text not null default 'completed', initiated_by uuid references village_users(id),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists village_deposit_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references village_users(id), diamond_count bigint not null check (diamond_count > 0),
  exchange_rate_cents bigint not null check (exchange_rate_cents > 0), calculated_amount_cents bigint not null check (calculated_amount_cents > 0),
  status text not null default 'pending', user_note text, admin_note text, reviewed_by uuid references village_users(id), reviewed_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists village_withdrawal_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references village_users(id), diamond_count bigint not null check (diamond_count > 0),
  exchange_rate_cents bigint not null check (exchange_rate_cents > 0), amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending', user_note text, admin_note text, reviewed_by uuid references village_users(id), reviewed_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists village_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references village_users(id), username text,
  type text not null, amount_cents bigint not null, balance_before_cents bigint, balance_after_cents bigint, status text not null default 'completed',
  transfer_id uuid references village_transfers(id), deposit_id uuid references village_deposit_requests(id), withdrawal_id uuid references village_withdrawal_requests(id),
  created_by text, note text, created_at timestamptz not null default now()
);
create table if not exists village_balance_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references village_users(id), username text, balance_cents bigint not null,
  type text, source_type text, source_id uuid, created_at timestamptz not null default now()
);
create table if not exists village_diamond_reserves (
  id uuid primary key default gen_random_uuid(), diamond_count bigint not null default 0 check (diamond_count >= 0), updated_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists village_reserve_transactions (
  id uuid primary key default gen_random_uuid(), type text not null, diamond_amount bigint not null, diamond_balance_before bigint not null, diamond_balance_after bigint not null,
  related_deposit_id uuid references village_deposit_requests(id), related_withdrawal_id uuid references village_withdrawal_requests(id), created_by text, reason text,
  created_at timestamptz not null default now()
);
create table if not exists village_economy_settings (
  key text primary key, value text not null, updated_by uuid references village_users(id), updated_at timestamptz not null default now()
);
create table if not exists village_economy_snapshots (
  id uuid primary key default gen_random_uuid(), currency_supply_cents bigint not null default 0, diamond_reserve_count bigint not null default 0,
  exchange_rate_cents bigint not null default 0, reserve_value_cents bigint not null default 0, backing_ratio numeric,
  created_at timestamptz not null default now()
);
create table if not exists village_news (
  id uuid primary key default gen_random_uuid(), title text not null, subtitle text, excerpt text, body text, category text, author text,
  image_url text, status text not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists village_jobs (
  id uuid primary key default gen_random_uuid(), title text not null, department text, short_description text, full_description text, compensation text, location text,
  image_url text, status text not null default 'draft', created_by uuid references village_users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists village_applications (
  id uuid primary key default gen_random_uuid(), job_id uuid references village_jobs(id) on delete set null, user_id uuid references village_users(id) on delete set null,
  applicant text, job_title text, message text, status text not null default 'pending', admin_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(job_id,user_id)
);
create table if not exists village_audit_logs (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid references village_users(id) on delete set null, actor text, action text not null, target text, reason text,
  created_at timestamptz not null default now()
);
create table if not exists village_announcements (id uuid primary key default gen_random_uuid(), title text not null, body text, active boolean not null default true, created_at timestamptz default now());
create table if not exists village_feature_controls (key text primary key, enabled boolean not null default true, updated_at timestamptz default now());

create index if not exists idx_village_tx_user_date on village_transactions(user_id,created_at desc);
create index if not exists idx_village_balance_user_date on village_balance_history(user_id,created_at);
create index if not exists idx_village_transfer_sender on village_transfers(sender_user_id,created_at desc);
create index if not exists idx_village_transfer_recipient on village_transfers(recipient_user_id,created_at desc);
create index if not exists idx_village_dep_status on village_deposit_requests(status,created_at desc);
create index if not exists idx_village_wd_status on village_withdrawal_requests(status,created_at desc);

create or replace function vc_snapshot() returns void language plpgsql security definer as $$
declare supply bigint; diamonds bigint; rate bigint; reserve bigint; ratio numeric;
begin
  select coalesce(sum(balance_cents),0) into supply from village_accounts;
  select coalesce(diamond_count,0) into diamonds from village_diamond_reserves order by created_at limit 1;
  select coalesce(value::bigint,1000) into rate from village_economy_settings where key='diamond_rate';
  reserve := diamonds*rate; ratio := case when supply=0 then null else (reserve::numeric/supply::numeric)*100 end;
  insert into village_economy_snapshots(currency_supply_cents,diamond_reserve_count,exchange_rate_cents,reserve_value_cents,backing_ratio) values(supply,diamonds,rate,reserve,ratio);
end $$;

create or replace function vc_transfer(p_sender uuid,p_recipient uuid,p_amount bigint,p_note text,p_initiated_by uuid) returns uuid language plpgsql security definer as $$
declare sa village_accounts%rowtype; ra village_accounts%rowtype; su village_users%rowtype; ru village_users%rowtype; tid uuid;
begin
 if p_sender=p_recipient or p_amount<=0 then raise exception 'Invalid transfer'; end if;
 select * into su from village_users where id=p_sender; select * into ru from village_users where id=p_recipient;
 if su.id is null or ru.id is null then raise exception 'User not found'; end if;
 if su.status<>'active' or su.banking_status='frozen' then raise exception 'Sender account cannot transfer'; end if;
 if ru.status<>'active' then raise exception 'Recipient account unavailable'; end if;
 if p_sender::text < p_recipient::text then select * into sa from village_accounts where user_id=p_sender for update; select * into ra from village_accounts where user_id=p_recipient for update;
 else select * into ra from village_accounts where user_id=p_recipient for update; select * into sa from village_accounts where user_id=p_sender for update; end if;
 if sa.id is null or ra.id is null then raise exception 'Bank account missing'; end if; if sa.balance_cents<p_amount then raise exception 'Insufficient balance'; end if;
 update village_accounts set balance_cents=balance_cents-p_amount,updated_at=now(),updated_at_source='transfer' where id=sa.id;
 update village_accounts set balance_cents=balance_cents+p_amount,updated_at=now(),updated_at_source='transfer' where id=ra.id;
 insert into village_transfers(sender_user_id,recipient_user_id,amount_cents,note,status,initiated_by,completed_at) values(p_sender,p_recipient,p_amount,p_note,'completed',p_initiated_by,now()) returning id into tid;
 insert into village_transactions(user_id,username,type,amount_cents,balance_before_cents,balance_after_cents,status,transfer_id,note) values
 (p_sender,su.username,'transfer_sent',-p_amount,sa.balance_cents,sa.balance_cents-p_amount,'completed',tid,p_note),
 (p_recipient,ru.username,'transfer_received',p_amount,ra.balance_cents,ra.balance_cents+p_amount,'completed',tid,p_note);
 insert into village_balance_history(user_id,username,balance_cents,type,source_type,source_id) values
 (p_sender,su.username,sa.balance_cents-p_amount,'transfer_sent','transfer',tid),(p_recipient,ru.username,ra.balance_cents+p_amount,'transfer_received','transfer',tid);
 return tid;
end $$;

create or replace function vc_admin_adjust_balance(p_actor uuid,p_target uuid,p_amount bigint,p_kind text,p_reason text) returns bigint language plpgsql security definer as $$
declare a village_accounts%rowtype; u village_users%rowtype; actorname text; afterv bigint; delta bigint; txid uuid;
begin
 select * into a from village_accounts where user_id=p_target for update; select * into u from village_users where id=p_target; select username into actorname from village_users where id=p_actor;
 if a.id is null then raise exception 'Bank account missing'; end if;
 if p_kind='add' then afterv=a.balance_cents+p_amount; elsif p_kind='remove' then afterv=a.balance_cents-p_amount; elsif p_kind='set' then afterv=p_amount; else raise exception 'Invalid adjustment kind'; end if;
 if afterv<0 then raise exception 'Balance cannot be negative'; end if; delta:=afterv-a.balance_cents;
 update village_accounts set balance_cents=afterv,updated_at=now(),updated_at_source='admin_'||p_kind where id=a.id;
 insert into village_transactions(user_id,username,type,amount_cents,balance_before_cents,balance_after_cents,status,created_by,note) values(p_target,u.username,'balance_adjustment',delta,a.balance_cents,afterv,'completed',actorname,p_reason) returning id into txid;
 insert into village_balance_history(user_id,username,balance_cents,type,source_type,source_id) values(p_target,u.username,afterv,'balance_adjustment','admin',txid);
 insert into village_audit_logs(actor_user_id,actor,action,target,reason) values(p_actor,actorname,'Balance adjustment',u.username,p_reason); perform vc_snapshot(); return afterv;
end $$;

create or replace function vc_review_deposit(p_actor uuid,p_request uuid,p_approve boolean,p_reason text) returns text language plpgsql security definer as $$
declare r village_deposit_requests%rowtype; a village_accounts%rowtype; u village_users%rowtype; rr village_diamond_reserves%rowtype; actorname text; txid uuid;
begin
 select * into r from village_deposit_requests where id=p_request for update; if r.id is null or r.status<>'pending' then raise exception 'Deposit request is not pending'; end if;
 select username into actorname from village_users where id=p_actor;
 if not p_approve then update village_deposit_requests set status='rejected',reviewed_by=p_actor,reviewed_at=now(),admin_note=p_reason where id=r.id; insert into village_audit_logs(actor_user_id,actor,action,target,reason) values(p_actor,actorname,'Reject deposit',r.user_id::text,p_reason); return 'rejected'; end if;
 select * into a from village_accounts where user_id=r.user_id for update; select * into u from village_users where id=r.user_id; select * into rr from village_diamond_reserves order by created_at limit 1 for update;
 if rr.id is null then insert into village_diamond_reserves(diamond_count,updated_by) values(0,actorname) returning * into rr; end if;
 update village_accounts set balance_cents=a.balance_cents+r.calculated_amount_cents,updated_at=now(),updated_at_source='diamond_deposit' where id=a.id;
 update village_diamond_reserves set diamond_count=rr.diamond_count+r.diamond_count,updated_by=actorname,updated_at=now() where id=rr.id;
 update village_deposit_requests set status='approved',reviewed_by=p_actor,reviewed_at=now(),completed_at=now(),admin_note=p_reason where id=r.id;
 insert into village_transactions(user_id,username,type,amount_cents,balance_before_cents,balance_after_cents,status,deposit_id,created_by,note) values(r.user_id,u.username,'diamond_deposit',r.calculated_amount_cents,a.balance_cents,a.balance_cents+r.calculated_amount_cents,'completed',r.id,actorname,p_reason) returning id into txid;
 insert into village_balance_history(user_id,username,balance_cents,type,source_type,source_id) values(r.user_id,u.username,a.balance_cents+r.calculated_amount_cents,'diamond_deposit','deposit',r.id);
 insert into village_reserve_transactions(type,diamond_amount,diamond_balance_before,diamond_balance_after,related_deposit_id,created_by,reason) values('deposit_received',r.diamond_count,rr.diamond_count,rr.diamond_count+r.diamond_count,r.id,actorname,p_reason);
 insert into village_audit_logs(actor_user_id,actor,action,target,reason) values(p_actor,actorname,'Approve deposit',u.username,p_reason); perform vc_snapshot(); return 'approved';
end $$;

create or replace function vc_review_withdrawal(p_actor uuid,p_request uuid,p_approve boolean,p_reason text) returns text language plpgsql security definer as $$
declare r village_withdrawal_requests%rowtype; a village_accounts%rowtype; u village_users%rowtype; rr village_diamond_reserves%rowtype; actorname text;
begin
 select * into r from village_withdrawal_requests where id=p_request for update; if r.id is null or r.status<>'pending' then raise exception 'Withdrawal request is not pending'; end if;
 select username into actorname from village_users where id=p_actor;
 if not p_approve then update village_withdrawal_requests set status='rejected',reviewed_by=p_actor,reviewed_at=now(),admin_note=p_reason where id=r.id; insert into village_audit_logs(actor_user_id,actor,action,target,reason) values(p_actor,actorname,'Reject withdrawal',r.user_id::text,p_reason); return 'rejected'; end if;
 select * into a from village_accounts where user_id=r.user_id for update; select * into u from village_users where id=r.user_id; select * into rr from village_diamond_reserves order by created_at limit 1 for update;
 if a.balance_cents<r.amount_cents then raise exception 'Insufficient balance'; end if; if rr.id is null or rr.diamond_count<r.diamond_count then raise exception 'Insufficient diamond reserves'; end if;
 update village_accounts set balance_cents=a.balance_cents-r.amount_cents,updated_at=now(),updated_at_source='diamond_withdrawal' where id=a.id;
 update village_diamond_reserves set diamond_count=rr.diamond_count-r.diamond_count,updated_by=actorname,updated_at=now() where id=rr.id;
 update village_withdrawal_requests set status='approved',reviewed_by=p_actor,reviewed_at=now(),completed_at=now(),admin_note=p_reason where id=r.id;
 insert into village_transactions(user_id,username,type,amount_cents,balance_before_cents,balance_after_cents,status,withdrawal_id,created_by,note) values(r.user_id,u.username,'diamond_withdrawal',-r.amount_cents,a.balance_cents,a.balance_cents-r.amount_cents,'completed',r.id,actorname,p_reason);
 insert into village_balance_history(user_id,username,balance_cents,type,source_type,source_id) values(r.user_id,u.username,a.balance_cents-r.amount_cents,'diamond_withdrawal','withdrawal',r.id);
 insert into village_reserve_transactions(type,diamond_amount,diamond_balance_before,diamond_balance_after,related_withdrawal_id,created_by,reason) values('withdrawal_paid',-r.diamond_count,rr.diamond_count,rr.diamond_count-r.diamond_count,r.id,actorname,p_reason);
 insert into village_audit_logs(actor_user_id,actor,action,target,reason) values(p_actor,actorname,'Approve withdrawal',u.username,p_reason); perform vc_snapshot(); return 'approved';
end $$;

create or replace function vc_adjust_reserve(p_actor uuid,p_delta bigint,p_reason text) returns bigint language plpgsql security definer as $$
declare rr village_diamond_reserves%rowtype; actorname text; afterv bigint;
begin
 select username into actorname from village_users where id=p_actor; select * into rr from village_diamond_reserves order by created_at limit 1 for update;
 if rr.id is null then insert into village_diamond_reserves(diamond_count,updated_by) values(0,actorname) returning * into rr; end if; afterv:=rr.diamond_count+p_delta; if afterv<0 then raise exception 'Diamond reserve cannot be negative'; end if;
 update village_diamond_reserves set diamond_count=afterv,updated_by=actorname,updated_at=now() where id=rr.id;
 insert into village_reserve_transactions(type,diamond_amount,diamond_balance_before,diamond_balance_after,created_by,reason) values(case when p_delta>=0 then 'admin_addition' else 'admin_removal' end,p_delta,rr.diamond_count,afterv,actorname,p_reason);
 insert into village_audit_logs(actor_user_id,actor,action,target,reason) values(p_actor,actorname,'Reserve adjustment',p_delta::text,p_reason); perform vc_snapshot(); return afterv;
end $$;

alter table village_users enable row level security;
alter table village_user_sessions enable row level security;
alter table village_accounts enable row level security;
alter table village_transactions enable row level security;
alter table village_transfers enable row level security;
alter table village_deposit_requests enable row level security;
alter table village_withdrawal_requests enable row level security;
alter table village_balance_history enable row level security;
alter table village_diamond_reserves enable row level security;
alter table village_reserve_transactions enable row level security;
alter table village_economy_settings enable row level security;
alter table village_economy_snapshots enable row level security;
alter table village_news enable row level security;
alter table village_jobs enable row level security;
alter table village_applications enable row level security;
alter table village_audit_logs enable row level security;
