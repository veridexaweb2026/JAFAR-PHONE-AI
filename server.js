import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";

const app = Fastify({ logger: true });

await app.register(websocket);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/", async () => ({ status: "Jafar Phone AI running" }));

app.post("/incoming-call", async (request, reply) => {
  console.log("INCOMING CALL RECEIVED");

  reply
    .type("text/xml")
    .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://jafar-phone-ai.onrender.com/media-stream"/>
  </Connect>
</Response>`);
});

app.get("/media-stream", { websocket: true }, (socket) => {
  console.log("TWILIO WEBSOCKET CONNECTED");

  let streamSid = null;

  const openai = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    }
  );

  openai.on("open", () => {
    console.log("OPENAI CONNECTED");

    openai.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        instructions:
          "أنت المساعد الهاتفي الآلي لجعفر. ابدأ الحديث بالعربية وعرّف نفسك بوضوح كمساعد جعفر الآلي. تحدث بصورة طبيعية ومختصرة. إذا تحدث المتصل بالعربية فاستخدم العربية السودانية، وإذا تحدث بالإنجليزية فاستخدم الإنجليزية.",
        audio: {
          input: {
            format: {
              type: "audio/pcmu"
            },
            turn_detection: {
              type: "server_vad",
              create_response: true,
              interrupt_response: true
            }
          },
          output: {
            format: {
              type: "audio/pcmu"
            },
            voice: "marin"
          }
        }
      }
    }));
  });

  openai.on("message", (raw) => {
    const data = JSON.parse(raw.toString());

    if (data.type === "error") {
      console.error("OPENAI ERROR", JSON.stringify(data));
      return;
    }

    if (
      data.type === "response.output_audio.delta" &&
      streamSid &&
      socket.readyState === WebSocket.OPEN
    ) {
      socket.send(JSON.stringify({
        event: "media",
        streamSid,
        media: {
          payload: data.delta
        }
      }));
    }
  });

  openai.on("error", (err) => {
    console.error("OPENAI WS ERROR", err.message);
  });

  openai.on("close", (code, reason) => {
    console.log("OPENAI CLOSED", code, reason.toString());
  });

  socket.on("message", (raw) => {
    const data = JSON.parse(raw.toString());

    if (data.event === "connected") {
      console.log("TWILIO CONNECTED EVENT");
    }

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("TWILIO STREAM STARTED", streamSid);
    }

    if (
      data.event === "media" &&
      openai.readyState === WebSocket.OPEN
    ) {
      openai.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload
      }));
    }

    if (data.event === "stop") {
      console.log("TWILIO STREAM STOPPED");
    }
  });

  socket.on("close", () => {
    console.log("TWILIO WEBSOCKET CLOSED");

    if (
      openai.readyState === WebSocket.OPEN ||
      openai.readyState === WebSocket.CONNECTING
    ) {
      openai.close();
    }
  });

  socket.on("error", (err) => {
    console.error("TWILIO WS ERROR", err.message);
  });
});

await app.listen({
  port: process.env.PORT || 10000,
  host: "0.0.0.0"
});
