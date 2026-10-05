export interface CastSession {
  sendMessage(namespace: string, message: unknown): Promise<void>;
}
export interface SenderContext {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
}
export interface ReceiverContext {
  addCustomMessageListener(namespace: string, listener: (event: { data: unknown; senderId: string }) => void): void;
  removeCustomMessageListener(namespace: string, listener: (event: { data: unknown; senderId: string }) => void): void;
  sendCustomMessage(namespace: string, senderId: string, data: unknown): void;
  start(options: { disableIdleTimeout: boolean; statusText: string; customNamespaces: Record<string, string> }): void;
}
export type CastWindow = Window & {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: { framework?: {
    CastContext?: { getInstance(): SenderContext };
    CastReceiverContext?: { getInstance(): ReceiverContext };
    system?: { MessageType: { JSON: string } };
  } };
};
