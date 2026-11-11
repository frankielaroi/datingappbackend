import "socket.io";

declare module "socket.io" {
  interface Socket {
    decoded: { userId: string; [key: string]: unknown };
  }
}
