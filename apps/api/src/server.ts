import { app } from "./app.js";

const PORT = process.env.API_PORT || 4000;

app.listen(PORT, () => {
  console.log(`[ClipForge API] Server listening on port ${PORT}`);
});
