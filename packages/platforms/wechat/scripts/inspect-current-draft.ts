import { CdpConnection, evaluateScalar } from "@tassello/cdp";
const ws=(await (await fetch("http://127.0.0.1:55976/json/version")).json() as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
const cdp=await CdpConnection.connect(ws,10000);
const ts=(await cdp.send("Target.getTargets") as any).targetInfos.filter((t:any)=>t.type==="page"&&t.url.includes("appmsgid=100002639"));
if(!ts.length) throw new Error("no draft tab");
const {sessionId}=await cdp.send("Target.attachToTarget",{targetId:ts[0].targetId,flatten:true}) as any;
const d=await evaluateScalar(cdp,sessionId,`JSON.parse(JSON.stringify({
 title:document.querySelector('textarea#title')?.value||null,
 digest:document.querySelector('textarea#js_description')?.value||null,
 bodyChars:Array.from(document.querySelectorAll('.ProseMirror')).map(e=>e.textContent.replace(/\\s+/g,'').length),
 imgs:Array.from(document.querySelectorAll('.ProseMirror img')).map(i=>i.src.slice(0,80)),
 coverHTML:(document.querySelector('#js_cover_area')?.outerHTML||'').slice(0,1200),
 coverText:(document.querySelector('#js_cover_area')?.innerText||'').replace(/\\s+/g,' ').slice(0,300),
 dialog:Array.from(document.querySelectorAll('.weui-desktop-dialog__wrp')).filter(d=>d.offsetHeight>0).map(d=>d.innerText.replace(/\\s+/g,' ').slice(0,500)),
 bodyText:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,800)
}))`,{timeoutMs:15000});
console.log(JSON.stringify(d,null,2));
process.exit(0);
