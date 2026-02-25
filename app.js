// ── State ──────────────────────────────────────────────────────────────────
let imageLoaded = false;
let selected    = null;   // currently selected .text-overlay element
let overlayId   = 0;

// Drag state
let dragActive = false;
let dragOffX   = 0, dragOffY = 0;
let dragStartX = 0, dragStartY = 0;
let didDrag    = false;   // true if mouse moved enough to count as a drag

// ── DOM refs ───────────────────────────────────────────────────────────────
const fileInput      = document.getElementById('file-input');
const addTextBtn     = document.getElementById('add-text-btn');
const workspace      = document.getElementById('workspace');
const dropZone       = document.getElementById('drop-zone');
const dropHint       = document.getElementById('drop-hint');
const imageContainer = document.getElementById('image-container');
const photo          = document.getElementById('photo');

const stateEmpty = document.getElementById('state-empty');
const stateNoSel = document.getElementById('state-no-sel');
const stateEdit  = document.getElementById('state-edit');

const ctrlText   = document.getElementById('ctrl-text');
const ctrlFont   = document.getElementById('ctrl-font');
const ctrlSize   = document.getElementById('ctrl-size');
const sizeDisplay = document.getElementById('size-display');
const ctrlColor  = document.getElementById('ctrl-color');
const ctrlBold   = document.getElementById('ctrl-bold');
const ctrlItalic = document.getElementById('ctrl-italic');
const ctrlShadow = document.getElementById('ctrl-shadow');
const deleteBtn  = document.getElementById('delete-btn');

// ── File loading ───────────────────────────────────────────────────────────
// Use FileReader (works on file://, http://, everywhere)
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) loadFile(f);
  fileInput.value = '';   // allow same file to be re-selected
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    photo.onload = () => {
      // Fit image to the available workspace, never upscale
      const maxW  = workspace.clientWidth  - 48;
      const maxH  = workspace.clientHeight - 48;
      const scale = Math.min(1, maxW / photo.naturalWidth, maxH / photo.naturalHeight);
      const w     = Math.round(photo.naturalWidth  * scale);
      const h     = Math.round(photo.naturalHeight * scale);

      imageContainer.style.width  = w + 'px';
      imageContainer.style.height = h + 'px';
      photo.style.width   = '100%';
      photo.style.height  = '100%';

      // Remove any overlays from a previous image
      imageContainer.querySelectorAll('.text-overlay').forEach(el => el.remove());

      dropHint.style.display        = 'none';
      imageContainer.style.display  = 'block';
      imageLoaded = true;
      addTextBtn.disabled = false;

      deselect();
      setState('no-sel');
    };
    photo.onerror = () => alert('Could not display this image.');
    photo.src = evt.target.result;   // data: URL — always works
  };
  reader.onerror = () => alert('Could not read the file.');
  reader.readAsDataURL(file);
}

// ── Drag-and-drop onto the page ────────────────────────────────────────────
// Prevent the browser from navigating to the image in the same/new tab
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadFile(f);
});

// Visual highlight when dragging over the drop zone
dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});

// ── Add text ───────────────────────────────────────────────────────────────
addTextBtn.addEventListener('click', () => {
  if (!imageLoaded) return;
  // Place in the centre of the image
  addOverlay(
    imageContainer.offsetWidth  / 2,
    imageContainer.offsetHeight / 2
  );
});

function addOverlay(cx, cy) {
  const el = document.createElement('div');
  el.className = 'text-overlay';
  el.dataset.id = ++overlayId;

  // Default style
  el.style.fontSize   = '32px';
  el.style.fontFamily = 'Arial, sans-serif';
  el.style.color      = '#ffffff';
  el.style.fontWeight = 'normal';
  el.style.fontStyle  = 'normal';
  applyShadow(el, true);

  el.textContent = 'New Label';

  // Centre on the click point using transform; resolved to px on first drag
  el.style.left      = cx + 'px';
  el.style.top       = cy + 'px';
  el.style.transform = 'translate(-50%, -50%)';

  el.addEventListener('mousedown', (e) => {
    e.stopPropagation();    // don't bubble to imageContainer
    selectOverlay(el);
    dragInit(e, el);
  });

  imageContainer.appendChild(el);
  selectOverlay(el);

  // Select all text in sidebar so the user can immediately type
  ctrlText.focus();
  ctrlText.select();
}

// ── Selection ──────────────────────────────────────────────────────────────
function selectOverlay(el) {
  if (selected && selected !== el) selected.classList.remove('selected');
  selected = el;
  el.classList.add('selected');
  syncControlsFrom(el);
  setState('edit');
}

