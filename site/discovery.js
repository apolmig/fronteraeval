(() => {
  const root=document.documentElement;
  const button=document.querySelector('[data-static-theme]');
  function current(){return root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
  function render(){if(!button)return;button.querySelector('[data-theme-label]').textContent=current()==='dark'?'Light':'Dark';button.setAttribute('aria-label',`Switch to ${current()==='dark'?'light':'dark'} theme`)}
  button?.addEventListener('click',()=>{const next=current()==='dark'?'light':'dark';root.setAttribute('data-theme',next);try{localStorage.setItem('fronteraeval-theme',next);localStorage.setItem('theme',next)}catch{}render()});render();
  document.querySelectorAll('[data-share-url]').forEach((share)=>share.addEventListener('click',async()=>{const url=share.dataset.shareUrl,title=share.dataset.shareTitle||document.title;try{if(navigator.share){await navigator.share({title,url})}else{await navigator.clipboard.writeText(url);share.textContent='Link copied';setTimeout(()=>share.textContent='Share this record',1600)}}catch{}}));
})();
