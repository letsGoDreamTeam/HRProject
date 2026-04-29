import { useState, useCallback, useRef, useEffect } from "react"

/* ══════════════════════════ TYPES ══════════════════════════ */

interface QuestionItem {
  q: string; type?: string; difficulty?: string
  intent?: string; reason?: string; evaluation_point?: string
  score?: number; score_reason?: string; _db_id?: number
}
interface InterviewBundle {
  applicant_summary?: string
  job_basic?: QuestionItem[]; job_intermediate?: QuestionItem[]
  job_advanced?: QuestionItem[]; personality?: QuestionItem[]
}
type SectionKey = "job_basic" | "job_intermediate" | "job_advanced" | "personality"
interface InterviewerInfo { id: number; name: string; email?: string }

interface ApplicantInfo {
  id:string; name:string; birthDate:string; contact:string; email:string
  address:string; originalJobRole:string; finalEducation:string
  careerPeriod:string; careerCompany:string; careerRole:string; fileType:string
}
const REC_KEYS: (keyof ApplicantInfo)[] = ["id","name","birthDate","contact","email","address","originalJobRole","finalEducation","careerPeriod","careerCompany","careerRole","fileType"]
const REC_LABELS: Record<keyof ApplicantInfo, string> = { id:"고유 ID",name:"이름",birthDate:"생년월일",contact:"연락처",email:"이메일",address:"주소",originalJobRole:"원문 지원직무",finalEducation:"최종학력",careerPeriod:"경력기간",careerCompany:"경력회사",careerRole:"경력직무",fileType:"파일형식" }
const TABLE_COLS = REC_KEYS.filter((k): k is Exclude<keyof ApplicantInfo,"id"> => k !== "id")
type ParseItem  = { filename:string; record:ApplicantInfo }
type ParseError = { filename:string; detail:string }
type ParseResp  = { items:ParseItem[]; errors:ParseError[]; excelBase64:string|null; excelFileName:string|null }

/* ══════════════════════════ CONSTANTS ══════════════════════ */

const apiBase = (import.meta.env.VITE_API_BASE as string|undefined) ?? ""

const SECTIONS: { key:SectionKey; label:string; target:number; accent:string; dot:string; light:string }[] = [
  { key:"job_basic",        label:"직무 기본",      target:2, accent:"text-sky-700",    dot:"bg-sky-500",    light:"bg-sky-50"    },
  { key:"job_intermediate", label:"직무 중간",      target:3, accent:"text-indigo-700", dot:"bg-indigo-500", light:"bg-indigo-50" },
  { key:"job_advanced",     label:"직무 심화",      target:2, accent:"text-violet-700", dot:"bg-violet-500", light:"bg-violet-50" },
  { key:"personality",      label:"인성/실무 스타일", target:3, accent:"text-teal-700",   dot:"bg-teal-500",   light:"bg-teal-50"   },
]

/* ══════════════════════════ UTILS ═════════════════════════ */

function dedupeKey(f:File){ return `${f.name}\0${f.size}\0${f.lastModified}` }
function mergeUnique(prev:File[], next:File[]): File[] {
  const s=new Set(prev.map(dedupeKey)); const o=[...prev]
  for(const f of next) if(!s.has(dedupeKey(f))){ s.add(dedupeKey(f)); o.push(f) }
  return o
}
function dlExcel(b64:string, name:string){
  const bin=atob(b64); const by=new Uint8Array(bin.length)
  for(let i=0;i<bin.length;i++) by[i]=bin.charCodeAt(i)
  const url=URL.createObjectURL(new Blob([by],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}))
  Object.assign(document.createElement("a"),{href:url,download:name}).click()
  URL.revokeObjectURL(url)
}
function plausibleYmd(y:number,mo:number,d:number){ return y>=1900&&y<=2100&&mo>=1&&mo<=12&&d>=1&&d<=31 }
function displayDates(t:string){
  let s=t
  s=s.replace(/\b(\d{4})[-./](\d{2})[-./](\d{2})\b/g,(_,y,m,d)=>`${y}.${m}.${d}`)
  s=s.replace(/\b(\d{8})\b/g,(w,v)=>{ const y=+v.slice(0,4),mo=+v.slice(4,6),d=+v.slice(6); return plausibleYmd(y,mo,d)?`${v.slice(0,4)}.${v.slice(4,6)}.${v.slice(6)}`:w })
  return s
}

