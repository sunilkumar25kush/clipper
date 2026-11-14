import { app } from "./app.js";
import { jobService } from "./services/job.service.js";

const PORT = process.env.API_PORT || 4000;

app.listen(PORT, () => {
  console.log(`[ClipForge API] Server listening on port ${PORT}`);
  // Immediately process any pending queued jobs
  jobService.processPendingQueuedJobs().catch((err) => {
    console.error("[ClipForge API] Failed to start pending queued jobs:", err);
  });
});
