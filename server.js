<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jafar AI</title>

<style>
body{
  font-family:Arial,sans-serif;
  max-width:650px;
  margin:auto;
  padding:18px;
  background:#f3f4f6;
}
h1{text-align:center}
.card{
  background:white;
  padding:18px;
  margin-bottom:18px;
  border-radius:14px;
}
input,textarea,select,button{
  width:100%;
  box-sizing:border-box;
  padding:12px;
  margin-top:7px;
  margin-bottom:10px;
  font-size:16px;
}
button{
  cursor:pointer;
  font-weight:bold;
}
.item{
  border:1px solid #ddd;
  border-radius:10px;
  padding:12px;
  margin:10px 0;
}
.item p{
  white-space:pre-wrap;
}
.actions{
  display:flex;
  gap:8px;
}
.actions button{
  width:50%;
}
.status{
  text-align:center;
  font-weight:bold;
  margin:10px;
}
small{color:#666}
</style>
</head>

<body>

<h1>Jafar AI</h1>

<div class="card">
<h2>🧠 إضافة للذاكرة</h2>

<select id="category">
<option value="personal">معلومة شخصية</option>
<option value="business">عمل</option>
<option value="instruction">تعليمات للمساعدة</option>
<option value="temporary">معلومة مؤقتة</option>
</select>

<textarea id="memory" rows="4"
placeholder="اكتب المعلومة هنا"></textarea>

<button onclick="addMemory()">حفظ في الذاكرة</button>
</div>

<div class="card">
<h2>📅 إضافة موعد</h2>

<input id="title" placeholder="اسم الموعد">

<textarea id="details" rows="3"
placeholder="ملاحظات"></textarea>

<label>البداية</label>
<input id="start" type="datetime-local">

<label>النهاية</label>
<input id="end" type="datetime-local">

<label>هل مسموح للمساعدة بذكر التفاصيل؟</label>

<select id="share">
<option value="false">لا - خاص</option>
<option value="true">نعم</option>
</select>

<button onclick="addSchedule()">حفظ الموعد</button>
</div>

<div id="status" class="status"></div>

<div class="card">
<h2>🧠 الذاكرة المحفوظة</h2>
<button onclick="loadMemory()">تحديث</button>
<div id="memoryList">جاري التحميل...</div>
</div>

<div class="card">
<h2>📅 المواعيد المحفوظة</h2>
<button onclick="loadSchedule()">تحديث</button>
<div id="scheduleList">جاري التحميل...</div>
</div>

<script>

function status(msg){
  document.getElementById("status").textContent=msg;
}

async function addMemory(){
  const category=document.getElementById("category").value;
  const content=document.getElementById("memory").value.trim();

  if(!content){
    status("اكتب المعلومة أولاً");
    return;
  }

  const r=await fetch("/admin/memory",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({category,content})
  });

  if(r.ok){
    document.getElementById("memory").value="";
    status("✅ تم حفظ المعلومة");
    loadMemory();
  }else{
    status("❌ فشل حفظ المعلومة");
  }
}

async function addSchedule(){

  const title=document.getElementById("title").value.trim();
  const details=document.getElementById("details").value.trim();
  const starts_at=document.getElementById("start").value;
  const ends_at=document.getElementById("end").value;

  const share_with_callers=
    document.getElementById("share").value==="true";

  if(!title || !starts_at){
    status("اكتب اسم الموعد ووقت البداية");
    return;
  }

  const r=await fetch("/admin/schedule",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      title,
      details,
      starts_at,
      ends_at:ends_at||null,
      share_with_callers
    })
  });

  if(r.ok){
    document.getElementById("title").value="";
    document.getElementById("details").value="";
    document.getElementById("start").value="";
    document.getElementById("end").value="";
    status("✅ تم حفظ الموعد");
    loadSchedule();
  }else{
    status("❌ فشل حفظ الموعد");
  }
}

