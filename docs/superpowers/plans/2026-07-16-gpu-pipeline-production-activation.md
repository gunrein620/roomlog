# GPU Pipeline Production Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the existing production GPU reconstruction orchestrator using the current production AWS access key and the GPU settings already stored in GitHub `PROD_ENV`.

**Architecture:** Keep the existing Docker Compose, GitHub Actions, EC2 lifecycle, and SSM Run Command architecture unchanged. Add a least-privilege inline IAM policy to the IAM principal behind the current production key, deploy `main`, and verify activation without submitting a real reconstruction job.

**Tech Stack:** AWS IAM, EC2, Systems Manager Run Command, GitHub Actions, Docker Compose, NestJS

## Global Constraints

- Do not print AWS secret values or `GPU_WORKER_SECRET`.
- Limit EC2 lifecycle and SSM command dispatch to `i-061e16af461c7c5df` in `us-east-1`.
- Do not start the GPU instance during permission or activation verification.
- Do not change existing S3 permissions.
- A real video end-to-end run is outside this activation task.

---

### Task 1: Identify and authorize the production AWS principal

**Files:**
- No repository files modified.

**Interfaces:**
- Consumes: AWS credentials already present in the production API container.
- Produces: An IAM principal with the exact EC2 and SSM permissions used by `GpuInstanceService`.

- [ ] **Step 1: Identify the caller without exposing credentials**

Run a signed STS `GetCallerIdentity` request from the production API environment and record only the caller ARN.

- [ ] **Step 2: Prepare the inline policy**

Use this policy document:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DescribeGpuInstance",
      "Effect": "Allow",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    },
    {
      "Sid": "StartStopRoomlogGpu",
      "Effect": "Allow",
      "Action": ["ec2:StartInstances", "ec2:StopInstances"],
      "Resource": "arn:aws:ec2:us-east-1:324037284963:instance/i-061e16af461c7c5df"
    },
    {
      "Sid": "SendRoomlogGpuCommand",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:us-east-1:324037284963:instance/i-061e16af461c7c5df",
        "arn:aws:ssm:us-east-1::document/AWS-RunShellScript"
      ]
    },
    {
      "Sid": "MonitorRoomlogGpuCommand",
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeInstanceInformation",
        "ssm:GetCommandInvocation",
        "ssm:CancelCommand"
      ],
      "Resource": "*"
    }
  ]
}
```

- [ ] **Step 3: Attach the inline policy**

In IAM, attach the document as `RoomlogGpuOrchestrator` to the identified principal.

- [ ] **Step 4: Verify permissions without starting the GPU**

Run:

```text
DescribeInstances(instance ID)       → allowed
StartInstances(instance ID, DryRun) → DryRunOperation
DescribeInstanceInformation         → allowed
```

Do not call `SendCommand` because it has no dry-run mode.

### Task 2: Deploy the GPU environment configuration

**Files:**
- No repository files modified.

**Interfaces:**
- Consumes: Existing GitHub `PROD_ENV` and `.github/workflows/deploy.yml`.
- Produces: The four GPU variables in the production API container.

- [ ] **Step 1: Trigger the Deploy workflow on `main`**

Use the existing `workflow_dispatch` entry in `.github/workflows/deploy.yml`.

- [ ] **Step 2: Wait for the workflow conclusion**

Expected: the `Deploy` workflow completes successfully. If it fails, inspect the failing step before changing any production state manually.

- [ ] **Step 3: Verify deployed environment flags**

On `/home/ubuntu/roomlog`, verify only set/unset status for:

```text
GPU_PIPELINE_ENABLED
GPU_INSTANCE_ID
GPU_REGION
GPU_WORKER_SECRET
```

Expected: all four are set in `.env` and `roomlog-api`.

### Task 3: Verify orchestrator activation

**Files:**
- No repository files modified.

**Interfaces:**
- Consumes: Running production API and configured AWS permissions.
- Produces: Evidence that the orchestrator is active and the GPU remains stopped when the queue is empty.

- [ ] **Step 1: Check API container health**

Expected: `roomlog-api` is running after deployment.

- [ ] **Step 2: Check the activation log**

Expected log:

```text
GPU pipeline enabled
```

- [ ] **Step 3: Check for authorization errors**

Expected: no `UnauthorizedOperation`, `AccessDenied`, or credential provider errors in recent reconstruction logs.

- [ ] **Step 4: Confirm GPU state**

Expected: GPU instance remains `stopped` because no real reconstruction job was submitted.
