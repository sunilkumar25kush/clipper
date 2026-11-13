import { UserDTO } from "@clipforge/shared-types";

declare global {
  namespace Express {
    interface Request {
      user?: UserDTO;
      sessionId?: string;
    }
  }
}

