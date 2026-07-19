/// <reference types="vite/client" />

declare module "*.css";

interface Window {
  MercadoPago?: new (
    publicKey: string,
    options: { locale: string },
  ) => {
    bricks: () => {
      create: (type: string, containerId: string, options: unknown) => Promise<{ unmount?: () => void }>;
    };
  };
}
