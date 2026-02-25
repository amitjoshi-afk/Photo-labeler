// ─── Polyfill roundRect for older browsers ─────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Array.isArray(r) ? r : [r, r, r, r];
    this.beginPath();
    this.moveTo(x + r[0], y);
    this.lineTo(x + w - r[1], y);
    this.arcTo(x + w, y, x + w, y + r[1], r[1]);
    this.lineTo(x + w, y + h - r[2]);
    this.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
    this.lineTo(x + r[3], y + h);
    this.arcTo(x, y + h, x, y + h - r[3], r[3]);
    this.lineTo(x, y + r[0]);
    this.arcTo(x, y, x + r[0], y, r[0]);
    this.closePath();
  };
}

// ─── State ─────────────────────────────────────────────────────────────────
let image        = null;   // HTMLImageElement
let annotations  = [];     // [{ id, x, y, w, h, label }]
let selectedId   = null;
let mode         = 'draw'; // 'draw' | 'select'
let isDrawing    = false;
let startX       = 0;
let startY       = 0;
let pending      = null;   // annotation being drawn (not yet confirmed)
let idCounter    = 0;

// ─── DOM refs ──────────────────────────────────────────────────────────────
const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d');
const dropZone    = document.getElementById('drop-zone');
const dropHint    = document.getElementById('drop-hint');
const fileInput   = document.getElementById('file-input');
const exportBtn   = document.getElementById('export-btn');
const toolbar     = document.getElementById('toolbar');
const toolDraw    = document.getElementById('tool-draw');

const toolSelect  = document.getElementById('tool-select');
const deleteBtn   = document.getElementById('delete-btn');
const description = document.getElementById('description');
const annList     = document.getElementById('annotation-list');
const countBadge  = document.getElementById('count');
const labelInput  = document.getElementById('label-input');

// ─── Bootstrap ─────────────────────────────────────────────────────────────
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) loadFile(f);
  // Reset so the same file can be re-selected
  fileInput.value = '';
});
exportBtn.addEventListener('click', exportJSON);
toolDraw.addEventListener('click', () => setMode('draw'));
toolSelect.addEventListener('click', () => setMode('select'));
deleteBtn.addEventListener('click', deleteSelected);

// Prevent the browser from opening dragged files in a new tab anywhere on the page
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadFile(f);
});

// Drop-zone visual feedback
dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});
dropZone.addEventListener('drop', () => dropZone.classList.remove('drag-over'));

// Canvas mouse events
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseleave', onMouseLeave);

// Label input events
labelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmLabel(); }
  if (e.key === 'Escape') cancelLabel();
});
// Use mousedown instead of blur so Escape has time to fire first
labelInput.addEventListener('blur', () => {
  // Small delay so Escape handler can cancel before blur triggers confirm
  setTimeout(() => {
    if (labelInput._pending) confirmLabel();
  }, 80);
});

// ─── Load image ────────────────────────────────────────────────────────────
function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    image = img;
    annotations = [];
    selectedId = null;
    pending = null;
    idCounter = 0;

    // Fit image into the available drop-zone space
    const maxW = dropZone.clientWidth  - 48;
    const maxH = dropZone.clientHeight - 48;
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    canvas.width  = Math.round(img.width  * scale);
    canvas.height = Math.round(img.height * scale);

    dropHint.style.display = 'none';
    canvas.style.display   = 'block';
    toolbar.style.display  = 'flex';
    exportBtn.disabled     = false;

    render();
    updateSidebar();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    alert('Could not load image. Please try a different file.');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ─── Canvas coordinate helper ──────────────────────────────────────────────
function canvasXY(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ─── Mouse handlers ────────────────────────────────────────────────────────
function onMouseDown(e) {
  if (!image) return;
  const { x, y } = canvasXY(e);

  if (mode === 'draw') {
    isDrawing = true;
    startX = x;
    startY = y;
    pending = { id: ++idCounter, x, y, w: 0, h: 0, label: '' };
  } else {
    // Select mode: hit-test from top-most annotation down
    let hit = null;
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        hit = a;
        break;
      }
    }
    selectedId = hit ? hit.id : null;
    deleteBtn.disabled = !selectedId;
    render();
    updateSidebar();
  }
}

function onMouseMove(e) {
  if (!isDrawing || !pending) return;
  const { x, y } = canvasXY(e);
  pending.w = x - startX;
  pending.h = y - startY;
  render();
}

function onMouseUp(e) {
  if (!isDrawing || !pending) return;
  isDrawing = false;
  const { x, y } = canvasXY(e);
  pending.w = x - startX;
  pending.h = y - startY;

  // Discard tiny accidental clicks
  if (Math.abs(pending.w) < 6 || Math.abs(pending.h) < 6) {
    pending = null;
    render();
    return;
  }

  // Normalise so w/h are always positive
  if (pending.w < 0) { pending.x += pending.w; pending.w = -pending.w; }
  if (pending.h < 0) { pending.y += pending.h; pending.h = -pending.h; }

  showLabelInput(pending);
}

