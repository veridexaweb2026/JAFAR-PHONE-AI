import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import fs from "fs";

const app = Fastify({ logger: true });

await app.register(formbody);
await app.register(websocket);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const sbHeaders = {
  apikey: SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
  "Content-Type": "application/json"
};

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: sbHeaders
    });

    if (!res.ok) {
      console.error("SUPABASE GET FAILED:", res.status, await res.text());
      return [];
    }

    return await res.json();
  } catch (err) {
    console.error("SUPABASE GET ERROR:", err.message);
    return [];
  }
}

async function supabaseInsert(table, data) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...sbHeaders,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      console.error("SUPABASE INSERT FAILED:", res.status, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("SUPABASE INSERT ERROR:", err.message);
    return false;
  }
}

async function supabaseUpdate(table, id, data) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          ...sbHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify(data)
      }
    );

    return res.ok;
  } catch (err) {
    console.error("SUPABASE UPDATE ERROR:", err.message);
    return false;
  }
}

async function supabaseDelete(table, id) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      {
        method: "DELETE",
        headers: sbHeaders
      }
    );

    return res.ok;
  } catch (err) {
    console.error("SUPABASE DELETE ERROR:", err.message);
    return false;
  }
}

async function loadMemory() {
  const rows = await supabaseGet(
    "jafar_memory?active=eq.true&select=id,category,content&order=id.desc"
  );

  return rows
    .map((row) => `[${row.category}] ${row.content}`)
    .join("\n");
}

async function loadSchedule() {
  const now = new Date().toISOString();

  const rows = await supabaseGet(
    `jafar_schedule?active=eq.true&ends_at=gte.${encodeURIComponent(now)}&select=id,title,details,starts_at,ends_at,share_with_callers&order=starts_at.asc&limit=20`
  );

  return rows.map((row) => {
    if (row.share_with_callers) {
      return `[مسموح بالمشاركة]
العنوان: ${row.title}
التفاصيل: ${row.details || ""}
البداية: ${row.starts_at}
النهاية: ${row.ends_at || ""}`;
    }

    return `[خاص - لا تكشفي التفاصيل]
جعفر لديه ارتباط من ${row.starts_at} إلى ${row.ends_at || "وقت غير محدد"}.
إذا سأل المتصل عن هذا الوقت، قولي فقط إن جعفر لديه ارتباط في ذلك الوقت.`;
  }).join("\n\n");
}

app.get("/", async () => ({
  status: "Jafar Phone AI running"
}));

app.get("/admin", async (request, reply) => {
  try {
    const html = fs.readFileSync("./admin.html", "utf8");
    return reply.type("text/html; charset=utf-8").send(html);
  } catch {
    return reply.code(500).send("Admin page unavailable");
  }
});

/* MEMORY */

app.get("/admin/memory", async () => {
  return await supabaseGet(
    "jafar_memory?active=eq.true&select=id,category,content&order=id.desc"
  );
});

app.post("/admin/memory", async (request, reply) => {
  const { category, content } = request.body || {};

  if (!category || !content) {
    return reply.code(400).send({ error: "Missing data" });
  }

  const ok = await supabaseInsert("jafar_memory", {
    category,
    content,
    active: true
  });

  return ok
    ? { success: true }
    : reply.code(500).send({ error: "Save failed" });
});

app.put("/admin/memory/:id", async (request, reply) => {
  const { content } = request.body || {};

  if (!content) {
    return reply.code(400).send({ error: "Missing content" });
  }

  const ok = await supabaseUpdate(
    "jafar_memory",
    request.params.id,
    { content }
  );

  return ok
    ? { success: true }
    : reply.code(500).send({ error: "Update failed" });
});

app.delete("/admin/memory/:id", async (request, reply) => {
  const ok = await supabaseDelete(
    "jafar_memory",
    request.params.id
  );

  return ok
    ? { success: true }
    : reply.code(500).send({ error: "Delete failed" });
});

/* SCHEDULE */

app.get("/admin/schedule", async () => {
  return await supabaseGet(
    "jafar_schedule?active=eq.true&select=id,title,details,starts_at,ends_at,share_with_callers&order=starts_at.asc"
  );
});

app.post("/admin/schedule", async (request, reply) => {
  const {
    title,
    details,
    starts_at,
    ends_at,
    share_with_callers
  } = request.body || {};

  if (!title || !starts_at) {
    return reply.code(400).send({ error: "Missing data" });
  }

  const ok = await supabaseInsert("jafar_schedule", {
    title,
    details: details || null,
    starts_at,
    ends_at: ends_at || null,
    share_with_callers: share_with_callers === true,
    active: true
  });

  return ok
    ? { success: true }
    : reply.code(500).send({ error: "Save failed" });
});

app.put("/admin/schedule/:id", async (request, reply) => {
  const { title, details } = request.body || {};

  if (!title) {
    return reply.code(400).send({ error: "Missing title" });
  }

  const ok = await supabaseUpdate(
    "jafar_schedule",
    request.params.id,
    {
      title,
      details: details || null
    }
  );

  return ok
    ? { success: true }
    : reply.code(500).send({ error: "Update failed" });
});

app.delete("/admin/schedule/:id", async (request, reply) => {
  const ok = await supabaseDelete(
    "jafar_schedule",
    request.params.id
  );

  return ok
    ? { success: true }
    : reply.code(500).send({ error: "Delete failed" });
});

/* CALL LOG */

app.get("/admin/calls", async () => {
  return await supabaseGet(
    "jafar_calls?select=id,caller_number,caller_name,reason,message,summary,called_at&order=called_at.desc&limit=100"
  );
});

