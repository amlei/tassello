import type {
  ExtensionAccountRequest,
  ExtensionAccountResult,
  ExtensionJob,
  ExtensionJobEvent,
  ExtensionJobResult,
  ExtensionLoginOpened,
  PublishCapabilityDTO,
} from "@tassello/shared";

export type StoredConnection = {
  apiOrigin: string;
  clientId: string;
  token: string;
  browserLabel: string;
  installationId: string;
};

export type BackgroundState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connection: StoredConnection | null;
  capability: PublishCapabilityDTO | null;
};

export type ServerMessage =
  | { type: "ready"; installationId: string }
  | { type: "ping" }
  | { type: "error"; error: string }
  | { type: "job.result.ack"; jobId: string }
  | ExtensionAccountRequest
  | { type: "job.dispatch"; job: ExtensionJob }
  | { type: "job.cancel"; jobId: string }
  | { type: "job.focusTab"; jobId: string; tabId: number }
  | { type: "job.closeTab"; jobId: string; tabId: number };

export type ClientMessage =
  | ExtensionJobEvent
  | ExtensionJobResult
  | ExtensionAccountResult
  | ExtensionLoginOpened;
