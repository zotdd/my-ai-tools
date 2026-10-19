(function(){
  const menu=document.querySelector('[data-menu-toggle]');
  const nav=document.querySelector('[data-nav]');
  if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});}
  document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
})();
