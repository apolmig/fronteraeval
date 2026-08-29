(() => {
  const BASE='https://fronteraeval.org';
  const CARD=`${BASE}/social-card.png`;
  let catalog=null;
  (globalThis.FronteraEvalCatalogPromise ||= fetch('/data/catalog.json').then((r)=>r.ok?r.json():null).catch(()=>null)).then((data)=>{catalog=data;update()});
  const ensure=(selector,tag,attrs={})=>{let node=document.head.querySelector(selector);if(!node){node=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));document.head.append(node)}return node};
  const setMeta=(selector,kind,value)=>{if(!value)return;const key=selector.match(/"([^"]+)/)?.[1]||'';const node=ensure(selector,'meta',{[kind]:key});node.setAttribute('content',value)};
  const slug=(record)=>String(record?.slug||record?.id||'evaluation').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
  function update(){
    const raw=(location.hash||'#/').slice(1),path=raw.split('?')[0];let title='FronteraEval — Frontier AI evaluations, mapped';let description='Find frontier AI evaluations, follow their original sources, and understand what each result can and cannot establish.';let canonical=`${BASE}/`;
    if(path==='/evals'){title='Frontier AI evaluations — FronteraEval';canonical=`${BASE}/evaluations/`}
    else if(path.startsWith('/eval/')&&catalog){const id=decodeURIComponent(path.slice(6));const record=catalog.records?.find((item)=>item.id===id);if(record){title=`${record.name} — FronteraEval`;description=record.measures||record.description||description;canonical=`${BASE}/evaluations/${slug(record)}/`;setTimeout(()=>replaceCopy(record,canonical),0)}}
    else if(path==='/topics'){title='Frontier AI evaluation topics — FronteraEval';canonical=`${BASE}/topics/`}
    else if(path.startsWith('/topic/')&&catalog){const id=path.slice(7);const topic=catalog.topics?.[id];if(topic){title=`${topic.label} evaluations — FronteraEval`;description=topic.definition||description;canonical=`${BASE}/topics/${id}/`}}
    else if(path==='/about'){title='About FronteraEval';canonical=`${BASE}/about/`}
    else if(path==='/methodology'){title='Method and evidence boundaries — FronteraEval';canonical=`${BASE}/method/`}
    else if(path==='/data'){title='Open data — FronteraEval';canonical=`${BASE}/data-info/`}
    document.title=title;
    ensure('link[rel="canonical"]','link',{rel:'canonical'}).setAttribute('href',canonical);
    setMeta('meta[name="description"]','name',description);setMeta('meta[property="og:title"]','property',title);setMeta('meta[property="og:description"]','property',description);setMeta('meta[property="og:url"]','property',canonical);setMeta('meta[property="og:image"]','property',CARD);setMeta('meta[name="twitter:title"]','name',title);setMeta('meta[name="twitter:description"]','name',description);setMeta('meta[name="twitter:image"]','name',CARD);
  }
  function replaceCopy(record,canonical){const old=document.querySelector('#copy-record-link');if(!old||old.dataset.seoBound)return;const clone=old.cloneNode(true);clone.dataset.seoBound='true';clone.textContent='Copy share link';old.replaceWith(clone);clone.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(canonical);clone.textContent='Copied';setTimeout(()=>clone.textContent='Copy share link',1500)}catch{}});if(!document.querySelector('[data-native-share]')){const share=document.createElement('button');share.type='button';share.className='copy-link';share.dataset.nativeShare='true';share.textContent='Share';share.addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:record.name,url:canonical});else await navigator.clipboard.writeText(canonical)}catch{}});clone.after(share)}}
  addEventListener('hashchange',update);document.addEventListener('fronteraeval:rendered',update);update();
})();
