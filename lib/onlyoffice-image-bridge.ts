export type OfficeImageBridgeCommand = {
  id: string;
  documentId: string;
  imageUrl: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  createdAt: number;
  status: "queued" | "sent" | "done" | "failed";
  error?: string;
};

type BridgeStore = {
  commands: Map<string, OfficeImageBridgeCommand[]>;
};

const globalStore = globalThis as typeof globalThis & {
  __wzlcfOfficeImageBridge?: BridgeStore;
};

function store() {
  if (!globalStore.__wzlcfOfficeImageBridge) {
    globalStore.__wzlcfOfficeImageBridge = { commands: new Map() };
  }
  return globalStore.__wzlcfOfficeImageBridge;
}

export function enqueueOfficeImageCommand(command: Omit<OfficeImageBridgeCommand, "id" | "createdAt" | "status">) {
  const id = crypto.randomUUID();
  const next: OfficeImageBridgeCommand = {
    ...command,
    id,
    createdAt: Date.now(),
    status: "queued"
  };
  const commands = store().commands;
  const list = commands.get(command.documentId) || [];
  list.push(next);
  commands.set(command.documentId, list.slice(-30));
  return next;
}

export function takeNextOfficeImageCommand(documentId: string) {
  const list = store().commands.get(documentId) || [];
  const command = list.find(item => item.status === "queued");
  if (!command) return null;
  command.status = "sent";
  return command;
}

export function getOfficeImageCommand(documentId: string, commandId: string) {
  const list = store().commands.get(documentId) || [];
  return list.find(item => item.id === commandId) || null;
}

export function finishOfficeImageCommand(documentId: string, commandId: string, error?: string) {
  const list = store().commands.get(documentId) || [];
  const command = list.find(item => item.id === commandId);
  if (!command) return null;
  command.status = error ? "failed" : "done";
  command.error = error;
  return command;
}
