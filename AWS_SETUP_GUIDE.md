# Marevlo — AWS Production Setup Guide

Step-by-step for the four launch items that need your AWS account. The app code
is already written for all of these — you're supplying credentials/config, not
writing code.

Assumptions: you have an AWS business account and control the `marevlo.com`
domain's DNS. Pick **one region** for everything and stick to it — `ap-south-1`
(Mumbai) is the right default for an India audience. Examples below use it.

> Order to do these in: **1) Secrets Manager → 2) SES email → 3) RDS backups →
> 4) CloudWatch.** (Email creds land in Secrets Manager, so set that up first.)

---

## 1. Transactional email — Amazon SES

This powers verify-email, password reset, and security alerts. The app talks to
SES over SMTP using these env vars: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM` (`no-reply@marevlo.com`), `SMTP_USE_TLS` (true).

**Steps:**
1. AWS Console → **SES** (region `ap-south-1`) → **Configuration → Identities → Create identity**.
2. Choose **Domain**, enter `marevlo.com`. Enable **Easy DKIM** (RSA 2048).
3. SES shows **3 CNAME records** (DKIM) + a recommended SPF/MAIL FROM record. Add
   all of them in your `marevlo.com` DNS (wherever the domain is managed — the
   same place your `siddhishsatapathy@marevlo.com` mailbox is set up). Also add a
   DMARC TXT record: host `_dmarc.marevlo.com`, value `v=DMARC1; p=none; rua=mailto:siddhishsatapathy@marevlo.com`.
4. Wait for SES to show the domain **Verified** (minutes to a few hours).
5. **Leave the SES sandbox** (required to email real users): SES → **Account dashboard
   → Request production access**. Describe the use (transactional auth emails only),
   expected volume, and that you only email users who signed up. Approval is usually
   within 24h.
6. Create SMTP credentials: SES → **SMTP settings → Create SMTP credentials**. This
   creates a small IAM user and gives you an **SMTP username + password** — download
   them (shown once). These become `SMTP_USER` / `SMTP_PASS`.
7. Note the SMTP endpoint for your region: `email-smtp.ap-south-1.amazonaws.com`
   (that's `SMTP_HOST`; port 587, TLS on).
8. Put the values in Secrets Manager (Section 2), not in plain env files.

**Verify:** after deploy, trigger a password reset for a test account and confirm
the email arrives (check spam — good DKIM/SPF/DMARC keeps you out of it).

---

## 2. Secrets — AWS Secrets Manager

Never ship real keys in `.env`. Store them once; ECS injects them at runtime.

**Secrets the app needs:** `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`,
`SMTP_USER`, `SMTP_PASS`, and later the AI provider keys (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`) and PayU keys when you wire payments.

**Steps:**
1. Console → **Secrets Manager → Store a new secret → Other type of secret**.
2. Add key/value pairs for each secret above. Name it `marevlo/prod`.
3. Generate a strong `JWT_SECRET` (e.g. `openssl rand -hex 32`) — never reuse the
   dev default.
4. Give the **ECS task execution role** permission to read it. Attach an inline IAM
   policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "secretsmanager:GetSecretValue",
       "Resource": "arn:aws:secretsmanager:ap-south-1:<ACCOUNT_ID>:secret:marevlo/prod-*"
     }]
   }
   ```
5. In the **ECS task definition**, map each secret into an env var via the
   `secrets` block (your Terraform under `terraform/` already wires Secrets
   Manager — fill in the real secret ARN + keys there):
   ```
   secrets = [
     { name = "DATABASE_URL", valueFrom = "<secret-arn>:DATABASE_URL::" },
     { name = "JWT_SECRET",   valueFrom = "<secret-arn>:JWT_SECRET::" },
     { name = "SMTP_USER",    valueFrom = "<secret-arn>:SMTP_USER::" },
     { name = "SMTP_PASS",    valueFrom = "<secret-arn>:SMTP_PASS::" }
   ]
   ```
6. Set non-secret config (`SMTP_HOST`, `SMTP_PORT=587`, `SMTP_FROM=no-reply@marevlo.com`,
   `SMTP_USE_TLS=true`, `LOG_FORMAT=json`, `REQUIRE_DOB=true`) as plain env vars.

**Verify:** redeploy the service and confirm it boots (the app refuses to start in
prod with insecure config, so a clean boot means the secrets resolved).

---

## 3. Database backups — RDS

**Steps:**
1. Console → **RDS → Databases →** your Marevlo Postgres instance → **Modify**.
2. **Backup retention period:** set to **7 days** (or up to 35). 0 = backups OFF —
   don't leave it there.
3. Set a **backup window** during low traffic (e.g. 19:00–20:00 UTC ≈ 00:30 IST).
4. Enable **Deletion protection** (stops an accidental drop of the DB).
5. Consider **Multi-AZ** for failover (costs more; worth it once you have paying users).
6. Apply **immediately** (or in the maintenance window).
7. Take a **manual snapshot** right before launch: select the DB → **Actions → Take snapshot**.

**Verify:** RDS → your DB → **Maintenance & backups** tab shows automated backups
enabled with the retention you set, and your manual snapshot listed.

---

## 4. Observability — CloudWatch

The app emits structured logs and metrics already; route them to CloudWatch.

**Steps:**
1. **Logs:** in the ECS task definition, use the `awslogs` log driver pointing at a
   log group (e.g. `/marevlo/prod/api`). Set `LOG_FORMAT=json` so logs are
   structured and searchable in **CloudWatch Logs Insights**.
2. **Dashboard:** CloudWatch → **Dashboards → Create** → add widgets for ECS service
   CPU & memory, ALB request count + 5xx, and RDS CPU, free storage, and connections.
3. **Alarms** (CloudWatch → Alarms → Create): set alerts for
   - ECS CPU/memory > ~80% sustained,
   - ALB 5xx error rate spiking,
   - RDS free storage low / connections near max.
4. **Notifications:** create an **SNS topic** with `siddhishsatapathy@marevlo.com`
   subscribed, and point the alarms at it.

**Verify:** force a test alarm (or temporarily lower a threshold) and confirm the
email lands.

---

## Pre-launch checklist (this section)
- [ ] SES domain `marevlo.com` verified, **out of sandbox**, SMTP creds created
- [ ] Password-reset email tested and not in spam
- [ ] `marevlo/prod` secret created; ECS role can read it; service boots clean
- [ ] `JWT_SECRET` regenerated (not the dev default)
- [ ] RDS automated backups ON (7+ days), deletion protection ON, manual snapshot taken
- [ ] CloudWatch logs flowing, dashboard up, alarms → SNS email working
- [ ] Prod env: `LOG_FORMAT=json`, `REQUIRE_DOB=true`, `SMTP_FROM=no-reply@marevlo.com`

*Note: this is operational guidance, not legal/security certification. Have your
DPDP/privacy compliance and payment setup reviewed by a lawyer and CA before launch.*
