(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('preview'), ctx = canvas.getContext('2d', {alpha:false}), video=$('videoSource');
const state = {file:null, url:null, duration:0, clips:[], ratio:'9:16',fit:'blur', zoom:100,focus:50,title:'',fontSize:48,color:'#ffffff', position:'top', bottomText:'',bottomFontSize:34,bottomColor:'#ffffff', busy:false, rendering:false, exportUrl:null, recorder:null,audioCtx:null,audioSource:null,audioOut:null,audioGain:null, recorderMime:'',exportAbort:false};
const f = n => Number.isFinite(n)?Math.max(0,n):0;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmt=s=>{s=Math.max(0,Math.floor(f(s)));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const status=(message,error=false)=>{const el=$('exportStatus');el.textContent=message;el.className='status'+(error?' error':'')};
const ratioSize=()=>state.ratio==='9:16'?[540,960]:state.ratio==='1:1'?[720,720]:[960,540];
// Keep the visible preview at the true output aspect ratio, independent of the panel dimensions.
function syncPreviewSize(){
 const shell=$('previewShell');
 const cw=canvas.width, ch=canvas.height;
 const availableW=Math.max(1,shell.clientWidth-2);
 const availableH=Math.max(1,shell.clientHeight-2);
 const scale=Math.min(availableW/cw,availableH/ch);
 canvas.style.width=(cw*scale).toFixed(2)+'px';
 canvas.style.height=(ch*scale).toFixed(2)+'px';
}
function canvasSize(){const [w,h]=ratioSize();canvas.width=w;canvas.height=h;$('canvasSize').textContent=w+' × '+h;syncPreviewSize();draw()}
const previewResizeObserver = typeof ResizeObserver!=='undefined' ? new ResizeObserver(syncPreviewSize) : null;
if(previewResizeObserver) previewResizeObserver.observe($('previewShell'));
else window.addEventListener('resize',syncPreviewSize);
function draw(){
 const w=canvas.width,h=canvas.height;ctx.save();ctx.fillStyle='#0b1315';ctx.fillRect(0,0,w,h);
 if(video.readyState>=2 && video.videoWidth>0){
  const vw=video.videoWidth,vh=video.videoHeight,focus=(state.focus-50)/50;
  const img=(mode,doZoom,blur=false)=>{
   const s=(mode==='fill'?Math.max(w/vw,h/vh):Math.min(w/vw,h/vh))*(doZoom?state.zoom/100:1);
   const dw=vw*s,dh=vh*s;
   const x=clamp((w-dw)/2-focus*Math.max(0,dw-w)/2,Math.min(0,w-dw),Math.max(0,w-dw));
   const y=(h-dh)/2;
   ctx.save(); if(blur){ctx.filter='blur(35px) brightness(0.45)';}
   ctx.drawImage(video,x,y,dw,dh);ctx.restore();
  };
  try {if(state.fit==='blur')img('fill',false,true);img(state.fit==='fill'?'fill':'fit',true,false)}catch(_){/* non-ready frame */}
 }
 if(state.title.trim()){
   const raw=state.title.trim().replace(/\s+/g,' ');
   const scale=canvas.width/540, size=state.fontSize*scale;
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${size}px system-ui, sans-serif`;
   const max=w*.84,words=raw.split(' '),lines=[];let line='';
   for(const word of words){const trial=line?line+' '+word:word;if(ctx.measureText(trial).width>max&&line){lines.push(line);line=word}else line=trial;} if(line)lines.push(line);
   const sliced=lines.slice(0,4), lineH=size*1.22,total=lineH*sliced.length;
   let y=state.position==='top'?Math.max(58*scale,total*.55+20*scale):state.position==='bottom'?h-Math.max(72*scale,total*.55+25*scale):h/2;
   ctx.shadowColor='rgba(0,0,0,.92)';ctx.shadowBlur=size*.31;ctx.lineWidth=size*.13;ctx.strokeStyle='rgba(4,13,16,.85)';ctx.fillStyle=state.color;
   if(state.position==='bottom' && state.bottomText.trim()) y-=Math.max(90*scale,(state.bottomFontSize*scale)*2.7);
   sliced.forEach((txt,i)=>{let ty=y+(i-(sliced.length-1)/2)*lineH;ctx.strokeText(txt,w/2,ty,max);ctx.fillText(txt,w/2,ty,max)});
 }
 if(state.bottomText.trim()){
   const scale=w/540,size=state.bottomFontSize*scale,max=w*.84,raw=state.bottomText.trim().replace(/\s+/g,' ');
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`750 ${size}px system-ui, sans-serif`;
   const words=raw.split(' '),lines=[];let line='';
   for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>max&&line){lines.push(line);line=word}else line=next;}if(line)lines.push(line);
   const visible=lines.slice(0,3),lineH=size*1.25;
   const centerY=h-Math.max(36*scale,visible.length*lineH/2+24*scale);
   ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=size*.3;ctx.lineWidth=size*.14;ctx.strokeStyle='rgba(4,13,16,.88)';ctx.fillStyle=state.bottomColor;
   visible.forEach((part,i)=>{const ty=centerY+(i-(visible.length-1)/2)*lineH;ctx.strokeText(part,w/2,ty,max);ctx.fillText(part,w/2,ty,max)});
 }
 ctx.restore();
}
let rafId=0;function animate(){draw();if(state.file&&!state.rendering){$('currentTime').textContent=fmt(video.currentTime);if(document.activeElement!==$('seek'))$('seek').value=String(video.currentTime||0);$('playPause').textContent=video.paused?'▶':'❚❚';}rafId=requestAnimationFrame(animate)}animate();
function updateRangeFields(){ $('clipStart').max=String(state.duration);$('clipEnd').max=String(state.duration);}
function clearExport(){if(state.exportUrl){URL.revokeObjectURL(state.exportUrl);state.exportUrl=null}$('downloadLink').classList.add('hidden');status('');$('progressTrack').classList.add('hidden');$('progressBar').style.width='0%'}
function totalLength(){return state.clips.reduce((a,c)=>a+c.end-c.start,0)}
function updateExportState(){const total=totalLength();$('clipCount').textContent=state.clips.length+' clip'+(state.clips.length===1?'':'s')+' · '+fmt(total);$('exportSummary').textContent=state.file?(state.clips.length?`${state.clips.length} clip(s), ${fmt(total)} total. Rendered locally in real time.`:'Choose at least one clip to export.'):'Add a video and choose at least one clip.';$('exportBtn').disabled=!state.file||!state.clips.length||state.busy;}
function renderClips(){const el=$('clipList');el.replaceChildren();if(!state.clips.length){let msg=document.createElement('p');msg.className='fine-print';msg.textContent='Add a clip above to build your sequence. You can combine multiple moments from the same video.';el.append(msg)}
 state.clips.forEach((clip,index)=>{let item=document.createElement('div');item.className='clip-item';const left=document.createElement('div');const bold=document.createElement('strong');bold.textContent=`Clip ${index+1} · ${fmt(clip.end-clip.start)}`;bold.style.fontSize='13px';const sm=document.createElement('small');sm.textContent=` ${fmt(clip.start)} → ${fmt(clip.end)}`;left.append(bold,sm);const ctrl=document.createElement('div');ctrl.className='clip-controls';[['↑','Move up',()=>move(index,-1)],['↓','Move down',()=>move(index,1)],['×','Remove',()=>remove(index)]].forEach(([txt,lbl,fn])=>{const b=document.createElement('button');b.type='button';b.className='mini-btn';b.textContent=txt;b.setAttribute('aria-label',lbl+' clip '+(index+1));b.addEventListener('click',fn);ctrl.append(b)});const jump=document.createElement('button');jump.type='button';jump.className='mini-btn';jump.textContent='View';jump.addEventListener('click',()=>{video.pause();video.currentTime=clip.start;$('clipStart').value=clip.start.toFixed(1);$('clipEnd').value=clip.end.toFixed(1)});ctrl.prepend(jump);item.append(left,ctrl);el.append(item)});updateExportState();}
function move(i,dir){const j=i+dir;if(j<0||j>=state.clips.length||state.busy)return;[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];clearExport();renderClips();}
function remove(i){if(state.busy)return;state.clips.splice(i,1);clearExport();renderClips();}
async function loadFile(file){if(state.busy)return;if(!file||(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name||''))){status('Choose a video file (MP4, MOV, WebM, etc.).',true);return}video.pause();if(state.url)URL.revokeObjectURL(state.url);state.url=URL.createObjectURL(file);state.file=file;state.clips=[];$('aiResults').replaceChildren();$('aiStatus').textContent='';clearExport();video.src=state.url;video.load();$('fileDetails').textContent='Loading '+file.name+'…';$('previewShell').classList.remove('ready');$('emptyWork').classList.remove('hidden');$('sourceRow').classList.add('hidden');updateExportState();}
video.addEventListener('loadedmetadata',()=>{if(!state.file||!Number.isFinite(video.duration)||video.duration<=0){status('Could not determine video duration. The source may not be browser-compatible.',true);return}state.duration=video.duration;$('emptyWork').classList.add('hidden');$('previewShell').classList.add('ready');$('sourceRow').classList.remove('hidden');$('seek').max=String(state.duration);$('duration').textContent=fmt(state.duration);$('clipStart').value='0';$('clipEnd').value=Math.min(15,state.duration).toFixed(1);updateRangeFields();$('fileDetails').textContent=`${state.file.name} · ${(state.file.size/1024/1024).toFixed(1)} MB · ${video.videoWidth}×${video.videoHeight} · ${fmt(state.duration)}`;video.currentTime=0;renderClips();});
video.addEventListener('error',()=>{status('The browser could not decode this video. Try MP4/H.264 or WebM.',true)});
$('chooseFile').onclick=()=> $('fileInput').click();$('chooseAnother').onclick=()=> $('fileInput').click();$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value=''});
$('demoBtn').onclick=async()=>{try{const res=await fetch('assets/demo/clipforge-demo.mp4');if(!res.ok)throw Error('Sample missing');let blob=await res.blob();await loadFile(new File([blob],'ClipForge_Sample.mp4',{type:'video/mp4'}));}catch(e){status('The sample video could not be loaded. Please use your own file.',true)}};
let dragCount=0;const root=$('studioRoot');root.addEventListener('dragenter',e=>{e.preventDefault();dragCount++;root.classList.add('dragover')});root.addEventListener('dragover',e=>e.preventDefault());root.addEventListener('dragleave',e=>{e.preventDefault();dragCount=Math.max(0,dragCount-1);if(!dragCount)root.classList.remove('dragover')});root.addEventListener('drop',e=>{e.preventDefault();dragCount=0;root.classList.remove('dragover');if(e.dataTransfer.files.length)loadFile(e.dataTransfer.files[0])});
$('playPause').addEventListener('click',async()=>{if(!state.file||state.busy)return;if(video.paused){try{if(state.audioGain)state.audioGain.gain.value=1;await video.play()}catch(e){status('Unable to play this video.',true)}}else video.pause()});
$('seek').addEventListener('input',e=>{if(state.file&&!state.busy){video.currentTime=Number(e.target.value);$('currentTime').textContent=fmt(video.currentTime)}});
$('setIn').onclick=()=>{$('clipStart').value=Math.min(video.currentTime,Number($('clipEnd').value)-.1).toFixed(1)};
$('setOut').onclick=()=>{$('clipEnd').value=Math.max(video.currentTime,Number($('clipStart').value)+.1).toFixed(1)};
$('addClip').onclick=()=>{const a=Number($('clipStart').value),b=Number($('clipEnd').value);if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>state.duration+.02||b-a<.2){status('Invalid IN/OUT points. Clip must be at least 0.2 seconds and within the video.',true);return}if(totalLength()+b-a>120){status('Free browser beta is limited to 120 seconds total per export.',true);return}state.clips.push({start:a,end:b});clearExport();renderClips();status('Clip added. You can add more moments from the same video.')};
function setupGroup(id,key,attr){document.querySelectorAll('#'+id+' button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('#'+id+' button').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');state[key]=button.dataset[attr];if(key==='ratio')canvasSize();draw();clearExport();}));}
setupGroup('ratioControl','ratio','ratio');setupGroup('fitControl','fit','fit');
[['zoom','zoom',v=>v+'%','zoomValue'],['focus','focus',v=>v===50?'Center':v<50?'Left '+(50-v):'Right '+(v-50),'focusValue'],['fontSize','fontSize',v=>v+' px','fontSizeValue']].forEach(([id,key,display,out])=>{$(id).addEventListener('input',e=>{state[key]=Number(e.target.value);$(out).textContent=display(state[key]);draw();clearExport()})});
[['titleText','title'],['titlePosition','position'],['titleColor','color']].forEach(([id,key])=>{$(id).addEventListener('input',e=>{state[key]=e.target.value;draw();clearExport()})});
[['bottomText','bottomText'],['bottomColor','bottomColor']].forEach(([id,key])=>{$(id).addEventListener('input',e=>{state[key]=e.target.value;draw();clearExport()})});
$('bottomFontSize').addEventListener('input',e=>{state.bottomFontSize=Number(e.target.value);$('bottomFontSizeValue').textContent=state.bottomFontSize+' px';draw();clearExport()});
$('includeAudio').addEventListener('change',clearExport);
function pickMime(){const types=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.42E01E"','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];return types.find(t=>MediaRecorder.isTypeSupported(t))||'';}
async function ensureAudio(){if(state.audioCtx)return state.audioOut;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;state.audioCtx=new AC();state.audioSource=state.audioCtx.createMediaElementSource(video);state.audioOut=state.audioCtx.createMediaStreamDestination();state.audioGain=state.audioCtx.createGain();state.audioSource.connect(state.audioGain);state.audioGain.connect(state.audioCtx.destination);state.audioSource.connect(state.audioOut);return state.audioOut;}
async function seekVideo(time){return new Promise((resolve,reject)=>{if(Math.abs(video.currentTime-time)<.045&&video.readyState>=2){resolve();return}let resolved=false;const stop=()=>{if(resolved)return;resolved=true;video.removeEventListener('seeked',onseek);clearTimeout(timer)};const onseek=()=>{stop();resolve()};video.addEventListener('seeked',onseek,{once:true});const timer=setTimeout(()=>{stop();if(video.readyState>=2)resolve();else reject(Error('Unable to seek to '+time))},5000);try{video.currentTime=time}catch(e){stop();reject(e)}})}
const pauseVideo=()=>new Promise(res=>{video.pause();res()});
// Experimental analysis: only compressed still frames leave the browser; no raw video/audio upload.
const aiStatus=(txt,bad=false)=>{const el=$('aiStatus');el.textContent=txt;el.style.color=bad?'#ff9393':''};
function miniSceneCard(clip,index){
 const item=document.createElement('div');item.className='ai-result-card';
 const div=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small'),reason=document.createElement('p');
 title.textContent=`Suggestion ${index+1}: ${clip.label||'Possible moment'}`;
 meta.textContent=`${fmt(clip.start)} – ${fmt(clip.end)} · approximate`;
 reason.textContent=clip.reason||'Review this moment before using it.';
 div.append(title,meta,reason);
 const btn=document.createElement('button');btn.type='button';btn.className='btn btn-outline btn-small';btn.textContent='+ Add clip';
 btn.addEventListener('click',()=>{if(state.busy)return;if(totalLength()+clip.end-clip.start>120){aiStatus('Export sequence max 120 seconds.',true);return;}state.clips.push({start:clip.start,end:clip.end});renderClips();clearExport();aiStatus('Suggestion added; review IN/OUT and export.');});
 item.append(div,btn);return item;
}
async function collectAiFrames(start,end){
 const span=end-start,n=clamp(Math.ceil(span/6),4,12),shots=[];
 const c=document.createElement('canvas');c.width=384;c.height=216;
 const g=c.getContext('2d',{alpha:false});
 for(let i=0;i<n;i++){
   const t=clamp(start+((i+.5)/n)*span,0,Math.max(.01,state.duration-.05));
   await seekVideo(t);await new Promise(r=>requestAnimationFrame(r));
   const vw=video.videoWidth||1,vh=video.videoHeight||1;
   const scale=Math.min(c.width/vw,c.height/vh),dw=vw*scale,dh=vh*scale;
   g.fillStyle='#161616';g.fillRect(0,0,c.width,c.height);
   g.drawImage(video,(c.width-dw)/2,(c.height-dh)/2,dw,dh);
   const image=c.toDataURL('image/jpeg',.56);
   shots.push({time:Number(t.toFixed(2)),image});
 }
 return shots;
}
$('aiAnalyzeBtn').addEventListener('click',async()=>{
 if(!state.file||state.busy){aiStatus('Load a video first.',true);return;}
 if(!$('aiConsent').checked){aiStatus('Check consent to send sample frames.',true);return;}
 const code=$('aiAccessCode').value.trim();if(!code){aiStatus('Enter the private beta access code.',true);return;}
 const start=Number($('clipStart').value),end=Number($('clipEnd').value);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>state.duration+.02||end-start<5||end-start>90){aiStatus('Choose a 5–90 second range with Clip start / Clip end.',true);return;}
 const wasPlaying=!video.paused,at=video.currentTime,file=state.file;
 state.busy=true;video.pause();$('aiAnalyzeBtn').disabled=true;const btn=$('aiAnalyzeBtn');btn.textContent='Analyzing…';$('aiResults').replaceChildren();
 try{
   aiStatus('Extracting sample frames locally…');const frames=await collectAiFrames(start,end);
   if(state.file!==file)throw Error('Video changed. Please retry.');
   aiStatus(`Sending ${frames.length} still frames to DeepSeek…`);
   const response=await fetch('/api/deepseek-highlights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode:code,frames,start,end,context:$('aiContext').value.slice(0,250)})});
   const data=await response.json().catch(()=>({error:'Unable to read server response'}));
   if(!response.ok)throw Error(data.error||`AI request failed (${response.status})`);
   const suggestions=(data.clips||[]).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end-c.start>=.2);
   if(!suggestions.length){aiStatus('No reliable candidate found. Try a smaller or different range.');return;}
   suggestions.forEach((c,i)=>$('aiResults').append(miniSceneCard(c,i)));
   aiStatus(`${suggestions.length} rough suggestions — inspect and adjust before publishing.`);
 }catch(err){aiStatus('AI beta: '+(err?.message||String(err)),true)}
 finally{try{await seekVideo(Math.min(at,state.duration-.05));if(wasPlaying)await video.play()}catch(_){}state.busy=false;btn.disabled=false;btn.textContent='Analyze chosen range ↗';updateExportState()}
});

async function playSegments(){for(let i=0;i<state.clips.length;i++){
  const seg=state.clips[i];await pauseVideo();await seekVideo(seg.start);draw();await video.play();
  await new Promise((resolve,reject)=>{let finished=false;const finish=(err)=>{if(finished)return;finished=true;video.removeEventListener('ended',onend);clearInterval(interval);if(err)reject(err);else resolve()};const onend=()=>finish();video.addEventListener('ended',onend,{once:true});const interval=setInterval(()=>{if(state.exportAbort){finish(Error('Export canceled'));return}if(video.currentTime>=seg.end-.035){finish();return}if(video.error){finish(Error('Video decoder failed'));}},30);});
  video.pause();draw();
}}
function setBusy(flag){state.busy=flag;$('exportBtn').disabled=flag||!state.clips.length;$('chooseAnother').disabled=flag;$('addClip').disabled=flag;$('playPause').disabled=flag;for(const el of document.querySelectorAll('#ratioControl button,#fitControl button,#zoom,#focus,#fontSize,#titleText,#titlePosition,#titleColor,#bottomText,#bottomColor,#bottomFontSize,#includeAudio,#aiAnalyzeBtn,#aiContext,#aiAccessCode,#aiConsent,#setIn,#setOut,#clipStart,#clipEnd,#seek,.clip-controls button')){el.disabled=flag;}}
$('exportBtn').addEventListener('click',async()=>{
 if(!state.file||!state.clips.length||state.busy)return;
 const total=totalLength();if(total<=0||total>120){status('Select between 0.2 and 120 seconds of video.',true);return}
 if(!canvas.captureStream||!window.MediaRecorder){status('Your browser does not support canvas recording. Try an updated desktop browser.',true);return}
 const mime=pickMime();if(!mime){status('No supported recording format. Try desktop Chrome, Edge or Firefox.',true);return}
 clearExport();setBusy(true);state.rendering=true;state.exportAbort=false;
 $('progressTrack').classList.remove('hidden');status('Preparing your clip… Keep this tab open.');video.pause();let rec=null,ticker=null,stream=null,stopped=false;
 try{
  if($('includeAudio').checked){try{await ensureAudio();if(state.audioCtx)await state.audioCtx.resume()}catch(err){console.warn('Audio capture unavailable, exporting silent video',err)}}if(state.audioGain)state.audioGain.gain.value=0;
  const imageStream=canvas.captureStream(30);let tracks=[...imageStream.getVideoTracks()];if($('includeAudio').checked&&state.audioOut)tracks.push(...state.audioOut.stream.getAudioTracks());stream=new MediaStream(tracks);
  let options={mimeType:mime,videoBitsPerSecond:5500000,audioBitsPerSecond:128000};rec=new MediaRecorder(stream,options);state.recorder=rec;state.recorderMime=mime;
  const chunks=[];const done=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};rec.onerror=e=>reject(e.error||Error('Recording error'));rec.onstop=()=>resolve()});
  const startWall=performance.now();rec.start(700);status('Rendering locally. Keep this tab visible.');
  ticker=setInterval(()=>{$('progressBar').style.width=(Math.min(95,(performance.now()-startWall)/(total*1000)*95)).toFixed(1)+'%'},200);
  await playSegments();if(rec.state!=='inactive')rec.stop();await done;stopped=true;
  if(!chunks.length)throw Error('The browser produced an empty recording.');
  const mp4=mime.startsWith('video/mp4');const blob=new Blob(chunks,{type:mp4?'video/mp4':'video/webm'});
  if(blob.size<2000)throw Error('The exported recording was too small to be valid.');
  state.exportUrl=URL.createObjectURL(blob);const link=$('downloadLink');link.href=state.exportUrl;link.download='ClipForge_Short_'+new Date().toISOString().slice(0,10)+(mp4?'.mp4':'.webm');link.textContent='Download '+(mp4?'MP4':'WebM')+' · '+(blob.size/1048576).toFixed(1)+' MB ↓';link.classList.remove('hidden');$('progressBar').style.width='100%';status('Export finished! Check your finished video before publishing.');$('exportStatus').className='status ok';
 }catch(err){status('Export failed: '+(err?.message||String(err))+'. Try fewer/shorter clips or another browser.',true);if(rec&&rec.state!=='inactive'){try{rec.stop()}catch(_){}}}
 finally{if(ticker)clearInterval(ticker);if(stream)stream.getTracks().forEach(t=>t.stop());if(state.audioGain)state.audioGain.gain.value=1;state.rendering=false;state.recorder=null;setBusy(false);video.pause();}
});
window.addEventListener('beforeunload',()=>{if(previewResizeObserver)previewResizeObserver.disconnect();if(state.url)URL.revokeObjectURL(state.url);if(state.exportUrl)URL.revokeObjectURL(state.exportUrl);cancelAnimationFrame(rafId)});
canvasSize();updateExportState();
})();
