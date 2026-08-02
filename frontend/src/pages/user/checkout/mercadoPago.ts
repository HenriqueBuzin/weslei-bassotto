export type BrickController = { unmount?: () => void };

export function loadMercadoPagoScript() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export function safeUnmountBrick(controller: BrickController | null) {
  try {
    controller?.unmount?.();
  } catch {
    // The SDK can throw when React already removed the Brick container.
  }
}
