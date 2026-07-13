import http from "node:http";

const portIndex = process.argv.indexOf("--port");
const hostIndex = process.argv.indexOf("--host");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4317;
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : "127.0.0.1";

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("vnem-project-automation-fixture\n");
});

server.listen(port, host, () => console.log(`fixture-server:http://${host}:${port}/`));
