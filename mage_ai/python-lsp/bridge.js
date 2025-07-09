const WebSocket = require("ws");
const cp = require("child_process");

// Start the pyright LSP process
const lspProcess = cp.spawn("pyright-langserver", ["--stdio"]);
console.log("Pyright LSP server started", lspProcess.pid);

// Create the WebSocket server
const wss = new WebSocket.Server({ port: 3030 });

wss.on("connection", (ws) => {
  console.log("Client connected");

  // Buffer to collect incomplete messages
  let buffer = Buffer.alloc(0);

  // When pyright writes to stdout, parse LSP messages
  lspProcess.stdout.on("data", (data) => {
    // Append new data to the buffer
    buffer = Buffer.concat([buffer, data]);

    // Loop to process multiple messages in the buffer
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        // Not enough data yet
        break;
      }

      // Parse headers
      const header = buffer.slice(0, headerEnd).toString();
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        console.error("Invalid header:", header);
        break;
      }

      const length = parseInt(match[1], 10);
      const totalMessageLength = headerEnd + 4 + length;

      if (buffer.length < totalMessageLength) {
        // Wait for more data
        break;
      }

      // Extract the JSON body
      const content = buffer.slice(headerEnd + 4, totalMessageLength);
      buffer = buffer.slice(totalMessageLength); // Remove processed message

      // ===== 👇👇👇 THIS IS WHERE YOU SEND TO CLIENT 👇👇👇 =====
      // OPTION A: Send JSON only (e.g., Monaco)
      ws.send(content.toString("utf8"));

      // OPTION B: Send LSP framed message (many editors)
      // If you want framed message instead of plain JSON:
      // const body = content.toString("utf8");
      // const framed = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n` + body;
      // ws.send(framed);
      // ========================================================
    }
  });

  // When the client sends a message
  ws.on("message", (message) => {
    // Wrap the message with LSP framing and send to pyright
    const body = Buffer.from(message, "utf8");
    const header = `Content-Length: ${body.length}\r\n\r\n`;
    lspProcess.stdin.write(header);
    lspProcess.stdin.write(body);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

console.log("LSP WebSocket proxy listening on ws://localhost:3030");
