# Village Central system documentation

## Architecture
React/Vite renders the UI. All private data and mutations go through same-origin Vercel functions under `/api`. The API uses a server-only Supabase service role. No Bool runtime is required.

## Authentication
Minecraft username/password only. `POST /api/auth/login` verifies a scrypt hash and creates an HttpOnly session. `GET /api/auth/session` restores it. `POST /api/auth/logout` revokes it. Password hashes and session tokens never appear in React.

## Admin authorization
Every `/api/admin/*` call uses `requireAdmin()`. Omar is admin because his database row has `role=admin`, not because the frontend compares his name.

## Accounts and freeze status
`village_accounts` is the authoritative balance. `village_users.banking_status=frozen` blocks user-initiated money movement server-side while preserving history and balance.

## Transfers
`POST /api/transfers/send` calls SQL function `vc_transfer`. It locks the involved accounts, checks funds/status, debits sender, credits recipient, and writes transfer, transaction, and balance-history rows atomically. Total currency supply is unchanged.

## Deposits
Users create pending diamond deposit requests. Admin approval calls `vc_review_deposit`, increasing user balance and diamond reserves together and writing transaction/history/reserve/audit/snapshot records.

## Withdrawals
Users create pending withdrawal requests. Admin approval calls `vc_review_withdrawal`, decreasing digital balance and diamond reserves together after checking both are sufficient.

## Diamond reserves and economy
`village_diamond_reserves` stores physical diamonds. `village_economy_settings` stores `diamond_rate`. Currency supply is the sum of account balances. Reserve value is diamonds × rate. `village_economy_snapshots` stores real history used by charts.

## News and jobs
Public endpoints return only published/open records. Admin endpoints create, edit, publish/unpublish, and delete them. Images upload through `/api/admin/media/upload` into Supabase Storage.

## Job applications
Authenticated players submit one application per job. Admins can accept/reject through `/api/admin/applications/:id`.

## Audit
Important admin operations write to `village_audit_logs`. Existing passwords are never displayed; admins reset them instead.

## Diagnostics
Admin → System Diagnostics is based on successful real API/database queries. Empty tables are warnings/zeroes, not fabricated content.
