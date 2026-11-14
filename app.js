import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const $ = (id) => document.getElementById(id);
let supabase = null, currentUser = null, currentProfile = null, employeeRows = [], departmentRows = [];

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
async function loadEmployees(){
  $("employeesTable").textContent="جارٍ تحميل بيانات الموظفين...";
  const {data,error}=await supabase.from("employees")
    .select("id,employee_number,full_name,department_id,workplace,residence,phone,job_title,created_at,departments(name)")
    .order("created_at",{ascending:false}).limit(500);
  if(error){
    $("employeesTable").innerHTML=`<p class="message">تعذر قراءة الموظفين: ${safe(error.message)}</p>`;
    employeeRows=[];
    $("employeeCount").textContent="تعذر تحميل السجلات";
    return;
  }
  employeeRows=data||[];
  renderEmployees(employeeRows);
  $("employeeCount").textContent=`${employeeRows.length} سجل معروض`;
}
function renderEmployees(rows){
  if(!rows.length){
    $("employeesTable").innerHTML='<p class="muted">لا توجد سجلات موظفين. يمكنك إضافة أول موظف من زر «إضافة موظف».</p>';
    return;
  }
  let html='<table><thead><tr><th>الرقم الوظيفي</th><th>الاسم الكامل</th><th>القسم</th><th>المسمى الوظيفي</th><th>مكان العمل</th><th>السكن</th><th>الهاتف</th><th>الإجراءات</th></tr></thead><tbody>';
  for(const r of rows){
    const dept=r.departments?.name || "—";
    html+=`<tr>
      <td>${safe(r.employee_number||"—")}</td><td>${safe(r.full_name)}</td><td>${safe(dept)}</td>
      <td>${safe(r.job_title||"—")}</td><td>${safe(r.workplace||"—")}</td><td>${safe(r.residence||"—")}</td><td>${safe(r.phone||"—")}</td>
      <td class="actions-cell"><button class="small-action edit-action" data-edit="${safe(r.id)}">تعديل</button><button class="small-action delete-action" data-delete="${safe(r.id)}">حذف</button></td>
    </tr>`;
  }
  html+="</tbody></table>";
  $("employeesTable").innerHTML=html;
  $("employeesTable").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editEmployee(b.dataset.edit)));
  $("employeesTable").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteEmployee(b.dataset.delete)));
}
async function loadDepartmentsForSelect(){
  const {data,error}=await supabase.from("departments").select("id,name").order("name");
  if(error){notice("تعذر تحميل الأقسام: "+error.message);return;}
  departmentRows=data||[];
  $("employeeDepartment").innerHTML='<option value="">بدون قسم</option>'+departmentRows.map(d=>`<option value="${safe(d.id)}">${safe(d.name)}</option>`).join("");
}
function clearEmployeeForm(){
  $("employeeForm").reset();
  $("employeeId").value="";
  $("employeeFormTitle").textContent="إضافة موظف جديد";
  $("saveEmployeeBtn").textContent="حفظ الموظف";
  $("employeeFormMessage").textContent="";
}
async function openEmployeeForm(row=null){
  clearEmployeeForm();
  await loadDepartmentsForSelect();
  if(row){
    $("employeeFormTitle").textContent="تعديل بيانات الموظف";
    $("saveEmployeeBtn").textContent="حفظ التعديلات";
    $("employeeId").value=row.id;
    $("employeeFullName").value=row.full_name||"";
    $("employeeNumber").value=row.employee_number||"";
    $("employeeDepartment").value=row.department_id||"";
    $("employeeJobTitle").value=row.job_title||"";
    $("employeeWorkplace").value=row.workplace||"";
    $("employeeResidence").value=row.residence||"";
    $("employeePhone").value=row.phone||"";
  }
  $("employeeFormPanel").classList.remove("hidden");
  $("employeeFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function closeEmployeeForm(){ $("employeeFormPanel").classList.add("hidden"); clearEmployeeForm(); }
function editEmployee(id){
  const row=employeeRows.find(r=>String(r.id)===String(id));
  if(row) openEmployeeForm(row);
}
async function saveEmployee(event){
  event.preventDefault();
  const id=$("employeeId").value;
  const full_name=$("employeeFullName").value.trim();
  if(!full_name){$("employeeFormMessage").textContent="يرجى إدخال الاسم الكامل.";return;}
  const payload={
    full_name,
    employee_number:$("employeeNumber").value.trim()||null,
    department_id:$("employeeDepartment").value||null,
    job_title:$("employeeJobTitle").value.trim()||null,
    workplace:$("employeeWorkplace").value.trim()||null,
    residence:$("employeeResidence").value.trim()||null,
    phone:$("employeePhone").value.trim()||null
  };
  $("saveEmployeeBtn").disabled=true;
  $("saveEmployeeBtn").textContent="جارٍ الحفظ...";
  $("employeeFormMessage").textContent="";
  try{
    let result;
    if(id) result=await supabase.from("employees").update(payload).eq("id",id);
    else result=await supabase.from("employees").insert(payload);
    if(result.error) throw result.error;
    closeEmployeeForm();
    notice(id?"تم تعديل بيانات الموظف بنجاح.":"تمت إضافة الموظف بنجاح.");
    await loadEmployees();
    await countTable("employees","countEmployees");
  }catch(e){
    $("employeeFormMessage").textContent="تعذر الحفظ: "+(e.message||"خطأ غير معروف");
  }finally{
    $("saveEmployeeBtn").disabled=false;
    $("saveEmployeeBtn").textContent=id?"حفظ التعديلات":"حفظ الموظف";
  }
}
async function deleteEmployee(id){
  const row=employeeRows.find(r=>String(r.id)===String(id));
  if(!row)return;
  if(!confirm(`هل أنت متأكد من حذف الموظف: ${row.full_name}؟ لا يمكن التراجع عن الحذف.`))return;
  const {error}=await supabase.from("employees").delete().eq("id",id);
  if(error){notice("تعذر حذف الموظف: "+error.message);return;}
  notice("تم حذف الموظف.");
  await loadEmployees();
  await countTable("employees","countEmployees");
}
async function loadAll(){
  await loadDashboard();
  await loadEmployees();
  await loadTable("departments","departmentsTable");
  await loadTable("forms","formsTable");
  await loadTable("profiles","usersTable");
  await loadTable("audit_logs","auditTable");
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
  $("refreshEmployees").onclick=loadEmployees;
  $("addEmployeeBtn").onclick=()=>openEmployeeForm();
  $("closeEmployeeForm").onclick=closeEmployeeForm;
  $("cancelEmployeeBtn").onclick=closeEmployeeForm;
  $("employeeForm").addEventListener("submit",saveEmployee);
  $("refreshDepartments").onclick=()=>loadTable("departments","departmentsTable");
  $("refreshForms").onclick=()=>loadTable("forms","formsTable");
  $("refreshUsers").onclick=()=>loadTable("profiles","usersTable");
  $("refreshAudit").onclick=()=>loadTable("audit_logs","auditTable");
  $("employeeSearch").oninput=e=>{
    const q=e.target.value.trim().toLowerCase();
    const filtered=employeeRows.filter(r=>JSON.stringify(r).toLowerCase().includes(q));
    renderEmployees(filtered);
    $("employeeCount").textContent=`${filtered.length} نتيجة`;
  };
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
