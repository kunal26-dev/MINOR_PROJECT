# Smart Notes Finder

Academic resource sharing and study progress app for students and teachers.

## Deploy the frontend to Vercel

1. Import `kunal26-dev/MINOR_PROJECT` in Vercel.
2. Set the project root directory to `frontend`. Vercel will use `npm run build` and `dist`.
3. After the Render API is deployed, add `VITE_API_URL` to the Vercel project's Production environment, using `https://<render-service>.onrender.com/api`.
4. Redeploy the frontend after setting the API URL.

`frontend/vercel.json` configures single-page app routes to serve the Vite entry point.

## Deploy the API to Render

Create a Render Blueprint from this repository's `render.yaml`. It creates a free Node web service from `backend/Min/server`.

Set these values in Render's environment configuration; do not commit them:

- `MONGO_URI`: the MongoDB Atlas connection string. Allow Render's outbound connections in the Atlas network access settings.
- `CLIENT_URL`: the exact Vercel production origin, such as `https://<project>.vercel.app` (no `/api`).
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: values for the seeded administrator. Keep the password private and use at least 8 characters.

Render generates `JWT_SECRET`. Once the service is live, run `npm run seed` from the backend service shell to create the administrator, categories, and semester subjects. Check `GET /api/health` on the Render service to confirm its API and database connection.

## Free-tier limitations

The free Render service uses an ephemeral filesystem and spins down when idle. This app stores uploaded files on local disk, so uploaded files can be lost when the service sleeps, restarts, or redeploys. The free instance can also take about a minute to wake after inactivity. This setup is for a demo, not reliable production file storage.
