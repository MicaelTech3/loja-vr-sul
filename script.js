// Substitua todo o script.js pelo conteúdo abaixo
document.addEventListener("DOMContentLoaded", () => {
  // ======== FIREBASE CONFIG (já está no seu index.html) ========
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCh98WjSryhLJAcX_-COZoIUxIbhP6C8aI",
    authDomain: "loja-vr-sul.firebaseapp.com",
    projectId: "loja-vr-sul",
    storageBucket: "loja-vr-sul.firebasestorage.app",
    messagingSenderId: "485806314481",
    appId: "1:485806314481:web:c9285cb38ba9d623b3aa50"
  };

  // Sem Cloud Functions por enquanto (modo grátis)
  const CLOUD_FUNCTIONS_BASE = "";

  // Inicializa Firebase compat (index.html já carrega os scripts compat)
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK não encontrado. Verifique as tags <script> no HTML.');
  } else {
    try { firebase.initializeApp(FIREBASE_CONFIG); } catch(e) { /* ignora se já inicializado */ }
  }
  const auth = (typeof firebase !== 'undefined') ? firebase.auth() : null;
  const db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

  if (auth) auth.signInAnonymously().catch(err => console.error('Erro signin anon:', err));

  // ======== Utils ========
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const el = sel => document.querySelector(sel);
  const els = sel => [...document.querySelectorAll(sel)];
  const setText = (sel, v) => { const e = el(sel); if(e) e.textContent = v; };
  function toast(msg){ const t = el('#toast'); if(!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2200); }

  // ======== Data ========
  const CATEGORIES = ['Tudo', 'Tênis', 'Calças', 'Blusas', 'Camisas', 'Verão', 'Inverno'];
  const PRODUCTS = [
    {id:'p1', title:'Tênis Casual Branco', price:199.90, cat:'Tênis'},
    {id:'p2', title:'Calça Jeans Slim', price:159.90, cat:'Calças'},
    {id:'p3', title:'Blusa Feminina Cropped', price:89.90, cat:'Blusas'},
    {id:'p4', title:'Camisa Polo Masculina', price:119.90, cat:'Camisas'},
    {id:'p5', title:'Shorts Verão Praia', price:69.90, cat:'Verão'},
    {id:'p6', title:'Jaqueta Inverno Puffer', price:279.90, cat:'Inverno'},
    {id:'p7', title:'Tênis Esportivo Preto', price:229.90, cat:'Tênis'},
    {id:'p8', title:'Calça Moletom Confort', price:139.90, cat:'Calças'},
    {id:'p9', title:'Camisa Social Slim Fit', price:149.90, cat:'Camisas'},
    {id:'p10', title:'Blusa Moletom Oversize', price:169.90, cat:'Inverno'},
  ];
  PRODUCTS.forEach(p=>{
    p.images = [
      `https://picsum.photos/seed/${p.id}-1/1200/1200`,
      `https://picsum.photos/seed/${p.id}-2/1200/1200`,
      `https://picsum.photos/seed/${p.id}-3/1200/1200`,
      `https://picsum.photos/seed/${p.id}-4/1200/1200`
    ];
  });

  // ======== Wishlist (localStorage) ========
  const WISH_KEY = 'loja_virtual_wishlist_v1';
  function getWishlist(){ try{ return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); }catch(e){ return []; } }
  function saveWishlist(arr){ localStorage.setItem(WISH_KEY, JSON.stringify(arr)); }
  function isInWishlist(id){ return getWishlist().includes(id); }
  function toggleWishlist(id){
    const list = getWishlist();
    const idx = list.indexOf(id);
    if(idx === -1){ list.push(id); saveWishlist(list); toast('Adicionado aos desejos ❤️'); }
    else { list.splice(idx,1); saveWishlist(list); toast('Removido dos desejos'); }
    renderWishlistBadges();
  }
  function renderWishlistBadges(){
    document.querySelectorAll('[data-act="fav"]').forEach(h=>{
      const card = h.closest('.card'); if(!card) return; const id = card.dataset.id;
      if(isInWishlist(id)) h.classList.add('wished'); else h.classList.remove('wished');
    });
  }

  // ======== Categories ========
  const catsWrap = el('#cats');
  let activeCat = 'Tudo';
  function renderCats(){
    if(!catsWrap) return;
    const catsToShow = [...CATEGORIES, 'Desejo'];
    catsWrap.innerHTML = catsToShow.map(c=>`<button class="cat ${c===activeCat?'active':''}" data-cat="${c}">${c}</button>`).join('');
  }

  // ======== Product grid ========
  const grid = el('#grid');
  function productCard(p){
    return `<article class="card" data-id="${p.id}">
      <div class="thumb" aria-hidden="false"><img src="${p.images[0]}" alt="${p.title}"></div>
      <div class="card-body">
        <div class="title">${p.title}</div>
        <div class="price"><strong>${BRL.format(p.price)}</strong><small class="chip pix">PIX</small></div>
        <div class="actions">
          <button class="btn" data-act="fav" aria-label="Adicionar aos desejos">❤</button>
          <button class="btn primary" data-act="add">Adicionar</button>
        </div>
      </div>
    </article>`;
  }
  function renderProducts(){
    if(!grid) return;
    const term = (el('#searchInput')?.value || '').trim().toLowerCase();
    if(activeCat === 'Desejo'){
      const wish = getWishlist();
      const list = PRODUCTS.filter(p => wish.includes(p.id) && p.title.toLowerCase().includes(term));
      grid.innerHTML = list.length ? list.map(productCard).join('') : '<div style="opacity:.7; padding:12px">Nenhum item nos desejos.</div>';
    } else {
      const list = PRODUCTS.filter(p => (activeCat==='Tudo' || p.cat===activeCat) && p.title.toLowerCase().includes(term));
      grid.innerHTML = list.map(productCard).join('');
    }
    renderWishlistBadges();
  }

  // ======== Cart ========
  const CART_KEY = 'loja_virtual_cart_v1';
  let cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  function saveCart(){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateBadge(); }
  function cartItems(){ return Object.entries(cart).map(([id,qty]) => ({...PRODUCTS.find(p=>p.id===id), qty})).filter(Boolean); }
  function subtotal(){ return cartItems().reduce((s,it)=> s + (it.price||0)*it.qty, 0); }
  function discounts(){ return 0; }
  function total(){ return Math.max(subtotal() - discounts(), 0); }
  function updateBadge(){ const b = el('#cartBadge'); if(!b) return; b.textContent = cartItems().reduce((s,i)=>s+i.qty,0); }
  function addToCart(id){ cart[id] = (cart[id]||0) + 1; saveCart(); renderCart(); toast('Adicionado ao carrinho'); }
  function removeFromCart(id){ delete cart[id]; saveCart(); renderCart(); }
  function setQty(id, qty){ cart[id] = Math.max(1, Math.min(99, Number(qty) || 1)); saveCart(); renderCart(); }

  const drawer = el('#cartDrawer');
  const lines = el('#cartLines');
  function renderCart(){
    const items = cartItems();
    if(!lines) return;
    lines.innerHTML = items.length ? items.map(it => `
      <div class="line" data-id="${it.id}">
        <div style="width:52px; height:52px; border-radius:10px; overflow:hidden;">
          <img src="${it.images?.[0]||''}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="flex:1">
          <div style="font-weight:600">${it.title}</div>
          <div style="opacity:.75">${BRL.format(it.price)}</div>
        </div>
        <div class="q">
          <div class="qty">
            <span class="icon" data-minus="${it.id}">−</span>
            <span>${it.qty}</span>
            <span class="icon" data-plus="${it.id}">＋</span>
          </div>
          <button class="icon remove" data-rm="${it.id}" aria-label="Remover item">✕</button>
        </div>
      </div>`).join('') : '<div style="opacity:.7; padding:12px">Seu carrinho está vazio.</div>';
    setText('#sumItems', items.reduce((s,i)=>s+i.qty,0));
    setText('#sumSubtotal', BRL.format(subtotal()));
    setText('#sumDiscounts', '-');
    setText('#sumTotal', BRL.format(total()));
    renderResume();
  }
  function openDrawer(){ if(drawer) drawer.classList.add('open'); }
  function closeDrawer(){ if(drawer) drawer.classList.remove('open'); }

  // ======== Checkout UI ========
  const checkout = el('#checkoutModal');
  function openCheckout(){ if(!Object.keys(cart).length){ toast('Adicione produtos antes de finalizar.'); return; } if(checkout) checkout.classList.add('open'); selectMethod('pix'); /* renderização do QR acontece abaixo */ }
  function closeCheckout(){ if(checkout) checkout.classList.remove('open'); }
  function selectMethod(m){ els('.radio').forEach(r=>{ r.classList.toggle('active', r.dataset.method===m); }); if(el('#pixSection')) el('#pixSection').style.display = m==='pix' ? 'grid' : 'none'; }
  function renderResume(){ const items = cartItems(); const resume = el('#resumeList'); if(resume) resume.innerHTML = items.map(i=>`<div style="display:flex; justify-content:space-between;"><span>${i.qty}× ${i.title}</span><strong>${BRL.format(i.price*i.qty)}</strong></div>`).join(''); setText('#resumeSubtotal', BRL.format(subtotal())); setText('#resumeDiscounts', '-'); setText('#resumeTotal', BRL.format(total())); }

  // fallback/simulação PIX
  function makePixPayload(total){ const chave = 'pagamentos@lojavirtual.com.br'; const txid = 'LV' + Date.now().toString(36).toUpperCase(); return `PIX|LojaVirtual|chave:${chave}|txid:${txid}|valor:${total.toFixed(2)}|info:Pedido Loja Virtual (SIMULACAO)`; }
  function generatePixSimulado(){ renderResume(); const payload = makePixPayload(total()); if(el('#pixCopy')) el('#pixCopy').value = payload; if(el('#qrcode')) el('#qrcode').innerHTML = '<div style="color:#000;padding:10px;text-align:center">[QR Code Simulado]</div>'; }

  // ======== Pedidos no Firestore (cliente-only) ========
  // Cria pedido no Firestore e retorna docRef (usando auth.currentUser.uid)
  async function createOrderInFirestore({ items, total, email, descricao }) {
    if(!db || !auth) { throw new Error('Firestore não inicializado'); }
    const user = auth.currentUser;
    if(!user) throw new Error('Usuário não autenticado');

    const data = {
      userId: user.uid,
      items,
      total,
      email,
      descricao,
      status: 'pending',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };
    const ref = await db.collection('pedidos').add(data);
    return ref;
  }

  // Atualiza status do pedido
  async function updateOrderStatus(orderId, status) {
    if(!db) return;
    await db.collection('pedidos').doc(orderId).set({ status, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
  }

  // Fluxo: ao clicar Finalizar compra -> cria pedido no Firestore e mostra QR (simulado)
  let currentOrderUnsub = null;
  async function checkoutFlowCreateOrder() {
  try {
    const items = cartItems();
    if (!items.length) return toast("Carrinho vazio");

    const totalValue = total();
    const email = "cliente@teste.com"; // depois você pode substituir por email real do Firebase

    const payload = {
      orderId: "LV-" + Date.now(),
      items: items.map(i => ({
        id: i.id,
        title: i.title,
        price: i.price,
        qty: i.qty || 1
      })),
      payer: { email },
      back_urls: {
        success: window.location.origin + "?mp_result=success",
        failure: window.location.origin + "?mp_result=failure",
        pending: window.location.origin + "?mp_result=pending",
      },
    };

    // Chama sua API no Vercel
    const resp = await fetch("/api/createPreference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro ao criar preferência");

    // Abre o checkout MercadoPago
    window.open(data.init_point, "_blank");
    toast("Checkout Mercado Pago aberto!");
  } catch (err) {
    console.error(err);
    toast("Erro ao abrir pagamento Mercado Pago");
  }
}


  // Quando usuário clicar "Já paguei" no modal -> atualiza o pedido para paid
  async function onUserClickedPaid() {
    const orderId = el('#checkoutModal')?.dataset?.currentOrder;
    if(!orderId) { // fallback: se não tem order criado, gerar apenas simulação
      toast('Nenhum pedido associado. Criando pedido simulado...');
      await checkoutFlowCreateOrder();
      return;
    }
    try {
      await updateOrderStatus(orderId, 'paid');
      toast('Obrigado! Vamos processar seu pedido.');
    } catch(err) {
      console.error('Erro updateOrderStatus', err);
      toast('Erro ao marcar como pago.');
    }
  }

  // Mostrar botão Meus Produtos e painel (se não existir)
  let ordersUnsub = null;
  function showMyOrdersButton(){
    if(el('#myOrdersBtn')) return;
    el('#cartOpenBtn').insertAdjacentHTML('afterend', `<button id="myOrdersBtn" class="btn">Meus Produtos</button>`);
    el('#myOrdersBtn').addEventListener('click', openOrdersPanel);
  }

  function openOrdersPanel(){
    // cria painel simples se não existir
    if(!el('#ordersPanel')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="ordersPanel" style="position:fixed; inset:80px 12px 12px 12px; background:var(--card); border-radius:12px; z-index:2000; padding:12px; overflow:auto;">
          <button id="closeOrdersPanel" class="close-x" style="float:right">Fechar</button>
          <h3>Meus Pedidos</h3>
          <div id="ordersList"></div>
        </div>
      `);
      el('#closeOrdersPanel').addEventListener('click', ()=> el('#ordersPanel').remove());
    }
    // abre e ouve a coleção
    const user = auth.currentUser;
    if(!user) { toast('Autenticando...'); return; }
    const q = db.collection('pedidos').where('userId','==',user.uid).orderBy('criadoEm','desc');
    if(ordersUnsub) ordersUnsub();
    ordersUnsub = q.onSnapshot(snap=>{
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      const out = list.length ? list.map(p => `
        <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06)">
          <strong>${p.descricao || 'Pedido'}</strong><br>
          Status: <strong>${p.status}</strong><br>
          Valor: ${BRL.format(p.total || 0)}<br>
          Criado: ${p.criadoEm && p.criadoEm.toDate ? p.criadoEm.toDate().toLocaleString() : ''}
        </div>
      `).join('') : '<div style="opacity:.7;padding:12px">Nenhum pedido.</div>';
      el('#ordersList').innerHTML = out;
      el('#ordersPanel').style.display = 'block';
    });
  }

  // ======== Lightbox, search, events (mesma lógica antiga) ========
  function getLbModal(){ return el('#lightboxModal'); }
  function getLbThumbs(){ return el('#lbThumbs'); }
  function getLbIndicator(){ return el('#lbIndicator'); }
  function getLbCounter(){ return el('#lbCounter'); }
  const blurTargets = [...document.querySelectorAll('.container, .topbar')];
  let currentGallery = null;
  function openLightbox(productId){ const p = PRODUCTS.find(x=>x.id===productId); if(!p) return; currentGallery=p; renderLightboxImages(p.images); const modal=getLbModal(); if(!modal) return; modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); blurTargets.forEach(t=>t.classList.add('modal-blur-target','blurred')); getLbThumbs()?.focus(); }
  function closeLightbox(){ const modal=getLbModal(); if(!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); blurTargets.forEach(t=>t.classList.remove('blurred')); currentGallery=null; }
  function renderLightboxImages(images){ const thumbs=getLbThumbs(), indicator=getLbIndicator(); if(!thumbs||!indicator) return; const imgSlides = images.map((src, idx)=>`<div class="lb-slide" data-idx="${idx}"><img src="${src}" alt="Imagem ${idx+1}"></div>`).join(''); thumbs.innerHTML=imgSlides; indicator.innerHTML = images.map((_,i)=>`<div class="lb-dot" data-idx="${i}"></div>`).join('') + `<div id="lbCounter" class="lb-counter"></div>`; enableDragScroll(thumbs); requestAnimationFrame(()=>{ thumbs.scrollLeft=0; updateIndicator(); }); }
  function updateIndicator(){ const thumbs=getLbThumbs(), indicator=getLbIndicator(), counterEl=getLbCounter(); if(!thumbs||!indicator) return; const slides=[...thumbs.querySelectorAll('.lb-slide')]; if(!slides.length) return; const containerRect=thumbs.getBoundingClientRect(); const containerCenter=containerRect.left+containerRect.width/2; let bestIdx=-1, bestDist=Infinity; slides.forEach(s=>{ const r=s.getBoundingClientRect(); const center=r.left+r.width/2; const d=Math.abs(center-containerCenter); if(d<bestDist){ bestDist=d; bestIdx=Number(s.dataset.idx||0); } }); const dots=[...indicator.querySelectorAll('.lb-dot')]; dots.forEach(d=> d.classList.toggle('active', Number(d.dataset.idx)===bestIdx)); if(!counterEl) return; const total=slides.length; const index = bestIdx>=0?bestIdx:0; counterEl.textContent = `${index+1} / ${total}`; }
  function enableDragScroll(container){ if(!container) return; container.onpointerdown=null; container.onpointermove=null; container.onpointerup=null; container.onpointercancel=null; container.onpointerleave=null; container.onscroll=null; let isDown=false,startX=0,scrollLeft=0; container.onpointerdown=(e)=>{ isDown=true; try{container.setPointerCapture(e.pointerId)}catch{}; startX=e.clientX; scrollLeft=container.scrollLeft; container.classList.add('dragging'); }; container.onpointermove=(e)=>{ if(!isDown) return; const x=e.clientX; const walk=(startX-x); container.scrollLeft = scrollLeft + walk; updateIndicator(); }; const up=(e)=>{ if(!isDown) return; isDown=false; try{container.releasePointerCapture(e.pointerId)}catch{}; container.classList.remove('dragging'); snapToClosest(container); }; container.onpointerup=up; container.onpointercancel=up; container.onpointerleave=(e)=>{ if(isDown) up(e); }; container.onscroll = throttle(updateIndicator, 60); }
  function snapToClosest(container){ const slides=[...container.querySelectorAll('.lb-slide')]; if(!slides.length) return; const containerRect=container.getBoundingClientRect(); const containerCenter=containerRect.left+containerRect.width/2; let best=slides[0], bestD=Infinity; slides.forEach(s=>{ const r=s.getBoundingClientRect(); const center=r.left+r.width/2; const d=Math.abs(center-containerCenter); if(d<bestD){ bestD=d; best=s; } }); const targetLeft = best.offsetLeft - (container.clientWidth - best.clientWidth)/2; container.scrollTo({ left: targetLeft, behavior:'smooth' }); }
  function throttle(fn, wait){ let last=0; return (...args)=>{ const now=Date.now(); if(now-last>wait){ last=now; fn(...args); } }; }

  // ======== Eventos globais delegados ========
  document.addEventListener('click', (ev)=>{
    const target = ev.target;
    const addBtn = target.closest('[data-act="add"]');
    const favBtn = target.closest('[data-act="fav"]');
    const cartOpen = target.closest('#cartOpenBtn');
    const cartClose = target.closest('#cartCloseBtn');
    const plus = target.closest('[data-plus]');
    const minus = target.closest('[data-minus]');
    const rm = target.closest('[data-rm]');
    const checkoutBtn = target.closest('#checkoutBtn');
    const closeCheckoutBtn = target.closest('#closeCheckout');
    const copyBtn = target.closest('#copyBtn');
    const paidBtn = target.closest('#paidBtn');
    const cancelPixBtn = target.closest('#cancelPix');

    if(favBtn){ const cardEl = favBtn.closest('.card'); if(!cardEl) return; toggleWishlist(cardEl.dataset.id); return; }
    if(addBtn) { addToCart(addBtn.closest('.card').dataset.id); return; }
    if(cartOpen) { openDrawer(); return; }
    if(cartClose) { closeDrawer(); return; }
    if(plus) { setQty(plus.dataset.plus, (cart[plus.dataset.plus]||1)+1); return; }
    if(minus) { setQty(minus.dataset.minus, (cart[minus.dataset.minus]||1)-1); return; }
    if(rm) { removeFromCart(rm.dataset.rm); return; }
    if(checkoutBtn) { closeDrawer(); checkoutFlowCreateOrder(); openCheckout(); return; }
    if(closeCheckoutBtn) { closeCheckout(); return; }
    if(copyBtn) { if(navigator.clipboard) navigator.clipboard.writeText(el('#pixCopy')?.value || ''); toast('Chave PIX copiada!'); return; }
    if(paidBtn) { onUserClickedPaid(); return; } // agora atualiza o pedido real
    if(cancelPixBtn) { closeCheckout(); return; }

    const thumb = target.closest('.thumb');
    if(thumb){ const card = thumb.closest('.card'); if(card) openLightbox(card.dataset.id); return; }

    const title = target.closest('.title');
    if(title){ const card = title.closest('.card'); if(card) openLightbox(card.dataset.id); return; }

    const card = target.closest('.card');
    if(card){ if(ev.target.closest('button, [data-act], .btn, .icon, input, svg')) return; openLightbox(card.dataset.id); return; }

    const radio = target.closest('.radio');
    if(radio){ selectMethod(radio.dataset.method); return; }
  });

  // dots click delegated
  document.addEventListener('click', (ev)=>{
    const d = ev.target.closest('.lb-dot'); if(!d) return; const idx = Number(d.dataset.idx); const thumbs = getLbThumbs(); if(!thumbs) return; const slide = thumbs.querySelector(`.lb-slide[data-idx="${idx}"]`); if(!slide) return; const targetLeft = slide.offsetLeft - (thumbs.clientWidth - slide.clientWidth)/2; thumbs.scrollTo({ left: targetLeft, behavior:'smooth' });
  });

  // keyboard nav for lightbox
  document.addEventListener('keydown', (e)=>{
    const modal = getLbModal(); if(!modal || !modal.classList.contains('open')) return; const thumbs = getLbThumbs(); const indicator = getLbIndicator();
    if(e.key === 'Escape') { closeLightbox(); return; }
    if(e.key === 'ArrowRight'){ const cur = Number(indicator.querySelector('.lb-dot.active')?.dataset.idx || 0); const slides = thumbs.querySelectorAll('.lb-slide'); const next = Math.min(slides.length-1, cur+1); const slide = thumbs.querySelector(`.lb-slide[data-idx="${next}"]`); if(slide) thumbs.scrollTo({ left: slide.offsetLeft - (thumbs.clientWidth - slide.clientWidth)/2, behavior:'smooth' }); }
    if(e.key === 'ArrowLeft'){ const cur = Number(indicator.querySelector('.lb-dot.active')?.dataset.idx || 0); const prev = Math.max(0, cur-1); const slide = thumbs.querySelector(`.lb-slide[data-idx="${prev}"]`); if(slide) thumbs.scrollTo({ left: slide.offsetLeft - (thumbs.clientWidth - slide.clientWidth)/2, behavior:'smooth' }); }
  });

  // search expand mobile (mesma lógica)
  (function setupExpandableSearch(){
    const searchWrap = document.querySelector('.search');
    const searchInput = document.querySelector('#searchInput');
    const brand = document.querySelector('.brand');
    const topbarWrap = document.querySelector('.topbar-wrap');
    if(!searchWrap || !searchInput || !brand || !topbarWrap) return;
    function applyPosition(){
      if(window.innerWidth > 600){ searchWrap.style.left=''; searchWrap.style.top=''; searchWrap.style.right=''; return; }
      const brandRect = brand.getBoundingClientRect();
      const containerRect = topbarWrap.getBoundingClientRect();
      const gap = 10;
      const leftPos = brandRect.right - containerRect.left + gap;
      const topPos = brandRect.top - containerRect.top + (brandRect.height - searchWrap.offsetHeight)/2;
      searchWrap.style.left = `${leftPos}px`; searchWrap.style.top = `${topPos}px`; searchWrap.style.right='12px';
    }
    function expand(){ searchWrap.classList.add('expanded'); document.body.classList.add('search-open'); applyPosition(); if(window.innerWidth<=600) window.scrollTo({top:0,behavior:'smooth'}); }
    function collapse(){ searchWrap.classList.remove('expanded'); document.body.classList.remove('search-open'); searchWrap.style.left=''; searchWrap.style.top=''; searchWrap.style.right=''; }
    searchInput.addEventListener('focus', expand);
    searchInput.addEventListener('input', ()=>{ if(window.innerWidth<=600) searchWrap.classList.add('expanded'); });
    document.addEventListener('click', (e)=>{ if(window.innerWidth>600) return; const inside = e.target.closest('.search'); if(!inside) collapse(); });
    window.addEventListener('resize', ()=>{ if(window.innerWidth>600) collapse(); else if(searchWrap.classList.contains('expanded')) applyPosition(); });
    window.addEventListener('load', ()=>{ if(searchWrap.classList.contains('expanded')) applyPosition(); });
    try{ const mo = new MutationObserver(()=>{ if(searchWrap.classList.contains('expanded')) applyPosition(); }); mo.observe(topbarWrap, { childList:true, subtree:true, attributes:true }); }catch(e){}
  })();

  // attach search filter and category clicks
  el('#searchInput')?.addEventListener('input', renderProducts);
  catsWrap?.addEventListener('click', (e)=>{ const b=e.target.closest('.cat'); if(!b)return; activeCat=b.dataset.cat; renderCats(); renderProducts(); });

  // cart open/close
  el('#cartOpenBtn')?.addEventListener('click', openDrawer);
  el('#cartCloseBtn')?.addEventListener('click', closeDrawer);

  // checkout open/close
  el('#checkoutBtn')?.addEventListener('click', ()=>{ closeDrawer(); openCheckout(); });
  el('#closeCheckout')?.addEventListener('click', closeCheckout);

  // init
  renderCats(); renderProducts(); renderCart(); updateBadge(); renderWishlistBadges();

  // debug auth state
  if(auth){ auth.onAuthStateChanged(u => { if(u) console.log('User auth uid:', u.uid); else console.log('User signed out'); }); }
});
