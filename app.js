import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const $ = (id) => document.getElementById(id);
let supabase = null, currentUser = null, currentProfile = null, employeeRows = [];

function getConfig(){ return {url:localStorage.getItem("hr_supabase_url")||"", key:localStorage.getItem("hr_supabase_key")||""}; }
function connect(){
  const c=getConfig();
  if(!c.url || !c.key) return false;
  try { supabase=createClient(c.url,c.key); return true; } catch(e){ console.error(e); return false; }
}
function notice(msg){ $("notice").textContent=msg; $("notice").classList.remove("hidden"); }
function clearNotice(){ $("notice").classList.add("hidden"); }
function safe(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showLogin(message=""){ $("loginView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("loginMessage").textContent=message; }
function showApp(){ $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden"); }
async function loadProfile(){
  const {data,error}=await supabase.from("profiles").select("*").eq("id",currentUser.id).maybeSingle();
  if(error) throw error; currentProfile=data;
  const role=data?.role||"مستخدم";
  $("userInfo").textContent=(data?.full_name||currentUser.email)+" · "+role;
}
async function countTable(table, target){
  const {count,error}=await supabase.from(table).select("*",{count:"exact",head:true});
  if(error){$(target).textContent="—";return;}
  $(target).textContent=count??0;
}
async function loadDashboard(){
  await Promise.all([
    countTable("employees","countEmployees"),
    countTable("departments","countDepartments"),
    countTable("forms","countForms"),
    countTable("form_submissions","countSubmissions")
  ]);
  $("connectionState").textContent="تم تسجيل الدخول والاتصال بقاعدة البيانات. البيانات المعروضة تخضع لسياسات RLS.";
}
function renderTable(target, rows){
  if(!rows || !rows.length){$(target).innerHTML='<p class="muted">لا توجد سجلات ظاهرة لهذا الحساب، أو لا توجد بيانات في الجدول.</p>';return;}
  const cols=Object.keys(rows[0]).slice(0,9);
  let html="<table><thead><tr>"+cols.map(c=>`<th>${safe(c)}</th>`).join("")+"</tr></thead><tbody>";
  for(const row of rows) html+="<tr>"+cols.map(c=>`<td title="${safe(typeof row[c]==="object"?JSON.stringify(row[c]):row[c])}">${safe(typeof row[c]==="object"?JSON.stringify(row[c]):row[c])}</td>`).join("")+"</tr>";
  html+="</tbody></table>"; $(target).innerHTML=html;
}
async function loadTable(table,target){
  $(target).textContent="جارٍ تحميل البيانات...";
  const {data,error}=await supabase.from(table).select("*").limit(100);
  if(error){$(target).innerHTML=`<p class="message">تعذر قراءة ${safe(table)}: ${safe(error.message)}</p>`;return [];}
  renderTable(target,data);return data||[];
}
async function loadAll(){
  await loadDashboard();
  employeeRows=await loadTable("employees","employeesTable");
  await loadTable("departments","departmentsTable");
  await loadTable("forms","formsTable");
  await loadTable("profiles","usersTable");
  await loadTable("audit_logs","auditTable");
  $("employeeCount").textContent=`${employeeRows.length} سجل معروض`;
}
async function login(){
  clearNotice();
  if(!connect()){showLogin("أدخل رابط المشروع والمفتاح العام أولاً ثم احفظ الإعدادات.");return;}
  const email=$("email").value.trim(), password=$("password").value;
  if(!email||!password){$("loginMessage").textContent="أدخل البريد الإلكتروني وكلمة المرور.";return;}
  $("loginBtn").disabled=true;$("loginBtn").textContent="جارٍ تسجيل الدخول...";
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  $("loginBtn").disabled=false;$("loginBtn").textContent="تسجيل الدخول";
  if(error){$("loginMessage").textContent=error.message;return;}
  currentUser=data.user;
  try{await loadProfile();showApp();await loadAll();}
  catch(e){showLogin("تم الدخول لكن تعذر قراءة ملف المستخدم: "+e.message);}
}
async function init(){
  const c=getConfig();$("projectUrl").value=c.url;$("publishableKey").value=c.key;
  $("saveConfigBtn").onclick=()=>{const url=$("projectUrl").value.trim(),key=$("publishableKey").value.trim();if(!/^https:\/\/.+\.supabase\.co$/.test(url)||!key){$("loginMessage").textContent="تحقق من رابط المشروع والمفتاح العام.";return;}localStorage.setItem("hr_supabase_url",url);localStorage.setItem("hr_supabase_key",key);$("loginMessage").textContent="تم حفظ إعداد الاتصال على هذا الجهاز.";connect();};
  $("loginBtn").onclick=login;
  $("password").addEventListener("keydown",e=>{if(e.key==="Enter")login();});
  $("logoutBtn").onclick=async()=>{if(supabase)await supabase.auth.signOut();currentUser=null;showLogin();};
  $("menuBtn").onclick=()=>$("nav").parentElement.classList.toggle("open");
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>goPage(b.dataset.page));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>goPage(b.dataset.go));
  $("refreshEmployees").onclick=async()=>{employeeRows=await loadTable("employees","employeesTable");$("employeeCount").textContent=`${employeeRows.length} سجل معروض`;};
  $("refreshDepartments").onclick=()=>loadTable("departments","departmentsTable");
  $("refreshForms").onclick=()=>loadTable("forms","formsTable");
  $("refreshUsers").onclick=()=>loadTable("profiles","usersTable");
  $("refreshAudit").onclick=()=>loadTable("audit_logs","auditTable");
  $("employeeSearch").oninput=e=>{const q=e.target.value.toLowerCase();const filtered=employeeRows.filter(r=>JSON.stringify(r).toLowerCase().includes(q));renderTable("employeesTable",filtered);};
  $("previewField").onclick=()=>{const label=$("fieldLabel").value.trim();if(!label)return;const item=document.createElement("div");item.className="field-item";item.innerHTML=`<span>${safe(label)} · ${safe($("fieldType").selectedOptions[0].textContent)}</span><span>معاينة</span>`;$("fieldPreview").appendChild(item);$("fieldLabel").value="";};
  $("prepareText").onclick=()=>{const text=$("sourceText").value.trim();const files=[...$("sourceFiles").files].map(f=>f.name);$("assistantPreview").textContent=(text||"لم يُلصق نص.")+(files.length?"\n\nالملفات المرفقة:\n"+files.join("\n"):"\n\nلم يتم إرفاق ملفات.");};
  $("sourceFiles").onchange=()=>{$("fileNames").textContent=[...$("sourceFiles").files].map(f=>f.name).join("، ");};
  connect();
  if(supabase){
    const {data}=await supabase.auth.getSession();
    if(data.session){currentUser=data.session.user;try{await loadProfile();showApp();await loadAll();}catch(e){showLogin("تعذر تحميل ملف المستخدم: "+e.message);}}
  }
}
function goPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  const titles={dashboard:"لوحة التحكم",employees:"الموظفون",departments:"الأقسام",forms:"الاستمارات",builder:"محرر الحقول",users:"المستخدمون والصلاحيات",assistant:"المساعد الذكي",audit:"سجل التدقيق"};
  $("pageTitle").textContent=titles[name]||"نظام الموارد البشرية";
  document.querySelector(".sidebar").classList.remove("open");
}
init();
