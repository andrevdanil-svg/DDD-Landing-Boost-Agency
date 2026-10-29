var e=[{level:70,z:1.0364},{level:80,z:1.2816},{level:90,z:1.6449},{level:95,z:1.96},{level:99,z:2.5758}],t=(e,t,n)=>{let r=e/t,i=1+n*n/t,a=(r+n*n/(2*t))/i,o=n*Math.sqrt(r*(1-r)/t+n*n/(4*t*t))/i;return{lo:Math.max(0,a-o),hi:Math.min(1,a+o),p:r}},n=(e,t=2)=>(e*100).toFixed(t)+`%`,r=(e,t=3)=>e.toFixed(t),i=e=>{let t=e<0?-1:1,n=Math.abs(e),r=1/(1+.3275911*n);return t*(1-((((1.061405429*r+-1.453152027)*r+1.421413741)*r+-.284496736)*r+.254829592)*r*Math.exp(-n*n))},a=e=>1-i(Math.abs(e)/Math.SQRT2),o=document.querySelector(`[data-form]`),s=document.querySelector(`[data-result-title]`),c=document.querySelector(`[data-result-body]`),l=`one`;document.querySelectorAll(`[data-mode]`).forEach(e=>{e.addEventListener(`click`,()=>{l=e.dataset.mode,document.querySelectorAll(`[data-mode]`).forEach(t=>t.setAttribute(`aria-selected`,String(t===e))),document.querySelectorAll(`[data-pane]`).forEach(e=>{e.dataset.pane===l?e.setAttribute(`data-active`,``):e.removeAttribute(`data-active`)}),y()})});var u=o.querySelector(`[name=clicks]`),d=o.querySelector(`[name=conversions]`),f=o.querySelector(`[name=cr]`),p=`conv`;u.addEventListener(`input`,()=>y()),d.addEventListener(`input`,()=>{p=`conv`,y()}),f.addEventListener(`input`,()=>{p=`cr`,y()}),o.querySelectorAll(`[name^="a"], [name^="b"]`).forEach(e=>e.addEventListener(`input`,y));var m=()=>{let e=Number(u.value);if(!Number.isFinite(e)||e<1)return null;if(p===`cr`){let t=Number(f.value);return!Number.isFinite(t)||t<0||t>100?null:{n:e,x:Math.round(t/100*e),p:t/100}}let t=Number(d.value);return!Number.isFinite(t)||t<0||t>e?null:{n:e,x:t,p:t/e}},h=e=>{p===`conv`&&document.activeElement!==f?f.value=(e.p*100).toFixed(2):p===`cr`&&document.activeElement!==d&&(d.value=String(e.x))},g=r=>{let i=e.map(({level:e,z:n})=>{let{lo:i,hi:a}=t(r.x,r.n,n);return{level:e,lo:i,hi:a,half:(a-i)/2}}),a=i.find(e=>e.level===95);s.innerHTML=`Конверсия <em>${n(r.p)}</em> — доверительный интервал 95%: <em>${n(a.lo)} … ${n(a.hi)}</em>`,c.innerHTML=`
      <div class="panel">
        <div class="kpis">
          <div class="kpi"><span>Выборка</span><b>${r.n.toLocaleString(`ru`)}</b></div>
          <div class="kpi"><span>Положительных</span><b>${r.x.toLocaleString(`ru`)}</b></div>
          <div class="kpi"><span>Конверсия</span><b>${n(r.p)}</b></div>
        </div>
        ${_(r.p,a.lo,a.hi)}
        <div class="levels">
          <div class="levels__row"><span class="lbl">Уровень</span><span class="lbl">Нижняя</span><span class="lbl">Верхняя</span><span class="lbl">±</span></div>
          ${i.map(e=>`
            <div class="levels__row">
              <b>${e.level}%</b>
              <span>${n(e.lo)}</span>
              <span>${n(e.hi)}</span>
              <span>${n(e.half)}</span>
            </div>`).join(``)}
        </div>
      </div>
    `},_=(e,t,r)=>{let i=Math.max(r-t,e*.5,.02),a=Math.max(0,t-i*.3),o=Math.min(1,r+i*.3),s=o-a||1,c=(t-a)/s*100,l=(r-a)/s*100,u=(e-a)/s*100;return`
      <div class="bar" aria-label="Диапазон 95% доверительного интервала">
        <div class="bar__fill" style="left:${c}%;right:${100-l}%"></div>
        <div class="bar__center" style="left:${u}%"></div>
      </div>
      <div class="bar__scale"><span>${n(a)}</span><span>${n((a+o)/2)}</span><span>${n(o)}</span></div>
    `},v=()=>{let e={n:Number(o.querySelector(`[name=aClicks]`).value),x:Number(o.querySelector(`[name=aConv]`).value)},i={n:Number(o.querySelector(`[name=bClicks]`).value),x:Number(o.querySelector(`[name=bConv]`).value)};if(!Number.isFinite(e.n)||e.n<1||!Number.isFinite(e.x)||e.x<0||e.x>e.n||!Number.isFinite(i.n)||i.n<1||!Number.isFinite(i.x)||i.x<0||i.x>i.n){s.textContent=`Заполните клики и конверсии для обоих вариантов`,c.innerHTML=``;return}let l=e.x/e.n,u=i.x/i.n,d=(e.x+i.x)/(e.n+i.n),f=Math.sqrt(d*(1-d)*(1/e.n+1/i.n)),p=f===0?0:(u-l)/f,m=a(p),h=u-l,g=l===0?1/0:h/l,_=t(e.x,e.n,1.96),v=t(i.x,i.n,1.96),y=m<.05&&Math.abs(p)>=1.96;s.innerHTML=y?`Разница <em>${h>=0?`+`:``}${(h*100).toFixed(2)} п.п.</em> — значима на уровне 95%`:`Разница <em>${h>=0?`+`:``}${(h*100).toFixed(2)} п.п.</em> — пока не значима`,c.innerHTML=`
      <div class="panel">
        <div class="kpis">
          <div class="kpi"><span>Конверсия A</span><b>${n(l)}</b></div>
          <div class="kpi"><span>Конверсия B</span><b>${n(u)}</b></div>
          <div class="kpi"><span>Разница (отн.)</span><b>${g===1/0?`∞`:(g*100).toFixed(1)+`%`}</b></div>
        </div>
        <div class="kpis" style="margin-top: 20px;">
          <div class="kpi"><span>z-статистика</span><b>${r(p,3)}</b></div>
          <div class="kpi"><span>p-value</span><b>${m<1e-4?`<0.0001`:m.toFixed(4)}</b></div>
          <div class="kpi"><span>95% CI A — B</span><b>${n(_.lo)}..${n(_.hi)} / ${n(v.lo)}..${n(v.hi)}</b></div>
        </div>
        <div class="verdict ${y?`ok`:`nope`}">
          ${y?`<b>p = ${m<1e-4?`<0.0001`:m.toFixed(4)}</b> — разница статистически значима на уровне 0.05. Если бы варианты были одинаковы, такой разрыв между ними случайно получался бы реже чем в ${(m*100).toFixed(2)}% повторов.`:`<b>p = ${m.toFixed(4)}</b> — пока недостаточно данных. Нужна либо большая выборка, либо реальный эффект больше. Доверительные интервалы A и B пересекаются.`}
        </div>
      </div>
    `};function y(){if(l===`one`){let e=m();if(!e){s.textContent=`Введите клики и конверсии (или только % конверсии)`,c.innerHTML=``;return}h(e),g(e)}else v()}y();