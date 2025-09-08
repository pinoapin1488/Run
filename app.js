(function(){
  // КЛЮЧИ «БД»
  const DB_KEYS = {
    CURRENT: 'race.current',
    HISTORY: 'race.history'
  };

  // UI
  const addBtn   = document.getElementById('addBtn');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const finishRaceBtn = document.getElementById('finishRaceBtn');
  const nameInput= document.getElementById('runnerName');
  const statusEl = document.getElementById('status');
  const tbody    = document.getElementById('tbody');
  const historyList = document.getElementById('historyList');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const clearAllBtn  = document.getElementById('clearAllBtn');
  const shareLinkBtn = document.getElementById('shareLinkBtn');
  const viewerBanner = document.getElementById('viewerBanner');
  const raceClockEl  = document.getElementById('raceClock');

  // Стан
  let raceStarted = false;
  let raceStartMs = null;
  /** @type {{id:string, name:string, timeMs:number|null, finished:boolean}[]} */
  let runners = [];
  let READ_ONLY_VIEW = false;

  // Таймер
  let clockTimer = null;

  // Утиліти
  const uid = () => Math.random().toString(36).slice(2,9);
  const nowIso = () => new Date().toISOString();

  function formatTime(ms){
    if(ms == null) return '—';
    const totalMs = Math.floor(ms);
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const millis  = totalMs % 1000;
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
  }
  function setStatus(t){ statusEl.textContent = t; }

  // === «БД»: localStorage ===
  function loadCurrent(){
    try{
      const raw = localStorage.getItem(DB_KEYS.CURRENT);
      if(!raw) return;
      const obj = JSON.parse(raw);
      raceStarted = !!obj.raceStarted;
      raceStartMs = obj.raceStartMs ?? null;
      runners = Array.isArray(obj.runners) ? obj.runners : [];
    }catch(e){ console.warn('loadCurrent error', e); }
  }
  function saveCurrent(){
    if(READ_ONLY_VIEW) return;
    const obj = { raceStarted, raceStartMs, runners };
    localStorage.setItem(DB_KEYS.CURRENT, JSON.stringify(obj));
  }
  function loadHistory(){
    try{
      const raw = localStorage.getItem(DB_KEYS.HISTORY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.warn('loadHistory error', e);
      return [];
    }
  }
  function saveHistory(arr){
    if(READ_ONLY_VIEW) return;
    localStorage.setItem(DB_KEYS.HISTORY, JSON.stringify(arr));
  }

  // === ТАЙМЕР ДИСПЛЕЙ ===
  function startClock(){
    stopClock();
    updateClock(); // одразу оновимо
    clockTimer = setInterval(updateClock, 31); // ~30 FPS
  }
  function stopClock(){
    if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
  }
  function resetClock(){
    stopClock();
    raceClockEl.textContent = '00:00.000';
  }
  function updateClock(){
    if(!raceStarted || !raceStartMs){ raceClockEl.textContent = '00:00.000'; return; }
    const elapsed = Date.now() - raceStartMs;
    raceClockEl.textContent = formatTime(elapsed);
  }

  // === Рендер рейтинга ===
  function render(){
    const finished = runners.filter(r=>r.finished).sort((a,b)=>a.timeMs - b.timeMs);
    const unfinished = runners.filter(r=>!r.finished);
    const ordered = [...finished, ...unfinished];

    tbody.innerHTML = '';
    ordered.forEach((r,i)=>{
      const tr = document.createElement('tr');

      const rankTd = document.createElement('td');
      rankTd.textContent = r.finished ? (i+1) : '–';
      tr.appendChild(rankTd);

      const nameTd = document.createElement('td');
      nameTd.textContent = r.name;
      tr.appendChild(nameTd);

      const timeTd = document.createElement('td');
      timeTd.textContent = formatTime(r.timeMs);
      tr.appendChild(timeTd);

      const actionTd = document.createElement('td');
      if(!r.finished){
        if(READ_ONLY_VIEW){
          const span = document.createElement('span');
          span.className = 'muted';
          span.textContent = '—';
          actionTd.appendChild(span);
        } else {
          const btn = document.createElement('button');
          btn.textContent = 'Фініш';
          btn.onclick = ()=>{
            if(!raceStarted){
              const warn = document.createElement('span');
              warn.className = 'alert';
              warn.textContent = 'Спочатку натисни «Старт гонки».';
              actionTd.innerHTML = '';
              actionTd.appendChild(warn);
              setTimeout(()=>render(), 1500);
              return;
            }
            r.timeMs = Date.now() - raceStartMs;
            r.finished = true;
            saveCurrent();
            render();
          };
          actionTd.appendChild(btn);
        }
      } else {
        const span = document.createElement('span');
        span.className = 'muted';
        span.textContent = 'Завершено';
        actionTd.appendChild(span);
      }
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });

    startBtn.disabled = READ_ONLY_VIEW || raceStarted;
    resetBtn.disabled = READ_ONLY_VIEW || (!raceStarted && runners.length === 0);
    finishRaceBtn.disabled = READ_ONLY_VIEW || !runners.some(r => r.finished);
    addBtn.disabled = READ_ONLY_VIEW;
    nameInput.disabled = READ_ONLY_VIEW;
    clearAllBtn.disabled = READ_ONLY_VIEW;

    // керування таймером
    if(raceStarted) startClock(); else stopClock();
  }

  // === Рендер історії (БЕЗ дат): "Забіг #N" + місця/імена/часи ===
  function renderHistory(){
    const hist = READ_ONLY_VIEW ? __viewerPayload.history || [] : loadHistory();
    historyList.innerHTML = '';
    if(hist.length === 0){
      const empty = document.createElement('div');
      empty.className = 'empty-muted';
      empty.textContent = 'Поки що порожньо.';
      historyList.appendChild(empty);
      return;
    }

    // показуємо в хронології: Забіг #1, #2, ...
    hist.forEach((race, idx)=>{
      const item = document.createElement('div');
      item.className = 'history-item';

      const title = document.createElement('div');
      title.className = 'history-title';
      // Номер забігу — порядковий (без дат)
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `Забіг #${idx+1}`;
      title.appendChild(badge);

      item.appendChild(title);

      const list = document.createElement('div');
      list.className = 'place-line';

      const sorted = (race.results || []).slice().sort((a,b)=>a.timeMs - b.timeMs);
      if(sorted.length === 0){
        const row = document.createElement('div');
        row.className = 'empty-muted';
        row.textContent = 'Немає фінішерів';
        list.appendChild(row);
      } else {
        sorted.forEach((r, i)=>{
          const row = document.createElement('div');
          row.className = 'place-row';

          const place = document.createElement('div');
          place.className = 'place';
          place.textContent = `${i+1})`;

          const name = document.createElement('div');
          name.className = 'name';
          name.textContent = r.name;

          const time = document.createElement('div');
          time.className = 'time';
          time.textContent = formatTime(r.timeMs);

          row.appendChild(place);
          row.appendChild(name);
          row.appendChild(time);
          list.appendChild(row);
        });
      }

      item.appendChild(list);
      historyList.appendChild(item);
    });
  }

  // === Експорт CSV (без змін)
  function exportCSV(){
    const finished = runners.filter(r=>r.finished).sort((a,b)=>a.timeMs - b.timeMs);
    const unfinished = runners.filter(r=>!r.finished);
    const ordered = [...finished, ...unfinished];

    const rows = [['rank','name','time_ms','time_readable','finished']];
    ordered.forEach((r,i)=>{
      const rank = r.finished ? (i+1) : '';
      rows.push([rank, r.name, r.timeMs ?? '', formatTime(r.timeMs), r.finished ? 'yes':'no']);
    });
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'race_results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // === Публічна ссилка (без змін)
  function toShareLink(){
    const payload = {
      updatedAt: nowIso(),
      current: { raceStarted, raceStartMs, runners },
      history: loadHistory()
    };
    const json = JSON.stringify(payload);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    const link = `${location.origin}${location.pathname}#d=${base64}`;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(()=>{
        alert('Публічну ссилку скопійовано. Відкрий щоб переглянути результати.');
      }, ()=>{
        prompt('Скопіюй посилання вручну:', link);
      });
    } else {
      prompt('Скопіюй посилання вручну:', link);
    }
  }

  // === Читання payload з hash
  let __viewerPayload = {};
  function tryLoadFromHash(){
    const h = location.hash || '';
    const m = h.match(/^#d=([\s\S]+)$/);
    if(!m) return false;
    try{
      const json = decodeURIComponent(escape(atob(m[1])));
      __viewerPayload = JSON.parse(json);

      READ_ONLY_VIEW = true;
      viewerBanner.style.display = 'block';

      const cur = __viewerPayload.current || {};
      raceStarted = !!cur.raceStarted;
      raceStartMs = cur.raceStartMs ?? null;
      runners = Array.isArray(cur.runners) ? cur.runners : [];

      return true;
    }catch(e){
      console.warn('Bad share link payload', e);
      return false;
    }
  }

  // === Обробники
  addBtn.onclick = ()=>{
    const name = nameInput.value.trim();
    if(!name){ nameInput.focus(); return; }
    runners.push({ id:uid(), name, timeMs:null, finished:false });
    nameInput.value = '';
    saveCurrent();
    render();
  };
  nameInput.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ addBtn.click(); }
  });

  startBtn.onclick = ()=>{
    if(runners.length === 0){
      const n = prompt('Немає бігунів. Введи ім’я першого бігуна:');
      if(n && n.trim()){
        runners.push({ id:uid(), name:n.trim(), timeMs:null, finished:false });
      } else {
        return;
      }
    }
    raceStartMs = Date.now();
    raceStarted = true;
    setStatus('Гонка триває… Фіксуй фініш для кожного');
    saveCurrent();
    startClock();
    render();
  };

  resetBtn.onclick = ()=>{
    if(!confirm('Скинути поточну гонку й очистити результати (без збереження в історію)?')) return;
    raceStarted = false;
    raceStartMs = null;
    runners.forEach(r=>{ r.timeMs=null; r.finished=false; });
    setStatus('Очікуємо старт…');
    saveCurrent();
    resetClock();
    render();
  };

  finishRaceBtn.onclick = ()=>{
    const anyFinished = runners.some(r=>r.finished);
    if(!anyFinished){ alert('Ніхто не фінішував — нічого додавати до історії.'); return; }

    const results = runners
      .filter(r => r.finished)
      .map(r => ({ name:r.name, timeMs:r.timeMs }));

    const history = loadHistory();
    history.push({
      id: uid(),
      // поля дат лишаємо в сховищі, але не показуємо в UI
      startedAt: raceStartMs ? new Date(raceStartMs).toISOString() : nowIso(),
      finishedAt: nowIso(),
      results
    });
    saveHistory(history);

    raceStarted = false;
    raceStartMs = null;
    runners.forEach(r=>{ r.timeMs=null; r.finished=false; });
    setStatus('Очікуємо старт…');
    saveCurrent();
    resetClock();
    render();
    renderHistory();
    alert('Забіг додано до історії.');
  };

  exportCsvBtn.onclick = exportCSV;
  shareLinkBtn.onclick = toShareLink;

  clearAllBtn.onclick = ()=>{
    if(!confirm('Очистити ВЕСЬ запис (поточна гонка + історія)?')) return;
    localStorage.removeItem(DB_KEYS.CURRENT);
    localStorage.removeItem(DB_KEYS.HISTORY);
    raceStarted = false;
    raceStartMs = null;
    runners = [];
    setStatus('Очікуємо старт…');
    resetClock();
    render();
    renderHistory();
  };

  // === Ініціалізація
  const openedAsViewer = tryLoadFromHash();
  if(!openedAsViewer){
    loadCurrent();
  }
  render();
  renderHistory();
  setStatus(raceStarted ? 'Гонка триває…' : 'Очікуємо старт…');
  if(raceStarted) startClock(); else resetClock();
})();