/* PHONE */

app.post("/incoming-call", async (request, reply) => {
  console.log("INCOMING CALL RECEIVED");

  const callerNumber = request.body?.From || "Unknown";

  return reply
    .code(200)
    .type("text/xml")
    .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://jafar-phone-ai.onrender.com/media-stream">
      <Parameter name="callerNumber" value="${callerNumber}" />
    </Stream>
  </Connect>
</Response>`);
});

app.get("/media-stream", { websocket: true }, (socket) => {
  console.log("TWILIO WEBSOCKET CONNECTED");

  let streamSid = null;
  let greetingSent = false;
  let callerNumber = "Unknown";
  let callSaved = false;

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

    openai.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",

        instructions: `أنتِ مساعدة جعفر الهاتفية.

ابدئي المكالمة بالسلام عليكم فقط ثم انتظري المتصل.
لا تقاطعي المتصل.
انتظري حتى ينتهي من كلامه.
أجيبي فقط على كلامه أو سؤاله.
الرد جملة أو جملتان فقط.
لا تفتحي موضوعاً من نفسك.
لا تخمني ولا تختلقي معلومات عن جعفر.
لا تكرري الكلام.
تحدثي بالعربية السودانية الطبيعية وبصيغة المؤنث.
إذا تحدث المتصل بالإنجليزية فردي بالإنجليزية باختصار.

إذا كان المتصل يريد جعفر أو يريد ترك رسالة، حاولي بصورة طبيعية معرفة:
اسمه، سبب الاتصال، والرسالة التي يريد إيصالها.
لا تحولي المكالمة إلى استجواب.
اسألي فقط عن المعلومات الضرورية.

قبل انتهاء المحادثة، عندما تتوفر معلومات كافية، استخدمي أداة save_call_record لحفظ بيانات المكالمة.
لا تخبري المتصل عن الأداة أو قاعدة البيانات.

استخدمي ذاكرة جعفر فقط عندما تكون مرتبطة مباشرة بسؤال المتصل.
لا تسردي الذاكرة من نفسك.

المواعيد الخاصة سرية.
يمكنك فقط القول إن جعفر لديه ارتباط في ذلك الوقت.
المواعيد المسموح بمشاركتها يمكن ذكر تفاصيلها عند الحاجة.

إذا لم تعرفي الإجابة فقولي:
ما عندي المعلومة دي حالياً.

ذاكرة جعفر:
${memory || "لا توجد معلومات محفوظة."}

برنامج جعفر الحالي:
${schedule || "لا توجد ارتباطات حالية أو قادمة مسجلة."}`,

        tools: [
          {
            type: "function",
            name: "save_call_record",
            description: "احفظ معلومات المتصل وسبب الاتصال والرسالة وملخص المكالمة لجعفر.",
            parameters: {
              type: "object",
              properties: {
                caller_name: {
                  type: "string",
                  description: "اسم المتصل إذا ذكره"
                },
                reason: {
                  type: "string",
                  description: "سبب الاتصال باختصار"
                },
                message: {
                  type: "string",
                  description: "الرسالة التي يريد المتصل إيصالها لجعفر"
                },
                summary: {
                  type: "string",
                  description: "ملخص قصير جداً للمكالمة"
                }
              },
              required: [
                "caller_name",
                "reason",
                "message",
                "summary"
              ]
            }
          }
        ],

        tool_choice: "auto",

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
    }));
  });

  openai.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (
        data.type === "session.updated" &&
        !greetingSent
      ) {
        greetingSent = true;

        openai.send(JSON.stringify({
          type: "response.create",
          response: {
            instructions: "قولي فقط: السلام عليكم"
          }
        }));
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
        socket.send(JSON.stringify({
          event: "media",
          streamSid,
          media: {
            payload: data.delta
          }
        }));
      }

      if (
        data.type === "response.function_call_arguments.done" &&
        data.name === "save_call_record" &&
        !callSaved
      ) {
        let args = {};

        try {
          args = JSON.parse(data.arguments || "{}");
        } catch {
          args = {};
        }

        const ok = await supabaseInsert("jafar_calls", {
          caller_number: callerNumber,
          caller_name: args.caller_name || null,
          reason: args.reason || null,
          message: args.message || null,
          summary: args.summary || null,
          called_at: new Date().toISOString()
        });

        if (ok) {
          callSaved = true;
          console.log("CALL RECORD SAVED:", callerNumber);
        }

        if (data.call_id) {
          openai.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: data.call_id,
              output: JSON.stringify({
                success: ok
              })
            }
          }));
        }
      }
    } catch (err) {
      console.error(
        "OPENAI MESSAGE ERROR:",
        err.message
      );
    }
  });

  openai.on("error", (err) => {
    console.error(
      "OPENAI WS ERROR:",
      err.message
    );
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

        callerNumber =
          data.start?.customParameters?.callerNumber ||
          callerNumber;

        console.log(
          "TWILIO STREAM STARTED:",
          streamSid
        );

        console.log(
          "CALLER NUMBER:",
          callerNumber
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

  socket.on("close", async () => {
    console.log("TWILIO WEBSOCKET CLOSED");

    if (!callSaved) {
      await supabaseInsert("jafar_calls", {
        caller_number: callerNumber,
        caller_name: null,
        reason: null,
        message: null,
        summary: "مكالمة واردة - لم يتم جمع تفاصيل كافية.",
        called_at: new Date().toISOString()
      });

      console.log(
        "BASIC CALL RECORD SAVED:",
        callerNumber
      );
    }

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
