import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import WebSocket from "ws";

const fastify = Fastify();
await fastify.register(formbody);
await fastify.register(websocket);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

fastify.get("/", async () => ({ status: "Jafar Phone AI running" }));

fastify.all("/incoming-call", async (request, reply) => {
  const host = request.headers.host;

  reply.type("text/xml").send(`
    <Response>
      <Connect>
        <Stream url="wss://${host}/media-stream" />
      </Connect>
    </Response>
  `);
});

fastify.get("/media-stream", { websocket: true }, (connection) => {
  const openai = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    }
  );

  let streamSid = null;

  openai.on("open", () => {
    openai.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        instructions:
          "You are Jafar's AI phone assistant. Clearly introduce yourself as Jafar's AI assistant. Speak naturally and briefly. Respond in Sudanese Arabic when the caller speaks Arabic, and English when the caller speaks English.",
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: { type: "server_vad" }
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: "marin"
          }
        }
      }
    }));
  });

  connection.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
    }

    if (data.event === "media" && openai.readyState === WebSocket.OPEN) {
      openai.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload
      }));
    }
  });

  openai.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "response.output_audio.delta" && streamSid) {
      connection.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: data.delta }
      }));
    }
  });

  connection.on("close", () => {
    if (openai.readyState === WebSocket.OPEN) openai.close();
  });
});

fastify.listen({
  port: process.env.PORT || 10000,
  host: "0.0.0.0"
});
