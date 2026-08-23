import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import WebSocket from "ws";

const app = Fastify({ logger: true });

await app.register(formbody);
await app.register(websocket);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`
      }
    });

    if (!res.ok) {
      console.error("SUPABASE GET FAILED:", res.status, path);
      return [];
    }

    return await res.json();
  } catch (err) {
    console.error("SUPABASE ERROR:", err.message);
    return [];
  }
}

async function loadMemory() {
  const rows = await supabaseGet(
    "jafar_memory?active=eq.true&select=category,content"
  );

  return rows
    .map((row) => `[${row.category}] ${row.content}`)
    .join("\n");
}

async function loadSchedule() {
  const now = new Date().toISOString();

  const rows = await supabaseGet(
    `jafar_schedule?active=eq.true&ends_at=gte.${encodeURIComponent(now)}&select=title,details,starts_at,ends_at,share_with_callers&order=starts_at.asc&limit=20`
  );

  return rows
    .map((row) => {
      if (row.share_with_callers) {
        return `[مسموح بالمشاركة]
العنوان: ${row.title}
التفاصيل: ${row.details || ""}
البداية: ${row.starts_at}
النهاية: ${row.ends_at || ""}`;
      }

      return `[خاص - لا تكشفي التفاصيل للمتصل]
جعفر لديه ارتباط من ${row.starts_at} إلى ${row.ends_at || "وقت غير محدد"}.
إذا سأل المتصل عن هذا الوقت، قولي فقط إن جعفر لديه ارتباط في ذلك الوقت.`;
    })
    .join("\n\n");
}

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
  let greetingSent = false;

  const openai = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    }
  );

  openai.on("open", async () => {
    console.log("OPENAI CONNECTED");

    const [memory, schedule] = await Promise.all([
      loadMemory(),
      loadSchedule()
    ]);

    console.log("MEMORY LOADED:", memory ? "YES" : "EMPTY");
    console.log("SCHEDULE LOADED:", schedule ? "YES" : "EMPTY");

    openai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",

          instructions: `أنتِ مساعدة جعفر الهاتفية.

بعد التحية انتظري المتصل حتى ينتهي من كلامه.
أجيبي فقط على كلامه أو سؤاله.
الرد جملة أو جملتان فقط.
لا تفتحي موضوعاً من نفسك.
لا تخمني ولا تختلقي معلومات عن جعفر.
لا تكرري الكلام ولا تقاطعي المتصل.
تحدثي بالعربية السودانية الطبيعية وبصيغة المؤنث.
إذا تحدث المتصل بالإنجليزية فردي بالإنجليزية باختصار.

استخدمي ذاكرة جعفر فقط عندما تكون مرتبطة مباشرة بسؤال المتصل.
لا تسردي الذاكرة من نفسك.

لديك أيضاً برنامج جعفر الحالي.
المواعيد المكتوب عليها "خاص" سرية.
يمكنك معرفة أن جعفر مشغول في ذلك الوقت، لكن لا تكشفي اسم الموعد أو تفاصيله.
المواعيد المكتوب عليها "مسموح بالمشاركة" يمكن ذكر تفاصيلها عند الحاجة.

إذا لم تعرفي الإجابة، لا تخمني وقولي:
ما عندي المعلومة دي حالياً.

ذاكرة جعفر:
${memory || "لا توجد معلومات محفوظة."}

برنامج جعفر الحالي:
${schedule || "لا توجد ارتباطات حالية أو قادمة مسجلة."}`,

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
      })
    );
  });

  openai.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (
        data.type === "session.updated" &&
        !greetingSent
      ) {
        greetingSent = true;

        openai.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions: "قولي فقط: السلام عليكم"
            }
          })
        );
      }

      if (data.type === "error") {
        console.error(
          "OPENAI ERROR:",
          JSON.stringify(data)
        );
        return;
      }

      if (
        data.type === "response.output_audio.delta" &&
        streamSid
      ) {
        socket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: {
              payload: data.delta
            }
          })
        );
      }
    } catch (err) {
      console.error(
        "OPENAI MESSAGE ERROR:",
        err.message
      );
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
        openai.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: data.media.payload
          })
        );
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
    console.error("TWILIO WS ERROR:", err.message);
  });
});

await app.listen({
  port: process.env.PORT || 10000,
  host: "0.0.0.0"
});