function deselect() {
  if (selected) {
    selected.classList.remove('selected');
    selected = null;
  }
}

// Click on image background → deselect
imageContainer.addEventListener('mousedown', (e) => {
  if (e.target === imageContainer || e.target === photo) {
    deselect();
    setState(imageLoaded ? 'no-sel' : 'empty');
  }
});

// ── Sync controls → overlay (live preview) ────────────────────────────────
ctrlText.addEventListener('input', () => {
  if (selected) selected.textContent = ctrlText.value;
});

ctrlFont.addEventListener('change', applyControls);
ctrlSize.addEventListener('input',  () => {
  sizeDisplay.textContent = ctrlSize.value;
  applyControls();
});
ctrlColor.addEventListener('input',  applyControls);
ctrlBold.addEventListener('change',  applyControls);
ctrlItalic.addEventListener('change', applyControls);
ctrlShadow.addEventListener('change', applyControls);

function applyControls() {
  if (!selected) return;
  selected.style.fontFamily = ctrlFont.value;
  selected.style.fontSize   = ctrlSize.value + 'px';
  selected.style.color      = ctrlColor.value;
  selected.style.fontWeight = ctrlBold.checked   ? 'bold'   : 'normal';
  selected.style.fontStyle  = ctrlItalic.checked ? 'italic' : 'normal';
  applyShadow(selected, ctrlShadow.checked);
}

function syncControlsFrom(el) {
  ctrlText.value  = el.textContent;
  ctrlFont.value  = el.style.fontFamily || 'Arial, sans-serif';
  ctrlSize.value  = parseInt(el.style.fontSize) || 32;
  sizeDisplay.textContent = ctrlSize.value;
  ctrlColor.value = rgbToHex(el.style.color) || '#ffffff';
  ctrlBold.checked   = el.style.fontWeight === 'bold';
  ctrlItalic.checked = el.style.fontStyle  === 'italic';
  ctrlShadow.checked = el.style.textShadow !== '' && el.style.textShadow !== 'none';
}

function applyShadow(el, on) {
  el.style.textShadow = on
    ? '1px 1px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.6)'
    : 'none';
}

// ── Delete ─────────────────────────────────────────────────────────────────
deleteBtn.addEventListener('click', () => {
  if (!selected) return;
  selected.remove();
  selected = null;
  setState('no-sel');
});

// ── Drag to reposition ─────────────────────────────────────────────────────
function dragInit(e, el) {
  // Resolve transform → explicit px so dragging is frame-of-reference-free
  const r  = el.getBoundingClientRect();
  const cr = imageContainer.getBoundingClientRect();
  el.style.left      = (r.left - cr.left) + 'px';
  el.style.top       = (r.top  - cr.top)  + 'px';
  el.style.transform = '';

  dragActive = true;
  didDrag    = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragOffX   = e.clientX - r.left;
  dragOffY   = e.clientY - r.top;

  el.classList.add('dragging');
  e.preventDefault();   // prevent text selection while dragging
}

document.addEventListener('mousemove', (e) => {
  if (!dragActive || !selected) return;

  // Only start moving after a small threshold (avoids jitter on click)
  if (!didDrag) {
    const d = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
    if (d < 4) return;
    didDrag = true;
  }

  const cr = imageContainer.getBoundingClientRect();
  // Clamp inside image bounds
  const x = Math.max(0, Math.min(e.clientX - cr.left - dragOffX, imageContainer.offsetWidth));
  const y = Math.max(0, Math.min(e.clientY - cr.top  - dragOffY, imageContainer.offsetHeight));

  selected.style.left = x + 'px';
  selected.style.top  = y + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragActive) return;
  dragActive = false;
  if (selected) selected.classList.remove('dragging');
  // Reset didDrag on next tick so the click handler (if any) sees the correct value
  setTimeout(() => { didDrag = false; }, 0);
});

// ── Sidebar state ──────────────────────────────────────────────────────────
function setState(s) {
  stateEmpty.style.display = s === 'empty'  ? '' : 'none';
  stateNoSel.style.display = s === 'no-sel' ? '' : 'none';
  stateEdit.style.display  = s === 'edit'   ? '' : 'none';
}

// ── Utility ────────────────────────────────────────────────────────────────
function rgbToHex(rgb) {
  if (!rgb || rgb.startsWith('#')) return rgb || '#ffffff';
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '#ffffff';
  return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
}
