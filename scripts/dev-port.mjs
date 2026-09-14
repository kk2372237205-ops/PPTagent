import { createServer } from "net";

function candidatePorts() {
  const requested = Number(process.env.DEV_PORT || process.env.PORT || 0);
  const defaults = [
    3000,
    3001,
    ...Array.from({ length: 50 }, (_, index) => 3200 + index),
    ...Array.from({ length: 50 }, (_, index) => 4200 + index)
  ];
  return [...new Set([requested, ...defaults].filter(port => Number.isInteger(port) && port > 0 && port < 65536))];
}

export function canListen(port, host = "0.0.0.0") {
  return new Promise(resolve => {
    const server = createServer();
    const finish = (available) => {
      server.removeAllListeners();
      resolve(available);
    };
    server.once("error", () => finish(false));
    server.listen({ host, port, exclusive: true }, () => server.close(() => finish(true)));
  });
}

function requestSystemPort(host = "0.0.0.0") {
  return new Promise(resolve => {
    const server = createServer();
    const finish = (port) => {
      server.removeAllListeners();
      resolve(port);
    };
    server.once("error", () => finish(null));
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => finish(port));
    });
  });
}

export async function chooseDevPort() {
  for (const port of candidatePorts()) {
    if (await canListen(port)) return port;
  }

  // Docker/Hyper-V can reserve a different low-port range after each reboot.
  // Let Windows choose a valid port when every human-friendly candidate is reserved.
  const systemPort = await requestSystemPort();
  if (systemPort) return systemPort;

  throw new Error("找不到可用开发端口；Windows 未能分配任何可监听端口。");
}