import { Response } from "express";
import { JobProgressEvent } from "@clipforge/shared-types";

export class EventsService {
  private projectClients: Map<string, Set<Response>> = new Map();
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send keep-alive every 20 seconds to prevent reverse proxy timeouts
    this.keepAliveInterval = setInterval(() => {
      this.projectClients.forEach((clients) => {
        clients.forEach((res) => {
          try {
            res.write(": keepalive\n\n");
          } catch {
            // Ignore broken sockets; close event will clean up
          }
        });
      });
    }, 20000);

    if (this.keepAliveInterval.unref) {
      this.keepAliveInterval.unref();
    }
  }

  public registerClient(projectId: string, res: Response): void {
    if (!this.projectClients.has(projectId)) {
      this.projectClients.set(projectId, new Set());
    }

    const clientSet = this.projectClients.get(projectId)!;
    clientSet.add(res);

    // Initial connection acknowledgment
    res.write(`event: connected\ndata: ${JSON.stringify({ projectId, timestamp: new Date().toISOString() })}\n\n`);

    res.on("close", () => {
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.projectClients.delete(projectId);
      }
    });
  }

  public broadcastJobProgress(event: JobProgressEvent): void {
    const clients = this.projectClients.get(event.projectId);
    if (!clients || clients.size === 0) return;

    const payload = `event: job_progress\ndata: ${JSON.stringify(event)}\n\n`;

    clients.forEach((res) => {
      try {
        res.write(payload);
      } catch {
        // Socket error handled by close handler
      }
    });
  }

  public getSubscriberCount(projectId: string): number {
    return this.projectClients.get(projectId)?.size || 0;
  }
}

export const eventsService = new EventsService();