async function loadMemory(){

  const r=await fetch("/admin/memory");

  if(!r.ok){
    document.getElementById("memoryList").textContent=
      "تعذر تحميل الذاكرة";
    return;
  }

  const rows=await r.json();

  const box=document.getElementById("memoryList");
  box.innerHTML="";

  if(!rows.length){
    box.textContent="لا توجد معلومات";
    return;
  }

  rows.forEach(row=>{

    const div=document.createElement("div");
    div.className="item";

    const p=document.createElement("p");
    p.textContent=row.content;

    const small=document.createElement("small");
    small.textContent=row.category;

    const actions=document.createElement("div");
    actions.className="actions";

    const edit=document.createElement("button");
    edit.textContent="تعديل";
    edit.onclick=()=>editMemory(row);

    const del=document.createElement("button");
    del.textContent="حذف";
    del.onclick=()=>deleteMemory(row.id);

    actions.append(edit,del);
    div.append(p,small,actions);
    box.appendChild(div);
  });
}

async function editMemory(row){

  const content=prompt(
    "عدّل المعلومة:",
    row.content
  );

  if(content===null || !content.trim()) return;

  const r=await fetch(
    "/admin/memory/"+row.id,
    {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        content:content.trim()
      })
    }
  );

  if(r.ok){
    status("✅ تم تعديل المعلومة");
    loadMemory();
  }else{
    status("❌ فشل التعديل");
  }
}

async function deleteMemory(id){

  if(!confirm("حذف هذه المعلومة؟")) return;

  const r=await fetch(
    "/admin/memory/"+id,
    {method:"DELETE"}
  );

  if(r.ok){
    status("✅ تم حذف المعلومة");
    loadMemory();
  }else{
    status("❌ فشل الحذف");
  }
}

async function loadSchedule(){

  const r=await fetch("/admin/schedule");

  if(!r.ok){
    document.getElementById("scheduleList").textContent=
      "تعذر تحميل المواعيد";
    return;
  }

  const rows=await r.json();

  const box=document.getElementById("scheduleList");
  box.innerHTML="";

  if(!rows.length){
    box.textContent="لا توجد مواعيد";
    return;
  }

  rows.forEach(row=>{

    const div=document.createElement("div");
    div.className="item";

    const title=document.createElement("strong");
    title.textContent=row.title;

    const p=document.createElement("p");

    const start=new Date(row.starts_at).toLocaleString();
    const end=row.ends_at
      ?new Date(row.ends_at).toLocaleString()
      :"غير محدد";

    p.textContent=
      `${row.details||""}\n${start} - ${end}`;

    const small=document.createElement("small");
    small.textContent=
      row.share_with_callers
      ?"مسموح بالمشاركة"
      :"خاص";

    const actions=document.createElement("div");
    actions.className="actions";

    const edit=document.createElement("button");
    edit.textContent="تعديل";
    edit.onclick=()=>editSchedule(row);

    const del=document.createElement("button");
    del.textContent="حذف";
    del.onclick=()=>deleteSchedule(row.id);

    actions.append(edit,del);
    div.append(title,p,small,actions);
    box.appendChild(div);
  });
}

async function editSchedule(row){

  const title=prompt(
    "اسم الموعد:",
    row.title
  );

  if(title===null || !title.trim()) return;

  const details=prompt(
    "الملاحظات:",
    row.details||""
  );

  if(details===null) return;

  const r=await fetch(
    "/admin/schedule/"+row.id,
    {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        title:title.trim(),
        details
      })
    }
  );

  if(r.ok){
    status("✅ تم تعديل الموعد");
    loadSchedule();
  }else{
    status("❌ فشل تعديل الموعد");
  }
}

async function deleteSchedule(id){

  if(!confirm("حذف هذا الموعد؟")) return;

  const r=await fetch(
    "/admin/schedule/"+id,
    {method:"DELETE"}
  );

  if(r.ok){
    status("✅ تم حذف الموعد");
    loadSchedule();
  }else{
    status("❌ فشل حذف الموعد");
  }
}

loadMemory();
loadSchedule();

</script>

</body>
</html>