/* ══════════════════════════ SMALL ATOMS ═══════════════════ */

const Spin = ({cls="w-4 h-4"}:{cls?:string}) => (
  <svg className={`${cls} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
  </svg>
)

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>
}

/* ══════════════════════════ QUESTION ROW ══════════════════ */

function QRow({ item, idx, checked, onCheck, isLiked, isDisliked, onLike, onDislike }:{
  item:QuestionItem; idx:number
  checked:boolean; onCheck:()=>void
  isLiked:boolean; isDisliked:boolean
  onLike:()=>void; onDislike:()=>void
}) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(item.intent || item.reason || item.evaluation_point)

  const typeCls: Record<string,string> = {
    기술:"bg-blue-100 text-blue-800", 경험:"bg-indigo-100 text-indigo-800",
    상황:"bg-orange-100 text-orange-800", 인성:"bg-teal-100 text-teal-800",
  }
  const diffCls: Record<string,string> = {
    기본:"bg-green-100 text-green-800", 중간:"bg-yellow-100 text-yellow-800", 심화:"bg-red-100 text-red-800",
  }
  const scoreCls = item.score !== undefined
    ? item.score>=80 ? "bg-emerald-100 text-emerald-800"
    : item.score>=60 ? "bg-amber-100 text-amber-800"
    : "bg-red-100 text-red-800" : ""

  return (
    <div className={`question-row relative transition-colors duration-150
      ${isDisliked ? "bg-gray-50/80" : checked ? "bg-indigo-50/40" : "hover:bg-gray-50/60"}`}>

      {/* checked accent strip */}
      {checked && <div className="absolute left-0 inset-y-0 w-[3px] bg-indigo-500 rounded-r-sm"/>}

      <div className="flex items-start gap-4 px-7 py-4">

        {/* Checkbox */}
        <button
          type="button"
          onClick={onCheck}
          disabled={!item._db_id}
          className={`mt-[3px] w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center
            shrink-0 transition-all duration-150 cursor-pointer
            disabled:opacity-30 disabled:cursor-not-allowed
            ${checked
              ? "bg-indigo-600 border-indigo-600 shadow-sm shadow-indigo-200"
              : "border-gray-300 bg-white hover:border-indigo-400 hover:shadow-sm"}`}>
          {checked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          )}
        </button>

        {/* Body */}
        <div className="flex-1 min-w-0">

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[11px] font-bold text-gray-300 mr-0.5">Q{idx}</span>
            {item.type      && <Badge cls={typeCls[item.type]  ?? "bg-gray-100 text-gray-700"}>{item.type}</Badge>}
            {item.difficulty && <Badge cls={diffCls[item.difficulty] ?? "bg-gray-100 text-gray-700"}>{item.difficulty}</Badge>}
            {item.score !== undefined && <Badge cls={scoreCls}>{item.score}점</Badge>}
          </div>

          {/* Question text */}
          <p className={`text-[15px] leading-relaxed font-medium
            ${isDisliked ? "line-through text-gray-400" : "text-gray-800"}`}>
            {item.q}
          </p>

          {/* Expand toggle */}
          {hasDetail && (
            <button
              type="button"
              onClick={() => setOpen(v=>!v)}
              className="mt-2.5 flex items-center gap-1.5 text-xs text-gray-400
                hover:text-indigo-600 transition-colors font-medium">
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${open?"rotate-180":""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
              </svg>
              {open ? "접기" : "의도 · 근거 · 평가포인트 보기"}
            </button>
          )}

          {/* Expanded detail */}
          {open && hasDetail && (
            <div className="mt-3 rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              {[["의도", item.intent], ["근거", item.reason], ["평가포인트", item.evaluation_point]].map(([lbl, val]) =>
                val ? (
                  <div key={lbl} className="flex gap-4 px-5 py-3 border-b border-gray-50 last:border-0">
                    <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-gray-400 pt-0.5">{lbl}</span>
                    <span className="text-sm text-gray-600 leading-relaxed">{val}</span>
                  </div>
                ) : null
              )}
              {item.score_reason && (
                <div className="flex gap-4 px-5 py-3 bg-gray-50/50">
                  <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-gray-300 pt-0.5">점수 근거</span>
                  <span className="text-sm text-gray-400 leading-relaxed">{item.score_reason}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Like / Dislike */}
        <div className="flex gap-1 shrink-0 mt-0.5">
          <button type="button" onClick={onLike} title="좋아요 — 재생성 참고"
            className={`p-2 rounded-xl transition-all duration-150 active:scale-90
              ${isLiked ? "bg-indigo-100 text-indigo-600" : "text-gray-300 hover:bg-indigo-50 hover:text-indigo-500"}`}>
            <svg className="w-4 h-4" fill={isLiked?"currentColor":"none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isLiked?0:2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>
            </svg>
          </button>
          <button type="button" onClick={onDislike} title="싫어요 — 재생성 제외"
            className={`p-2 rounded-xl transition-all duration-150 active:scale-90
              ${isDisliked ? "bg-red-100 text-red-500" : "text-gray-300 hover:bg-red-50 hover:text-red-500"}`}>
            <svg className="w-4 h-4" fill={isDisliked?"currentColor":"none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isDisliked?0:2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════ PARSE TAB ══════════════════════ */

function ParseTab() {
  const [items,setItems]=useState<ParseItem[]>([]); const [errors,setErrors]=useState<ParseError[]>([])
  const [excelB64,setExcelB64]=useState<string|null>(null); const [excelName,setExcelName]=useState<string|null>(null)
  const [loading,setLoading]=useState(false); const [err,setErr]=useState<string|null>(null)
  const [drag,setDrag]=useState(false); const depth=useRef(0); const acc=useRef<File[]>([]); const [cnt,setCnt]=useState(0)

  const onFiles=useCallback(async(fl:FileList|null,r?:HTMLInputElement|null)=>{
    if(!fl?.length) return
    const merged=mergeUnique(acc.current,Array.from(fl)); const prev=acc.current
    acc.current=merged; setErr(null); setLoading(true)
    const form=new FormData(); for(const f of merged) form.append("files",f,f.name)
    try{
      const res=await fetch(`${apiBase}/api/parse`,{method:"POST",body:form})
      if(!res.ok) throw new Error((await res.text())||res.statusText)
      const d=(await res.json()) as ParseResp
      setItems(d.items); setErrors(d.errors); setExcelB64(d.excelBase64); setExcelName(d.excelFileName); setCnt(merged.length)
      if(!d.items.length&&!d.errors.length) setErr("결과가 없습니다.")
    } catch(e){ acc.current=prev; setCnt(prev.length); setErr(e instanceof Error?e.message:"오류 발생") }
    finally{ setLoading(false); if(r) r.value="" }
  },[])

  const onDE=useCallback((e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();depth.current++;setDrag(true)},[])
  const onDL=useCallback((e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();if(--depth.current<=0){depth.current=0;setDrag(false)}},[])
  const onDO=useCallback((e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect="copy"},[])
  const onDrop=useCallback((e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();depth.current=0;setDrag(false);if(e.dataTransfer.files?.length) void onFiles(e.dataTransfer.files)},[onFiles])

  return (
    <div className="parse-panel flex-1 overflow-y-auto p-8">
      <div className="w-full">
        <h2 className="text-xl font-bold text-gray-900 mb-1">이력서 일괄 파싱</h2>
        <p className="text-sm text-gray-500 mb-6">PDF · DOCX · HWP 파일을 업로드하면 구조화 데이터로 추출하고 Excel로 저장합니다.</p>
        <div onDragEnter={onDE} onDragLeave={onDL} onDragOver={onDO} onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed py-16 text-center transition-all duration-200
            upload-dropzone
            ${drag?"border-indigo-400 bg-indigo-50/60":"border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}
            ${loading?"opacity-50 pointer-events-none":""}`}>
          <label htmlFor="fp" className="cursor-pointer flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${drag?"bg-indigo-100":"bg-gray-100"}`}>
              <svg className={`w-8 h-8 ${drag?"text-indigo-500":"text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-700">{drag?"놓으면 업로드":"파일을 끌어다 놓거나 클릭해 선택"}</p>
              <p className="text-sm text-gray-400 mt-1">PDF, DOCX, HWP — 여러 파일 동시 가능</p>
            </div>
            {cnt>0&&<span className="rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold px-4 py-1.5">누적 {cnt}개 처리됨</span>}
          </label>
          <input id="fp" type="file" multiple accept=".pdf,.docx,.doc,.hwp,.pptx,application/*" className="sr-only" disabled={loading} onChange={e=>void onFiles(e.target.files,e.target)}/>
        </div>
        {loading&&<div className="mt-6 flex justify-center gap-2 text-indigo-600"><Spin/><span className="text-sm animate-pulse">파싱 중…</span></div>}
        {err&&<div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-600">{err}</div>}
        {errors.length>0&&<div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4"><p className="text-sm font-bold text-amber-700 mb-2">일부 파일 오류</p><ul className="space-y-1 text-xs text-amber-600">{errors.map(e=><li key={e.filename+e.detail}><b>{e.filename}</b> — {e.detail}</li>)}</ul></div>}
        {items.length>0&&(
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-gray-700">추출 결과 <span className="text-indigo-600">{items.length}건</span></p>
              {excelB64&&excelName&&<button onClick={()=>dlExcel(excelB64,excelName)} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white text-sm font-bold px-4 py-2 hover:bg-emerald-700 active:scale-95 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                {excelName} 다운로드
              </button>}
            </div>
            <div className="data-table-shell overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
              <table className="w-max min-w-full border-collapse text-sm text-left">
                <thead><tr className="bg-gray-50">{[["원본 파일","sticky left-0 z-20 bg-gray-50 min-w-[12rem] border-r"],...TABLE_COLS.map(k=>[REC_LABELS[k],"min-w-[8rem]"])].map(([lbl,cls],i)=><th key={i} className={`border-b border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 ${cls??""}`}>{lbl}</th>)}</tr></thead>
                <tbody>{items.map((it,ri)=>(
                  <tr key={it.record.id||ri} className={`${ri%2?"bg-gray-50/50":"bg-white"} hover:bg-indigo-50/20 transition-colors`}>
                    <th scope="row" className={`sticky left-0 z-10 border-b border-r border-gray-100 px-4 py-3 text-xs font-medium text-gray-600 max-w-[16rem] ${ri%2?"bg-gray-50/50":"bg-white"}`} title={it.filename}><span className="break-all">{it.filename}</span></th>
                    {TABLE_COLS.map(k=><td key={k} className="border-b border-gray-100 px-4 py-3 text-gray-700 max-w-[22rem]"><span className="block whitespace-pre-wrap break-words leading-relaxed">{it.record[k]?displayDates(String(it.record[k])):""}</span></td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════ MAIN APP ═══════════════════════ */

export default function App() {
  const [tab, setTab] = useState<"interview"|"parse">("interview")

  const [resumeFile,          setResumeFile]          = useState<File|null>(null)
  const [jobDesc,             setJobDesc]              = useState("")
  const [bundle,              setBundle]               = useState<InterviewBundle|null>(null)
  const [iqLoading,           setIqLoading]            = useState(false)
  const [iqError,             setIqError]              = useState<string|null>(null)
  const [selected,            setSelected]             = useState<Set<number>>(new Set())
  const [likes,               setLikes]                = useState<Set<string>>(new Set())
  const [dislikes,            setDislikes]             = useState<Set<string>>(new Set())
  const [sessionId,           setSessionId]            = useState<number|null>(null)
  const [interviewers,        setInterviewers]         = useState<InterviewerInfo[]>([])
  const [selectedInterviewer, setSelectedInterviewer]  = useState<number|null>(null)
  const [saveLoading,         setSaveLoading]          = useState(false)
  const [saveSuccess,         setSaveSuccess]          = useState(false)
  const [showSetup,           setShowSetup]            = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${apiBase}/api/interviewers`).then(r=>r.ok?r.json():Promise.reject()).then((d:InterviewerInfo[])=>setInterviewers(d)).catch(()=>{})
  }, [])

  const totalQs = bundle ? SECTIONS.reduce((a,s)=>a+(bundle[s.key]?.length??0),0) : 0

  const toggleLike = useCallback((q:string, dbId?:number) => {
    const was=likes.has(q)
    setLikes(p=>{
      const n=new Set(p)
      if (was) n.delete(q)
      else n.add(q)
      return n
    })
    setDislikes(p=>{const n=new Set(p);n.delete(q);return n})
    if(dbId&&sessionId) void fetch(`${apiBase}/api/interview-questions/${dbId}/react`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reaction:was?"none":"like",session_id:sessionId})})
  }, [likes, sessionId])

  const toggleDislike = useCallback((q:string, dbId?:number) => {
    const was=dislikes.has(q)
    setDislikes(p=>{
      const n=new Set(p)
      if (was) n.delete(q)
      else n.add(q)
      return n
    })
    setLikes(p=>{const n=new Set(p);n.delete(q);return n})
    if(dbId&&sessionId) void fetch(`${apiBase}/api/interview-questions/${dbId}/react`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reaction:was?"none":"dislike",session_id:sessionId})})
  }, [dislikes, sessionId])

  const toggleSelect = useCallback((id:number) => {
    setSelected(p=>{
      const n=new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const allIds = useCallback(():number[] => {
    if(!bundle) return []
    return SECTIONS.flatMap(s => (bundle[s.key]??[]).map(q=>q._db_id).filter((id):id is number => !!id))
  }, [bundle])

  const generate = useCallback(async () => {
    setIqError(null); setBundle(null); setSelected(new Set()); setSaveSuccess(false)
    if(!resumeFile){ setIqError("이력서 파일을 선택해 주세요."); return }
    if(!jobDesc.trim()){ setIqError("직무기술서를 입력해 주세요."); return }
    setIqLoading(true)
    const form=new FormData()
    form.append("resume",resumeFile,resumeFile.name)
    form.append("job_description_text",jobDesc.trim())
    if(likes.size)    form.append("liked_questions",JSON.stringify([...likes]))
    if(dislikes.size) form.append("disliked_questions",JSON.stringify([...dislikes]))
    if(sessionId)     form.append("session_id",String(sessionId))
    try{
      const res=await fetch(`${apiBase}/api/interview-questions`,{method:"POST",body:form})
      const text=await res.text()
      if(!res.ok) throw new Error(text||res.statusText)
      const d=JSON.parse(text) as {bundle?:InterviewBundle;sessionId?:number}
      setBundle(d.bundle??null)
      if (d.bundle) setShowSetup(false)
      if(d.sessionId) setSessionId(d.sessionId)
    } catch(e){ setIqError(e instanceof Error?e.message:"면접 질문 생성 실패.") }
    finally{ setIqLoading(false) }
  }, [resumeFile, jobDesc, likes, dislikes, sessionId])

  const saveSelected = useCallback(async () => {
    if(!selected.size) return
    setSaveLoading(true); setSaveSuccess(false)
    try{
      const res=await fetch(`${apiBase}/api/interview-questions/save-selected`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question_ids:[...selected],interviewer_id:selectedInterviewer,session_id:sessionId})})
      if(!res.ok) throw new Error(await res.text())
      setSaveSuccess(true); setTimeout(()=>setSaveSuccess(false),6000)
    } catch(e){ alert(e instanceof Error?e.message:"저장 실패") }
    finally{ setSaveLoading(false) }
  }, [selected, selectedInterviewer, sessionId])

  /* ─────────────────────── RENDER ─────────────────────── */
  return (
    <div className="app-shell h-screen flex flex-col bg-[#F8F9FC] overflow-hidden">

      {/* ═══ HEADER ═══ */}
      <header className="app-header h-14 shrink-0 bg-white border-b border-gray-200 flex items-center px-6 gap-6 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-[15px] tracking-tight">AI 면접 도우미</span>
        </div>

        <nav className="app-tabs flex gap-1">
          {(["interview","parse"] as const).map(t=>(
            <button key={t} type="button" onClick={()=>setTab(t)}
              className={`tab-btn px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                ${tab===t ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
              {t==="interview" ? "면접 질문 생성" : "이력서 파싱"}
            </button>
          ))}
        </nav>

        {sessionId && (
          <div className="ml-auto flex items-center gap-1.5 text-sm text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
            세션 #{sessionId} 활성
          </div>
        )}
      </header>

      {/* ═══ CONTENT ═══ */}
      {tab === "parse" ? <ParseTab/> : (
        <div className="app-content flex flex-col flex-1 overflow-hidden">

          {/* ── SETUP PANEL ── */}
          <div className="setup-panel shrink-0 bg-white border-b border-gray-200 shadow-sm z-10">
            {showSetup ? (
              <div className="px-8 py-5">
                <div className="setup-grid flex gap-5 items-end w-full">

                  {/* Resume upload */}
                  <div className="space-y-2 w-64 shrink-0">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center">1</span>
                      지원자 이력서
                    </label>
                    <label htmlFor="iq-resume"
                      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all duration-200
                        ${resumeFile
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-dashed border-gray-300 hover:border-indigo-400 hover:bg-gray-50"}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${resumeFile?"bg-indigo-100":"bg-gray-100"}`}>
                        <svg className={`w-5 h-5 ${resumeFile?"text-indigo-500":"text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        {resumeFile
                          ? <p className="text-sm font-semibold text-indigo-700 truncate">{resumeFile.name}</p>
                          : <><p className="text-sm font-medium text-gray-600">파일 선택</p><p className="text-xs text-gray-400">PDF · DOCX · HWP</p></>
                        }
                      </div>
                    </label>
                    <input id="iq-resume" ref={fileRef} type="file" accept=".pdf,.docx,.doc,.hwp,application/*" className="sr-only"
                      onChange={e=>{setResumeFile(e.target.files?.[0]??null);setBundle(null);setIqError(null)}}/>
                  </div>

                  {/* JD */}
                  <div className="space-y-2 flex-1">
                    <label htmlFor="iq-jd" className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center">2</span>
                      채용 직무 / JD
                    </label>
                    <textarea id="iq-jd" value={jobDesc} onChange={e=>setJobDesc(e.target.value)} rows={3}
                      placeholder="직무명, 주요 업무, 자격 요건, 우대 사항 등을 붙여넣으세요."
                      className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3
                        text-sm text-gray-800 placeholder:text-gray-400 leading-relaxed
                        focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100
                        transition-all duration-200"/>
                  </div>

                  {/* CTA */}
                  <div className="shrink-0 flex flex-col gap-2 pb-0">
                    <button type="button" onClick={()=>void generate()} disabled={iqLoading}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 text-white
                        px-6 py-3 text-sm font-bold shadow-md shadow-indigo-200
                        hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-300
                        active:scale-95 disabled:opacity-50 transition-all duration-200 whitespace-nowrap">
                      {iqLoading ? <><Spin cls="w-4 h-4"/>생성 중…</> : <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                        </svg>
                        AI 질문 생성하기
                      </>}
                    </button>
                    {bundle && (
                      <button type="button" onClick={()=>setShowSetup(false)}
                        className="text-xs text-gray-400 hover:text-gray-600 text-center transition-colors">
                        닫기 ↑
                      </button>
                    )}
                  </div>
                </div>

                {iqError && (
                  <div className="mt-3 w-full flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
                    {iqError}
                  </div>
                )}
              </div>
            ) : (
              /* ── Collapsed bar ── */
              <div className="collapsed-setup flex items-center gap-4 px-8 py-2.5 w-full">
                {resumeFile && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25"/></svg>
                    {resumeFile.name}
                  </div>
                )}
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-400 truncate flex-1 max-w-sm">{jobDesc.slice(0,60)}{jobDesc.length>60&&"…"}</span>
                {dislikes.size>0 && <span className="text-xs text-red-400 font-semibold">싫어요 {dislikes.size}개 반영 예정</span>}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={()=>void generate()} disabled={iqLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50
                      text-indigo-600 text-xs font-bold px-3 py-2 hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-50">
                    {iqLoading?<><Spin cls="w-3 h-3"/>생성 중…</>:"↺ 재생성"}
                  </button>
                  <button type="button" onClick={()=>setShowSetup(true)}
                    className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors px-2 py-2">
                    설정 ↓
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── QUESTIONS AREA ── */}
          <div className="questions-area flex-1 overflow-y-auto">

            {/* Empty */}
            {!bundle && !iqLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
                <div className="w-20 h-20 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-500">면접 질문을 생성해보세요</p>
                  <p className="text-sm text-gray-400 mt-1.5">이력서와 직무기술서를 입력하고<br/>AI 질문 생성하기를 클릭하세요.</p>
                </div>
              </div>
            )}

            {/* Loading */}
            {iqLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-6">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-100"/>
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin"/>
                  <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" style={{animationDirection:"reverse",animationDuration:"0.7s"}}/>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-700">면접 질문 생성 중</p>
                  <p className="text-sm text-gray-400 mt-1">RAG 검색 → LLM 생성 → 품질 평가…</p>
                </div>
              </div>
            )}

            {/* Questions */}
            {bundle && !iqLoading && (
              <div className="py-5 px-5">
                <div className="space-y-4">

                  {/* Applicant summary */}
                  {bundle.applicant_summary && (
                    <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">지원자 요약</p>
                        <p className="text-sm text-gray-700 font-medium">{bundle.applicant_summary}</p>
                      </div>
                    </div>
                  )}

                  {/* Question sections */}
                  {SECTIONS.map(({ key, label, target, accent, dot, light }) => {
                    const qs = bundle[key]
                    if (!qs?.length) return null
                    const visible = qs.filter(q=>!dislikes.has(q.q))
                    const hidden  = qs.filter(q=> dislikes.has(q.q))
                    const secIds  = qs.map(q=>q._db_id).filter((id):id is number=>!!id)
                    const secChecked = secIds.filter(id=>selected.has(id)).length
                    const secAllChecked = secIds.length > 0 && secIds.every(id=>selected.has(id))

                    return (
                      <div key={key} className="question-section bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                        {/* Section header */}
                        <div className={`flex items-center gap-3 px-6 py-3.5 ${light} border-b border-gray-100`}>
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`}/>
                          <h3 className={`font-bold text-[15px] ${accent}`}>{label}</h3>
                          <span className="text-xs text-gray-400 font-medium">목표 {target}개 · 생성 {qs.length}개</span>
                          <button type="button"
                            onClick={() => setSelected(prev=>{
                              const n=new Set(prev)
                              if (secAllChecked) secIds.forEach(id=>n.delete(id))
                              else secIds.forEach(id=>n.add(id))
                              return n
                            })}
                            className={`ml-auto text-xs font-semibold transition-colors
                              ${secAllChecked?"text-indigo-600 hover:text-indigo-800":"text-gray-400 hover:text-indigo-500"}`}>
                            {secAllChecked ? "전체 해제" : "전체 선택"}
                          </button>
                          <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 transition-colors
                            ${secChecked>0 ? "bg-indigo-600 text-white" : "bg-white text-gray-400"}`}>
                            {secChecked}/{qs.length}
                          </span>
                        </div>

                        {/* Visible questions */}
                        <div className="divide-y divide-gray-100">
                          {visible.map((item,idx)=>(
                            <QRow key={`${key}-${idx}`}
                              item={item} idx={idx+1}
                              checked={!!(item._db_id&&selected.has(item._db_id))}
                              onCheck={()=>item._db_id&&toggleSelect(item._db_id)}
                              isLiked={likes.has(item.q)} isDisliked={false}
                              onLike={()=>toggleLike(item.q,item._db_id)}
                              onDislike={()=>toggleDislike(item.q,item._db_id)}/>
                          ))}
                        </div>

                        {/* Disliked */}
                        {hidden.length>0 && (
                          <div className="border-t border-dashed border-gray-200">
                            <p className="px-6 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-gray-300">
                              싫어요 표시 ({hidden.length}개) — 재생성 시 자동 제외
                            </p>
                            <div className="divide-y divide-gray-100">
                              {hidden.map((item,idx)=>(
                                <QRow key={`${key}-h-${idx}`}
                                  item={item} idx={visible.length+idx+1}
                                  checked={false} onCheck={()=>{}}
                                  isLiked={false} isDisliked={true}
                                  onLike={()=>toggleLike(item.q,item._db_id)}
                                  onDislike={()=>toggleDislike(item.q,item._db_id)}/>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ══ BOTTOM SAVE BAR ══ */}
          {bundle && (
            <div className="save-bar shrink-0 bg-white border-t border-gray-200 z-10" style={{boxShadow:"0 -4px 16px rgba(0,0,0,0.06)"}}>
              {saveSuccess ? (
                <div className="flex items-center justify-center gap-3 py-4 bg-emerald-50">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                  <span className="font-bold text-emerald-800">저장 완료</span>
                  <span className="text-sm text-emerald-600">선택한 면접 질문지가 DB에 저장되었습니다.</span>
                </div>
              ) : (
                <div className="flex items-center gap-4 px-8 py-3.5">
                  {/* Select shortcuts */}
                  <div className="flex items-center gap-3 text-sm">
                    <button type="button" onClick={()=>setSelected(new Set(allIds()))}
                      className="text-indigo-500 hover:text-indigo-700 font-semibold transition-colors">
                      전체 선택
                    </button>
                    <span className="text-gray-200">|</span>
                    <button type="button" onClick={()=>setSelected(new Set())}
                      className="text-gray-400 hover:text-gray-600 font-semibold transition-colors">
                      전체 해제
                    </button>
                  </div>

                  {/* Count */}
                  <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all
                    ${selected.size>0 ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200" : "bg-gray-100 text-gray-400"}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                    </svg>
                    {selected.size} / {totalQs}개 선택됨
                  </div>

                  {/* Interviewer */}
                  <div className="flex items-center gap-2.5 ml-4">
                    <label className="text-sm font-semibold text-gray-600 whitespace-nowrap">면접관</label>
                    <select value={selectedInterviewer??""} onChange={e=>setSelectedInterviewer(e.target.value?Number(e.target.value):null)}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800
                        focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none
                        hover:border-gray-300 transition-colors cursor-pointer min-w-[140px]">
                      <option value="">선택 안 함</option>
                      {interviewers.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>

                  {/* Save button */}
                  <button type="button" onClick={()=>void saveSelected()}
                    disabled={saveLoading||selected.size===0}
                    title={selected.size===0?"체크박스로 질문을 선택하세요":"선택한 질문을 DB에 저장합니다"}
                    className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600 text-white
                      px-6 py-2.5 text-sm font-bold shadow-sm shadow-emerald-200
                      hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-300
                      active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 whitespace-nowrap">
                    {saveLoading ? <><Spin cls="w-4 h-4"/>저장 중…</> : <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/>
                      </svg>
                      선택한 질문 저장하기
                    </>}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
