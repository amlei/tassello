import { evaluateScalar, withPage } from "@tassello/cdp";
const url=process.argv[2]!;
await withPage("wechat-verify",{url,keepOpen:false,activate:true,mode:"visible"},async(cdp,sid)=>{
 for(let i=0;i<30;i++){
  const ready=await evaluateScalar<boolean>(cdp,sid,`!!document.querySelector('textarea#title') && !!document.querySelector('.ProseMirror')`,{timeoutMs:8000}).catch(()=>false);
  if(ready) break;
  await new Promise(r=>setTimeout(r,1500));
 }
 const d=await evaluateScalar(cdp,sid,`JSON.parse(JSON.stringify({
  title:document.querySelector('textarea#title')?.value||null,
  digest:document.querySelector('textarea#js_description')?.value||null,
  bodyChars:Array.from(document.querySelectorAll('.ProseMirror')).map(e=>e.textContent.replace(/\\s+/g,'').length),
  imgs:Array.from(document.querySelectorAll('.ProseMirror img')).map(i=>i.src.slice(0,90)),
  coverAreaHtml:(document.querySelector('#js_cover_area')?.outerHTML||'').slice(0,3000),
  dialogs:Array.from(document.querySelectorAll('.weui-desktop-dialog__wrp')).filter(d=>d.offsetHeight>0).map(d=>d.innerText.replace(/\\s+/g,' ').slice(0,500)),
  bodyText:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,1200)
 }))`,{timeoutMs:15000});
 console.log(JSON.stringify(d,null,2));
});
