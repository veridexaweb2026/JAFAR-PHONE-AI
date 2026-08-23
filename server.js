import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import WebSocket from "ws";

const app = Fastify({ logger: true });

await app.register(formbody);
await app.register(websocket);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/", async () => ({
  status: "Jafar Phone AI running"
}));

app.post("/incoming-call", async (request, reply) => {
  console.log("INCOMING CALL RECEIVED");

  return reply
    .code(200)
    .type("text/xml")
    .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://jafar-phone-ai.onrender.com/media-stream" />
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

        instructions: "أنت مساعد جعفر الهاتفي. لا تتكلم من نفسك ولا تفتح أي موضوع. انتظر المتصل حتى ينتهي ثم أجب فقط على كلامه أو سؤاله. الرد جملة أو جملتان فقط. لا تخمن ولا تختلق معلومات عن جعفر. إذا لم تعرف قل: ما عندي المعلومة دي حالياً. لا تكرر ولا تقاطع. تحدث بالعربية السودانية الطبيعية، وإذا تحدث المتصل بالإنجليزية فرد بالإنجليزية باختصار.",

        audio: {
          input: {
            format: {
              type: "audio/pcmu"
            },
         turn_detection: {
  type: "server_vad",
  threshold: 0.6,
  prefix_padding_ms: 300,
  silence_duration_ms: 1200,
  create_response: true,
  interrupt_response: true
},
},         output: {
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
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "error") {
        console.error("OPENAI ERROR:", JSON.stringify(data));
        return;
      }

      if (
        data.type === "response.output_audio.delta" &&
        streamSid
      ) {
        socket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: {
            payload: data.delta
          }
        }));
      }
    } catch (err) {
      console.error("OPENAI MESSAGE ERROR:", err.message);
    }
  });

  openai.on("error", (err) => {
    console.error("OPENAI WS ERROR:", err.message);
  });

  openai.on("close", (code, reason) => {
    console.log(
      "OPENAI CLOSED:",
      code,
      reason.toString()
    );
  });

  socket.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.event === "connected") {
        console.log("TWILIO CONNECTED EVENT");
      }

      if (data.event === "start") {
        streamSid = data.start.streamSid;
        console.log(
          "TWILIO STREAM STARTED:",
          streamSid
        );
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
    } catch (err) {
      console.error(
        "TWILIO MESSAGE ERROR:",
        err.message
      );
    }
  });

  socket.on("close", () => {
    console.log("TWILIO WEBSOCKET CLOSED");

    if (openai.readyState < WebSocket.CLOSING) {
      openai.close();
    }
  });

  socket.on("error", (err) => {
    console.error(
      "TWILIO WS ERROR:",
      err.message
    );
  });
});

await app.listen({
  port: process.env.PORT || 10000,
  host: "0.0.0.0"
});
