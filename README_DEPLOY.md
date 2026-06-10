# Marevlo — End-to-End AWS Deploy (no Vercel, no other platforms)

Everything runs in AWS: SPA on S3+CloudFront at `marevlo.com`, API + runner on
ECS Fargate behind an ALB, Postgres on RDS, Redis on ElastiCache, DNS + certs in
Route 53 + ACM. `marevlo.com/api/*` is proxied by CloudFront to the API, so the
frontend keeps `VITE_API_URL=/api` and there is **no CORS and no Vercel**.

```
                 marevlo.com (apex, Route53 alias)
                          │
                    ┌─────▼─────┐
                    │ CloudFront│  ── default ──▶ S3 (private SPA, OAC)
                    └─────┬─────┘  ── /api/*  ──▶ ALB ──▶ ECS api ──▶ RDS / Redis
                          │                                     │
                          │                                     └▶ ECS runner (isolated SG)
                       ACM (us-east-1 for CF, ap-south-1 for ALB)
```

---

## 1. What you do in Squarespace (the entire list)

You need DNS in Route 53 because an apex domain can't CNAME to CloudFront — only
Route 53 alias records work at the root. Pick ONE:

- **Fast (go live this week):** keep registration at Squarespace, set its
  **custom nameservers** to the 4 from `terraform output nameservers`.
  Squarespace: Domains → your domain → DNS / Nameservers → use custom NS.
- **Clean (single-cloud, ~5–6 days):** transfer the registrar to Route 53.
  Squarespace: unlock domain, turn off WHOIS privacy, copy the auth code; start
  the transfer in Route 53. Cancellation window is ~5 days; after that AWS is
  both registrar and DNS.

Nothing else from Squarespace. No Squarespace hosting, no DNS records there once
delegated. (Move email to SES — it's already in the stack.)

---

## 2. Deploy order (chicken-and-egg matters)

```bash
cd terraform
terraform init

# (a) Create JUST the hosted zone first, read the nameservers, set them in
#     Squarespace, and WAIT for DNS to propagate. ACM DNS-validation below
#     will hang until the NS delegation is live.
terraform apply -target=aws_route53_zone.main
terraform output nameservers      # paste these 4 into Squarespace, then wait

# (b) Once `dig NS marevlo.com` shows the AWS nameservers, apply everything.
#     ACM certs validate via the Route53 records automatically.
terraform apply

terraform output                  # spa_bucket, cloudfront_distribution_id,
                                  # ecr_api, ecr_runner, app_secret_arn
```

Then fill the secret (`app_secret_arn`) with the real Firebase JSON + SES SMTP
creds (left blank by Terraform on purpose), and push code — CI does the rest.

---

## 3. CI/CD (GitHub Actions)

`.github/workflows/frontend.yml` — builds the Vite SPA, syncs to the SPA bucket,
invalidates CloudFront. `backend.yml` — builds the api + runner images, pushes to
ECR with the git SHA, and rolls them through ECS via Terraform (Terraform stays
the single source of truth, no task-def drift).

**One-time setup:** create a GitHub OIDC deploy role in AWS and set repo secrets:
`AWS_DEPLOY_ROLE_ARN`, `SPA_BUCKET`, `CLOUDFRONT_DIST_ID`, and the `VITE_FIREBASE_*`
build vars. (OIDC instead of long-lived keys — no static AWS secrets in GitHub.)

---

## 4. Cost ballpark (ap-south-1, ~2k users)

Rough monthly, on-demand, before free-tier: RDS t4g.micro ~$13, ElastiCache
t4g.micro ~$12, ALB ~$18, NAT gateway ~$32 (the sneaky one), Fargate api 2×0.5vCPU
~$30, runner 1×1vCPU ~$30, CloudFront/S3/Route53 ~$5–15. **~$150–180/mo** at this
size. The NAT gateway is the line item people forget — if cost matters early, a
single NAT (as configured) is the compromise; for true HA you'd run one per AZ.

---

## 5. Honest status / caveats

- **Not `terraform plan`-tested.** This was authored without access to your AWS
  account and without the Terraform binary available in the build environment.
  Brace/paren balance and variable types are checked. Run `terraform init &&
  terraform plan` and expect to fix a few account-specific details (AZ counts,
  engine minor versions, IAM least-privilege tightening) before `apply`.
- **Runner isolation** is enforced via security groups: the data-tier SG accepts
  traffic only from the API SG, never the runner SG. The runner still has NAT
  egress (for image pulls/logs). Locking egress fully (VPC endpoints + no NAT)
  belongs with the gVisor hardening — this is the same stopgap posture as the
  compose change, translated to ECS.
- **Course content gating** is still open: static course HTML, once in S3 behind
  CloudFront, is public to anyone with the URL. Gating it (CloudFront signed
  URLs/cookies or a Lambda@Edge `/me/access` check) is the next unit and is now
  straightforward because you're on CloudFront.
- **MIRA** is still wired in the Backend image; remove it (the 5-file delete)
  before the first build or the image will pull Anthropic/Qdrant deps you don't
  need yet. Qdrant has no home in this Terraform on purpose.
- **JupyterHub / notebooks**: not provisioned here. It needs Docker-in-Docker or
  a separate spawner host and is a security project of its own — deploy it
  after the core platform is live, on its own isolated host.
```
