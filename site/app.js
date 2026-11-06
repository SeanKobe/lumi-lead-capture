// Set WORKER_URL to the deployed Cloudflare Worker URL. While it is empty the forms only show the success state (design preview).
var WORKER_URL="https://lumi-lead-capture.seankobe.workers.dev", THANK_YOU_URL="thank-you.html";
(function(){
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};

// mobile menu
var mb=$(".menu"),dr=$(".drawer");
if(mb)mb.addEventListener("click",function(){var on=dr.classList.toggle("on");mb.setAttribute("aria-expanded",on)});

// booking modal
var ov=$("#ov");
if(ov){
  var p1=$("#p1"),p2=$("#p2"),ok=$("#ok");
  var pane=function(el){[p1,p2,ok].forEach(function(p){p.classList.remove("on")});el.classList.add("on")};
  var openM=function(t){
    pane(p1);$$('#lead input[name="answer"]').forEach(function(r){r.checked=false});
    if(t){var r=$$('#lead input[name="answer"]').filter(function(x){return x.value===t})[0];if(r){r.checked=true;pane(p2)}}
    ov.classList.add("on");
  };
  var closeM=function(){ov.classList.remove("on")};
  $$(".open").forEach(function(b){b.addEventListener("click",function(){openM(b.dataset.treatment)})});
  $("#close").onclick=closeM;
  ov.addEventListener("click",function(e){if(e.target===ov)closeM()});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")closeM()});
  $$('#lead input[name="answer"]').forEach(function(r){r.addEventListener("change",function(){setTimeout(function(){pane(p2);$("#name").focus()},180)})});
  $("#back").onclick=function(){pane(p1)};
}

// lead forms (modal + contact page share one handler)
function submitLead(form,onOk){
  var err=$(".err",form),go=$(".go",form),d=new FormData(form);
  err.textContent="";
  var name=String(d.get("name")||"").trim(),email=String(d.get("email")||"").trim(),phone=String(d.get("phone")||"").trim();
  if(!name){err.textContent="Please enter your name.";$('[name="name"]',form).focus();return}
  if(!email&&!phone){err.textContent="Add an email or a phone number so we can reach you.";$('[name="email"]',form).focus();return}
  var label=go.textContent;go.disabled=true;go.textContent="Sending...";
  var send=WORKER_URL?fetch(WORKER_URL,{method:"POST",body:d}).then(function(r){if(!r.ok)throw 0}):Promise.resolve();
  send.then(function(){
    onOk();
    if(THANK_YOU_URL)setTimeout(function(){location.href=THANK_YOU_URL},1400);
  }).catch(function(){err.textContent="Something went wrong. Please try again.";go.disabled=false;go.textContent=label});
}
$$(".leadform").forEach(function(f){f.addEventListener("submit",function(e){
  e.preventDefault();
  submitLead(f,function(){
    if(f.id==="lead"){$$(".pane").forEach(function(p){p.classList.remove("on")});$("#ok").classList.add("on")}
    else{f.hidden=true;$("#"+f.dataset.done).hidden=false}
  });
})});

// hero hotspots
var ph=$("#photo");
if(ph){
  var img=$("img",ph);
  var setZoom=function(s){var z=$(".zoom",s),w=img.offsetWidth,h=img.offsetHeight,k=2.6,bw=z.offsetWidth;
    z.style.backgroundImage='url("'+img.currentSrc+'")';z.style.backgroundSize=(w*k)+"px "+(h*k)+"px";
    z.style.backgroundPosition=(-(parseFloat(s.dataset.x)/100*w*k-bw/2))+"px "+(-(parseFloat(s.dataset.y)/100*h*k-bw/2))+"px"};
  $$(".spot").forEach(function(s){
    s.addEventListener("mouseenter",function(){setZoom(s)});
    s.addEventListener("focus",function(){setZoom(s)});
    s.addEventListener("click",function(e){var was=s.classList.contains("open");
      $$(".spot").forEach(function(x){x.classList.remove("open")});
      if(!was){setZoom(s);s.classList.add("open")}e.stopPropagation()});
  });
  document.addEventListener("click",function(){$$(".spot").forEach(function(x){x.classList.remove("open")})});
}

// count-up stats
if("IntersectionObserver" in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches){
  var io=new IntersectionObserver(function(es){es.forEach(function(en){
    if(!en.isIntersecting)return;io.unobserve(en.target);
    var el=en.target,n=+el.dataset.n,s=el.dataset.s,t0=performance.now();
    (function tick(t){var p=Math.min((t-t0)/1200,1);el.textContent=Math.round(n*(1-Math.pow(1-p,3)))+(p===1?s:"");if(p<1)requestAnimationFrame(tick)})(t0);
  })},{threshold:.6});
  $$("[data-n]").forEach(function(el){io.observe(el)});
}

// before/after sliders
$$(".ba").forEach(function(b){var r=$("input",b);var f=function(){b.style.setProperty("--p",r.value+"%")};r.addEventListener("input",f);f()});
})();