function onMouseLeave() {
  if (isDrawing) {
    isDrawing = false;
    pending = null;
    render();
  }
}

// ─── Label input ───────────────────────────────────────────────────────────
function showLabelInput(ann) {
  const r = canvas.getBoundingClientRect();

  // Position below the drawn box, clamped to viewport
  let lx = r.left + ann.x;
  let ly = r.top  + ann.y + ann.h + 8;

  lx = Math.max(8, Math.min(lx, window.innerWidth  - 196));
  ly = Math.max(8, Math.min(ly, window.innerHeight - 44));

  labelInput.style.left    = lx + 'px';
  labelInput.style.top     = ly + 'px';
  labelInput.style.display = 'block';
  labelInput.value         = '';
  labelInput._pending      = ann;
  labelInput.focus();
}

function confirmLabel() {
  const ann = labelInput._pending;
  if (!ann) return;
  labelInput._pending      = null;
  labelInput.style.display = 'none';

  ann.label = labelInput.value.trim() || `Box ${ann.id}`;
  annotations.push(ann);
  selectedId = ann.id;
  pending    = null;
  deleteBtn.disabled = false;
  render();
  updateSidebar();
}

function cancelLabel() {
  if (!labelInput._pending) return;
  labelInput._pending      = null;
  labelInput.style.display = 'none';
  pending = null;
  render();
}

// ─── Mode switching ────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  canvas.style.cursor = m === 'draw' ? 'crosshair' : 'default';
  toolDraw.classList.toggle('active',   m === 'draw');
  toolSelect.classList.toggle('active', m === 'select');
  if (m === 'draw') {
    selectedId = null;
    deleteBtn.disabled = true;
    render();
    updateSidebar();
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────
function deleteSelected() {
  if (!selectedId) return;
  annotations   = annotations.filter(a => a.id !== selectedId);
  selectedId    = null;
  deleteBtn.disabled = true;
  render();
  updateSidebar();
}

// ─── Render ────────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image) return;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  annotations.forEach(a => drawBox(a, a.id === selectedId, false));
  if (pending) drawBox(pending, false, true);
}

function drawBox(ann, selected, isPending) {
  const { x, y, w, h, label } = ann;
  const color = isPending ? '#94a3b8' : selected ? '#f59e0b' : '#3b82f6';

  // Fill
  ctx.fillStyle = isPending
    ? 'rgba(148,163,184,0.08)'
    : selected
      ? 'rgba(245,158,11,0.12)'
      : 'rgba(59,130,246,0.1)';
  ctx.fillRect(x, y, w, h);

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth   = isPending ? 1.5 : 2;
  ctx.setLineDash(isPending ? [6, 4] : []);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Corner handles when selected
  if (selected) {
    const corners = [[x, y], [x+w, y], [x, y+h], [x+w, y+h]];
    ctx.fillStyle = color;
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Label tag
  if (label && !isPending) {
    const fontSize = 12;
    const pad      = 5;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const tw  = ctx.measureText(label).width;
    const tagW = tw + pad * 2;
    const tagH = fontSize + pad * 2;
    const tagY = y - tagH;

    // Tag background (round top corners)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, tagY, tagW, tagH, [3, 3, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + pad, y - pad);
  }
}

// ─── Sidebar ───────────────────────────────────────────────────────────────
function updateSidebar() {
  countBadge.textContent = annotations.length;

  if (annotations.length === 0) {
    annList.innerHTML = '<li class="empty-hint">Draw boxes on the image to add annotations.</li>';
    return;
  }

  annList.innerHTML = '';
  annotations.forEach(ann => {
    const li = document.createElement('li');
    li.className   = 'annotation-item' + (ann.id === selectedId ? ' selected' : '');
    li.dataset.id  = ann.id;
    li.title       = ann.label;

    li.innerHTML = `
      <div class="ann-dot"></div>
      <span class="ann-label">${escHtml(ann.label)}</span>
      <button class="ann-edit-btn" data-id="${ann.id}" title="Rename">&#9998;</button>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('ann-edit-btn')) return;
      setMode('select');
      selectedId = ann.id;
      deleteBtn.disabled = false;
      render();
      updateSidebar();
    });

    li.querySelector('.ann-edit-btn').addEventListener('click', () => renameAnnotation(ann));
    annList.appendChild(li);
  });
}

function renameAnnotation(ann) {
  const newLabel = prompt('Rename annotation:', ann.label);
  if (newLabel === null) return; // cancelled
  ann.label = newLabel.trim() || ann.label;
  render();
  updateSidebar();
}

// ─── Export ────────────────────────────────────────────────────────────────
function exportJSON() {
  if (!image) return;

  const data = {
    description: description.value,
    imageWidth:  canvas.width,
    imageHeight: canvas.height,
    annotations: annotations.map(a => ({
      id:     a.id,
      label:  a.label,
      x:      Math.round(a.x),
      y:      Math.round(a.y),
      width:  Math.round(a.w),
      height: Math.round(a.h),
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'annotations.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Utility ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
