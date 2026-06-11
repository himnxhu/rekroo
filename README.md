# Rekroo

Phase-one MVP for an AI recruitment automation product:

- Candidate CRM
- CSV upload
- AI calling campaign queue placeholder
- WhatsApp reminder/JD placeholder
- shadcn-compatible UI components

## Run locally

```bash
npm install
docker compose up -d postgres
npm run db:generate
npm run db:push
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Create `.env.local` from `.env.example` when provider keys are ready:

```bash
DATABASE_URL="postgresql://rekroo:rekroo@127.0.0.1:55432/rekroo?schema=public"
AUTH_SECRET="replace-with-a-long-random-secret"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_PHONE_NUMBER=""
SARVAM_API_KEY=""
GEMINI_API_KEY=""
WATI_API_KEY=""
WATI_BASE_URL=""
```

PostgreSQL is wired through Prisma. The calling and WhatsApp routes persist campaign/call/message records now, but still need Twilio and WATI credentials before they send real calls or messages.
