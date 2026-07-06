# Roomlog Requirements

## Local Runtime

- Node.js 24.x
- Corepack
- pnpm 11.7.0
- Web app: Next.js, default port `3000`
- API server: NestJS, default port `4000`

After cloning or pulling a new branch, restore workspace dependencies first:

```bash
corepack pnpm install
```

## Environment Variables

Local secrets must live in the root `.env` file. Do not commit `.env`.

Required for local API/web integration:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
PORT=4000
```

Required for NVIDIA-hosted floor plan analysis:

```bash
NVIDIA_API_KEY=...
NVIDIA_INTEGRATE_API_URL=https://integrate.api.nvidia.com/v1
```

Required for OpenAI vision-first floor plan analysis:

```bash
OPENAI_API_KEY=...
OPENAI_FLOOR_PLAN_MODEL=gpt-5.4-mini
```

Optional local/demo values:

```bash
ROOMLOG_SEED_DEMO=true
```

Reserved OCR variables may remain in `.env.example`, but `nvidia/nemotron-ocr-v2`
is not enabled unless a compatible hosted endpoint is available from NVIDIA.

## Floor Plan AI Flow

The browser uploads the floor plan image and stores the original image as an
attachment before AI analysis. The AI request should prefer:

```json
{
  "sourceAttachmentId": "attachment-id",
  "modelId": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
}
```

The compressed `imageDataUrl` fallback is only for cases where the attachment
source is unavailable. This avoids sending large base64 payloads through JSON
and keeps the model input aligned with the original drawing.

Currently supported hosted model IDs:

- `openai/floor-plan-vision`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- `nvidia/cosmos3-nano-reasoner`

## Local Development

Run the API and web app from the repo root:

```bash
CI=true corepack pnpm --filter api start:dev
CI=true corepack pnpm --filter web dev
```

Open the floor plan editor at:

```text
http://localhost:3000/floor-plan-3d
```

## Verification Commands

Use these checks before pushing changes that touch the floor plan flow:

```bash
CI=true corepack pnpm --filter api test
CI=true corepack pnpm --filter web build
node --test apps/web/property-shell.spec.mjs
```
